// selection-bridge
// Two modes:
//   (no args)    — one-shot: return current selection as JSON
//   --monitor    — continuous: watch mouse events, emit JSON lines on selection
//   --replace    — replace current selection with stdin text

import AppKit
import Foundation
import ApplicationServices

let ownBundleID = "com.seleany.pro"

struct SelectionSnapshot: Encodable {
    let text: String
    let app: String
    let appName: String
    let url: String
    let editable: Bool
    let method: String
    let mouseX: Double
    let mouseY: Double
    let anchorX: Double?
    let anchorY: Double?
}

struct ReplaceResult: Encodable {
    let ok: Bool
    let method: String
}

struct UndoResult: Encodable {
    let ok: Bool
}

struct HealthStatus: Encodable {
    let accessibilityTrusted: Bool
}

struct ReplaceRequest: Decodable {
    let replacementText: String
    let expectedOriginalText: String?
}

struct AXSelectionContext {
    let element: AXUIElement
    let text: String
    let editable: Bool
    let range: NSRange
    let bounds: CGRect?
}

enum ReplaceError: String, Error {
    case missingTargetApp = "missing_target_app"
    case noValidSelection = "no_valid_selection"
    case selectionNotEditable = "selection_not_editable"
    case selectionMismatch = "selection_mismatch"
    case replaceFailed = "replace_failed"
}

// MARK: - Entry

func main() {
    if CommandLine.arguments.contains("--health") {
        runHealth()
        return
    }

    let trusted = AXIsProcessTrusted()
    if !trusted {
        printError("accessibility_not_trusted")
        exit(1)
    }

    if CommandLine.arguments.contains("--monitor") {
        runMonitor()
    } else if CommandLine.arguments.contains("--undo") {
        runUndo()
    } else if CommandLine.arguments.contains("--replace") {
        runReplace()
    } else {
        runOneShot()
    }
}

func runHealth() {
    printJSON(HealthStatus(accessibilityTrusted: AXIsProcessTrusted()))
    exit(0)
}

// MARK: - Monitor mode

func debugLog(_ msg: String) {
    FileHandle.standardError.write(Data("[bridge-debug] \(msg)\n".utf8))
}

/// Get the height of the primary display (the one with the menu bar).
/// NSScreen.main can return the key window's screen on multi-monitor setups,
/// which gives wrong values. The primary screen is always at NSScreen origin (0,0).
func primaryDisplayHeight() -> CGFloat {
    if let primary = NSScreen.screens.first(where: { $0.frame.origin == .zero }) {
        return primary.frame.height
    }
    return NSScreen.screens.first?.frame.height ?? NSScreen.main?.frame.height ?? 900
}

/// Convert AppKit point (bottom-left origin, primary screen) to
/// Quartz/top-left origin used by Tauri window positions.
func appKitToQuartz(_ point: NSPoint) -> CGPoint {
    return CGPoint(x: point.x, y: primaryDisplayHeight() - point.y)
}

func dragAnchor(start: NSPoint, end: NSPoint) -> (anchor: CGPoint, mouse: CGPoint)? {
    guard abs(start.x - end.x) > 2 || abs(start.y - end.y) > 2 else {
        return nil
    }

    let anchorAppKit = NSPoint(
        x: max(start.x, end.x),
        y: min(start.y, end.y)
    )

    return (
        anchor: appKitToQuartz(anchorAppKit),
        mouse: appKitToQuartz(end)
    )
}

func snapshotWithDragAnchor(_ snapshot: SelectionSnapshot, dragStart: NSPoint, dragEnd: NSPoint) -> SelectionSnapshot {
    guard let drag = dragAnchor(start: dragStart, end: dragEnd) else {
        return snapshot
    }

    return SelectionSnapshot(
        text: snapshot.text,
        app: snapshot.app,
        appName: snapshot.appName,
        url: snapshot.url,
        editable: snapshot.editable,
        method: snapshot.method,
        mouseX: drag.mouse.x,
        mouseY: drag.mouse.y,
        anchorX: drag.anchor.x,
        anchorY: drag.anchor.y
    )
}

func runMonitor() {
    debugLog("runMonitor() entered")
    var lastText = ""
    var lastAppBundleID = ""
    var hadSelection = false
    var dismissedText = ""
    var dismissedAppBundleID = ""
    var debounceItem: DispatchWorkItem?

    func emitClearIfNeeded(frontApp: NSRunningApplication?, mousePos: NSPoint, force: Bool = false) {
        let bundleID = frontApp?.bundleIdentifier ?? ""
        if bundleID == ownBundleID || (!force && !hadSelection) {
            return
        }

        if hadSelection {
            dismissedText = lastText
            dismissedAppBundleID = lastAppBundleID
        }
        hadSelection = false
        lastText = ""
        lastAppBundleID = ""

        let appName = frontApp?.localizedName ?? ""
        let mouseQuartz = appKitToQuartz(mousePos)
        printJSON(
            SelectionSnapshot(
                text: "",
                app: bundleID,
                appName: appName,
                url: "",
                editable: false,
                method: "clear",
                mouseX: mouseQuartz.x,
                mouseY: mouseQuartz.y,
                anchorX: nil,
                anchorY: nil
            )
        )
        fflush(stdout)
    }

    func processSelection(forceRefreshSameSelection: Bool = false, allowClipboard: Bool = false, canClear: Bool = true, allowDismissedRecapture: Bool = false, dragStart: NSPoint = .zero, dragEnd: NSPoint = .zero) {
        let frontApp = NSWorkspace.shared.frontmostApplication
        let bundleID = frontApp?.bundleIdentifier ?? ""

        if bundleID == ownBundleID {
            return
        }

        if let snapshot = captureSelection(allowClipboard: allowClipboard, dragStart: dragStart, dragEnd: dragEnd) {
            if snapshot.text.isEmpty {
                if canClear {
                    emitClearIfNeeded(frontApp: frontApp, mousePos: NSEvent.mouseLocation)
                }
                return
            }

            let isDismissedSelection =
                !allowDismissedRecapture
                && !dismissedText.isEmpty
                && snapshot.text == dismissedText
                && snapshot.app == dismissedAppBundleID

            if isDismissedSelection {
                return
            }

            let isSameSelection =
                hadSelection
                && snapshot.text == lastText
                && snapshot.app == lastAppBundleID

            if isSameSelection && !forceRefreshSameSelection {
                return
            }

            hadSelection = true
            lastText = snapshot.text
            lastAppBundleID = snapshot.app
            dismissedText = ""
            dismissedAppBundleID = ""
            printJSON(snapshot)
            fflush(stdout)
        } else if canClear {
            emitClearIfNeeded(frontApp: frontApp, mousePos: NSEvent.mouseLocation)
        }
        // When canClear is false (timer), do nothing if capture fails —
        // preserve existing selection state
    }

    var wasDragging = false
    var dragStartPos = NSPoint.zero  // mouse position at drag start

    NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .leftMouseUp, .rightMouseUp, .leftMouseDragged, .keyDown, .scrollWheel]) { event in
        if event.type == .leftMouseDown {
            debounceItem?.cancel()
            wasDragging = false
            dragStartPos = NSEvent.mouseLocation
            let frontApp = NSWorkspace.shared.frontmostApplication
            emitClearIfNeeded(frontApp: frontApp, mousePos: dragStartPos, force: true)
            return
        }
        if event.type == .leftMouseDragged {
            let currentPos = NSEvent.mouseLocation
            wasDragging = dragAnchor(start: dragStartPos, end: currentPos) != nil
            return
        }

        if event.type == .scrollWheel || event.type == .keyDown {
            debounceItem?.cancel()
            wasDragging = false
            let frontApp = NSWorkspace.shared.frontmostApplication
            emitClearIfNeeded(frontApp: frontApp, mousePos: NSEvent.mouseLocation, force: true)
            return
        }

        let mouseUpPos = NSEvent.mouseLocation
        let draggedAtMouseUp = event.type == .leftMouseUp
            && wasDragging
            && dragAnchor(start: dragStartPos, end: mouseUpPos) != nil
        let dragStartAtMouseUp = dragStartPos
        let dragEndAtMouseUp = mouseUpPos

        // Capture mouse position immediately at event time, before debounce delay
        let eventType = event.type
        let delay: TimeInterval =
            (eventType == .rightMouseUp || (eventType == .leftMouseUp && !draggedAtMouseUp))
            ? 0.05
            : 0.18
        debounceItem?.cancel()
        let work = DispatchWorkItem {
            let frontApp = NSWorkspace.shared.frontmostApplication
            let bundleID = frontApp?.bundleIdentifier ?? ""

            if bundleID == ownBundleID {
                return
            }

            // Right-click → clear
            if eventType == .rightMouseUp {
                emitClearIfNeeded(frontApp: frontApp, mousePos: NSEvent.mouseLocation, force: true)
                wasDragging = false
                return
            }

            // Plain click (no drag) → user clicked elsewhere, clear the bar
            if eventType == .leftMouseUp && !draggedAtMouseUp {
                emitClearIfNeeded(frontApp: frontApp, mousePos: NSEvent.mouseLocation, force: true)
                wasDragging = false
                return
            }

            let isDragEnd = eventType == .leftMouseUp && draggedAtMouseUp
            processSelection(
                forceRefreshSameSelection: false,
                allowClipboard: isDragEnd,
                canClear: false,  // only explicit click/right-click above should clear
                allowDismissedRecapture: isDragEnd,
                dragStart: dragStartAtMouseUp,
                dragEnd: dragEndAtMouseUp
            )
            wasDragging = false
        }
        debounceItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    NSWorkspace.shared.notificationCenter.addObserver(
        forName: NSWorkspace.didActivateApplicationNotification,
        object: nil,
        queue: .main
    ) { notification in
        let frontApp = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
        let bundleID = frontApp?.bundleIdentifier ?? ""
        if bundleID == ownBundleID || bundleID == lastAppBundleID {
            return
        }

        emitClearIfNeeded(frontApp: frontApp, mousePos: NSEvent.mouseLocation)
    }

    debugLog("Starting NSApplication run loop...")
    // NSEvent global monitors require an NSApplication run loop
    let app = NSApplication.shared
    app.setActivationPolicy(.accessory) // no dock icon
    app.run()
    debugLog("NSApplication.run() returned (unexpected)")
}

// MARK: - One-shot mode

func runOneShot() {
    guard let snapshot = captureSelection(), !snapshot.text.isEmpty else {
        printError("no_selection")
        exit(1)
    }
    printJSON(snapshot)
    exit(0)
}

func runReplace() {
    let args = CommandLine.arguments
    let replaceIndex = args.firstIndex(of: "--replace")
    let targetBundleID = replaceIndex.flatMap { index in
        let next = index + 1
        return next < args.count ? args[next] : nil
    }

    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard let request = try? JSONDecoder().decode(ReplaceRequest.self, from: data) else {
        printError("invalid_replace_payload")
        exit(1)
    }

    let replacement = request.replacementText
    guard !replacement.isEmpty else {
        printError("empty_replace_text")
        exit(1)
    }

    switch replaceSelection(
        with: replacement,
        expectedOriginalText: request.expectedOriginalText,
        targetBundleID: targetBundleID
    ) {
    case .success(let method):
        printJSON(ReplaceResult(ok: true, method: method))
        exit(0)
    case .failure(let errorCode):
        printError(errorCode.rawValue)
        exit(1)
    }
}

func runUndo() {
    let args = CommandLine.arguments
    let undoIndex = args.firstIndex(of: "--undo")
    let targetBundleID = undoIndex.flatMap { index in
        let next = index + 1
        return next < args.count ? args[next] : nil
    }

    guard let targetBundleID, !targetBundleID.isEmpty else {
        printError("missing_undo_target")
        exit(1)
    }

    guard undoLastReplacement(targetBundleID: targetBundleID) else {
        printError("undo_failed")
        exit(1)
    }

    printJSON(UndoResult(ok: true))
    exit(0)
}

// MARK: - Selection capture

func captureSelection(allowClipboard: Bool = false, dragStart: NSPoint = .zero, dragEnd: NSPoint = .zero) -> SelectionSnapshot? {
    guard let frontApp = NSWorkspace.shared.frontmostApplication else {
        debugLog("captureSelection: no frontmost app")
        return nil
    }

    let bundleID = frontApp.bundleIdentifier ?? ""
    let appName = frontApp.localizedName ?? ""
    let pid = frontApp.processIdentifier
    let mousePos = NSEvent.mouseLocation

    // Try AX
    if let result = getSelectionViaAX(pid: pid, bundleID: bundleID, appName: appName, mousePos: mousePos) {
        debugLog("captureSelection: AX success, \(result.text.count) chars")
        return snapshotWithDragAnchor(result, dragStart: dragStart, dragEnd: dragEnd)
    }
    debugLog("captureSelection: AX failed for \(bundleID) pid=\(pid)")

    // Try AppleScript for browsers
    let browsers = [
        "com.apple.Safari",
        "com.google.Chrome",
        "com.microsoft.edgemac",
        "company.thebrowser.Browser",
    ]
    if browsers.contains(bundleID) {
        if let result = getSelectionViaBrowser(bundleID: bundleID, appName: appName, mousePos: mousePos) {
            return snapshotWithDragAnchor(result, dragStart: dragStart, dragEnd: dragEnd)
        }
    }

    // Fallback: clipboard-based capture (simulate Cmd+C) — only on drag-end events
    guard allowClipboard else { return nil }
    debugLog("captureSelection: trying clipboard fallback")
    if let text = getSelectionViaClipboard() {
        let drag = dragAnchor(start: dragStart, end: dragEnd)
        let mouseQuartz = drag?.mouse ?? appKitToQuartz(dragEnd)

        debugLog("captureSelection: clipboard fallback success, \(text.count) chars, "
            + "dragStart=(\(Int(dragStart.x)),\(Int(dragStart.y))) "
            + "dragEnd=(\(Int(dragEnd.x)),\(Int(dragEnd.y))) "
            + "anchor=(\(Int(drag?.anchor.x ?? mouseQuartz.x)),\(Int(drag?.anchor.y ?? mouseQuartz.y))) "
            + "primaryH=\(Int(primaryDisplayHeight()))")

        return SelectionSnapshot(
            text: text,
            app: bundleID,
            appName: appName,
            url: "",
            editable: false,
            method: "clipboard",
            mouseX: mouseQuartz.x,
            mouseY: mouseQuartz.y,
            anchorX: drag.map { Double($0.anchor.x) },
            anchorY: drag.map { Double($0.anchor.y) }
        )
    }

    return nil
}

func replaceSelection(
    with text: String,
    expectedOriginalText: String?,
    targetBundleID: String?
) -> Result<String, ReplaceError> {
    let targetApp: NSRunningApplication? = {
        if let bundleID = targetBundleID, !bundleID.isEmpty {
            return NSRunningApplication.runningApplications(withBundleIdentifier: bundleID).first
        }
        return NSWorkspace.shared.frontmostApplication
    }()

    guard let targetApp else {
        return .failure(.missingTargetApp)
    }

    activate(app: targetApp)
    usleep(180_000)

    guard let selection = getAXSelectionContext(app: targetApp) else {
        return .failure(.noValidSelection)
    }

    guard selection.editable else {
        return .failure(.selectionNotEditable)
    }

    if let expectedOriginalText,
       !expectedOriginalText.isEmpty,
       selection.text != expectedOriginalText {
        return .failure(.selectionMismatch)
    }

    let prefersPaste = prefersPasteReplace(bundleID: targetApp.bundleIdentifier ?? "")
    let strategies: [(String, () -> Bool)] = prefersPaste
        ? [
            ("paste", {
                replaceSelectionViaPaste(
                    app: targetApp,
                    text: text,
                    expectedOriginalText: expectedOriginalText
                )
            }),
            ("ax", { replaceSelectionViaAX(selection: selection, text: text) }),
        ]
        : [
            ("ax", { replaceSelectionViaAX(selection: selection, text: text) }),
            ("paste", {
                replaceSelectionViaPaste(
                    app: targetApp,
                    text: text,
                    expectedOriginalText: expectedOriginalText
                )
            }),
        ]

    for (method, run) in strategies {
        if run() {
            return .success(method)
        }
    }

    return .failure(.replaceFailed)
}

func undoLastReplacement(targetBundleID: String) -> Bool {
    guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: targetBundleID).first else {
        return false
    }

    activate(app: app)
    usleep(160_000)
    sendCommandKey(keyCode: 6) // Z
    return true
}

func replaceSelectionViaAX(selection: AXSelectionContext, text: String) -> Bool {
    let setResult = AXUIElementSetAttributeValue(
        selection.element,
        kAXSelectedTextAttribute as CFString,
        text as CFTypeRef
    )

    return setResult == .success && verifyAXReplacement(selection: selection, replacementText: text)
}

func verifyAXReplacement(selection: AXSelectionContext, replacementText: String) -> Bool {
    let fullText = stringAttribute(element: selection.element, attribute: kAXValueAttribute as String) ?? ""
    let originalText = selection.text
    let nsFullText = fullText as NSString
    guard NSMaxRange(selection.range) <= nsFullText.length else {
        return false
    }

    let currentSlice = nsFullText.substring(with: selection.range)
    if currentSlice == replacementText {
        return true
    }

    // If the app collapsed the selection after a successful replace, ensure the original
    // selected text no longer occupies the same range and the replacement text is present.
    return currentSlice != originalText && fullText.contains(replacementText)
}

func replaceSelectionViaPaste(
    app: NSRunningApplication,
    text: String,
    expectedOriginalText: String?
) -> Bool {
    activate(app: app)
    usleep(180_000)

    guard let selection = getAXSelectionContext(app: app), selection.editable else {
        return false
    }

    if let expectedOriginalText,
       !expectedOriginalText.isEmpty,
       selection.text != expectedOriginalText {
        return false
    }

    let pasteboard = NSPasteboard.general
    let previousString = pasteboard.string(forType: .string)

    pasteboard.clearContents()
    guard pasteboard.setString(text, forType: .string) else {
        return false
    }

    sendCommandKey(keyCode: 9) // V
    usleep(120_000)

    pasteboard.clearContents()
    if let previousString, !previousString.isEmpty {
        _ = pasteboard.setString(previousString, forType: .string)
    }

    return true
}

/// Capture selected text by simulating Cmd+C, reading clipboard, then restoring it
func getSelectionViaClipboard() -> String? {
    let pasteboard = NSPasteboard.general
    let changeCount = pasteboard.changeCount
    let previousString = pasteboard.string(forType: .string)

    // Clear and simulate Cmd+C
    pasteboard.clearContents()
    sendCommandKey(keyCode: 8) // C key
    usleep(80_000) // 80ms for copy to complete

    // Check if clipboard changed
    guard pasteboard.changeCount != changeCount else {
        // Clipboard didn't change — copy failed or nothing selected
        // Restore previous content
        if let prev = previousString {
            pasteboard.clearContents()
            _ = pasteboard.setString(prev, forType: .string)
        }
        return nil
    }

    let copiedText = pasteboard.string(forType: .string)

    // Restore previous clipboard
    pasteboard.clearContents()
    if let prev = previousString, !prev.isEmpty {
        _ = pasteboard.setString(prev, forType: .string)
    }

    guard let text = copiedText, !text.isEmpty else {
        return nil
    }

    return text
}

func sendCommandKey(keyCode: CGKeyCode) {
    guard let source = CGEventSource(stateID: .combinedSessionState) else { return }

    let keyDown = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: true)
    keyDown?.flags = .maskCommand
    keyDown?.post(tap: .cghidEventTap)

    let keyUp = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: false)
    keyUp?.flags = .maskCommand
    keyUp?.post(tap: .cghidEventTap)
}

// MARK: - AX

func getSelectionViaAX(pid: pid_t, bundleID: String, appName: String, mousePos: NSPoint) -> SelectionSnapshot? {
    guard let app = NSRunningApplication(processIdentifier: pid),
          let selection = getAXSelectionContext(app: app, mousePos: mousePos) else {
        return nil
    }

    // Convert mouse position: NSEvent uses bottom-left origin, Tauri uses top-left.
    let mouseTopLeft = appKitToQuartz(mousePos)
    let resolvedAnchor = selectionAnchor(for: selection, mousePos: mousePos) ?? mouseTopLeft

    return SelectionSnapshot(
        text: selection.text,
        app: bundleID,
        appName: appName,
        url: "",
        editable: selection.editable,
        method: "ax",
        mouseX: mouseTopLeft.x,
        mouseY: mouseTopLeft.y,
        anchorX: Double(resolvedAnchor.x),
        anchorY: Double(resolvedAnchor.y)
    )
}

func activate(app: NSRunningApplication) {
    app.activate(options: [.activateIgnoringOtherApps])
}

func prefersPasteReplace(bundleID: String) -> Bool {
    let pasteFirstApps: Set<String> = [
        "com.apple.TextEdit",
        "com.apple.Notes",
        "notion.id",
    ]
    return pasteFirstApps.contains(bundleID)
}

func getAXSelectionContext(app: NSRunningApplication, mousePos: NSPoint? = nil) -> AXSelectionContext? {
    let appElement = AXUIElementCreateApplication(app.processIdentifier)

    // Strategy 1: Try focused element first (fast path)
    if let element = focusedElement(for: appElement) {
        let role = stringAttribute(element: element, attribute: kAXRoleAttribute as String) ?? ""
        if role != "AXWindow" && role != "AXApplication" {
            if let range = selectedRange(for: element),
               let text = selectedText(for: element, range: range),
               !text.isEmpty {
                debugLog("  AXContext: focused element hit, role=\(role)")
                return AXSelectionContext(
                    element: element, text: text, editable: isEditable(element: element),
                    range: range, bounds: boundsForRange(element: element, range: range))
            }
        }
    }

    // Strategy 2: Search only the focused window and the window under the
    // pointer. Searching every window can pick up stale selections from
    // background windows in multi-window apps such as TextEdit.
    var windowsRef: CFTypeRef?
    let winResult = AXUIElementCopyAttributeValue(appElement, kAXWindowsAttribute as CFString, &windowsRef)
    guard winResult == .success, let windows = windowsRef as? [AXUIElement] else {
        debugLog("  AXContext: cannot get windows, code=\(winResult.rawValue)")
        return nil
    }

    var candidateWindows: [AXUIElement] = []
    if let focusedWindow = focusedWindow(for: appElement) {
        candidateWindows.append(focusedWindow)
    }
    if let mousePos {
        let mouseTopLeft = appKitToQuartz(mousePos)
        candidateWindows.append(contentsOf: windows.filter { window in
            guard let frame = frameForElement(window) else {
                return false
            }
            return frame.insetBy(dx: -24, dy: -24).contains(mouseTopLeft)
        })
    }
    if candidateWindows.isEmpty, windows.count == 1, let onlyWindow = windows.first {
        candidateWindows.append(onlyWindow)
    }

    guard !candidateWindows.isEmpty else {
        debugLog("  AXContext: no focused or pointer-matched window")
        return nil
    }

    debugLog("  AXContext: searching \(candidateWindows.count) candidate windows for selected text")
    for window in candidateWindows {
        if let ctx = findSelectedTextInTree(window, depth: 0) {
            return ctx
        }
    }

    debugLog("  AXContext: no selected text in candidate windows")
    return nil
}

/// Search the AX tree for an element that has non-empty selected text
func findSelectedTextInTree(_ element: AXUIElement, depth: Int) -> AXSelectionContext? {
    if depth > 8 { return nil }

    // Check if this element has selected text
    if let range = selectedRange(for: element),
       let text = selectedText(for: element, range: range),
       !text.isEmpty {
        let role = stringAttribute(element: element, attribute: kAXRoleAttribute as String) ?? ""
        debugLog("  findSelected: HIT role=\(role) text=\(text.count) chars at depth \(depth)")
        return AXSelectionContext(
            element: element, text: text, editable: isEditable(element: element),
            range: range, bounds: boundsForRange(element: element, range: range))
    }

    // Recurse into children
    var childrenRef: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &childrenRef)
    guard result == .success, let children = childrenRef as? [AXUIElement] else {
        return nil
    }

    for child in children {
        if let ctx = findSelectedTextInTree(child, depth: depth + 1) {
            return ctx
        }
    }
    return nil
}

func selectionAnchor(for selection: AXSelectionContext, mousePos: NSPoint) -> CGPoint? {
    guard let bounds = selection.bounds else {
        return nil
    }

    let mouseTopLeft = appKitToQuartz(mousePos)
    let elementFrame = frameForElement(selection.element)
    let windowFrame = windowFrameForElement(selection.element)

    var candidateRects: [CGRect] = [bounds]
    if let elementFrame {
        candidateRects.append(bounds.offsetBy(dx: elementFrame.minX, dy: elementFrame.minY))
    }
    if let windowFrame {
        candidateRects.append(bounds.offsetBy(dx: windowFrame.minX, dy: windowFrame.minY))
    }

    let validRects = candidateRects.filter { rect in
        guard rect.width > 0, rect.height > 0 else { return false }

        let anchor = CGPoint(x: rect.maxX, y: rect.maxY)
        if let windowFrame,
           windowFrame.insetBy(dx: -80, dy: -80).contains(anchor) {
            return true
        }
        if let elementFrame,
           elementFrame.insetBy(dx: -80, dy: -80).contains(anchor) {
            return true
        }
        return false
    }

    let chosenRect = validRects.first ?? candidateRects.min { lhs, rhs in
        let lhsAnchor = CGPoint(x: lhs.maxX, y: lhs.maxY)
        let rhsAnchor = CGPoint(x: rhs.maxX, y: rhs.maxY)
        return squaredDistance(from: lhsAnchor, to: mouseTopLeft) <
            squaredDistance(from: rhsAnchor, to: mouseTopLeft)
    }

    guard let chosenRect else {
        return nil
    }

    return CGPoint(x: chosenRect.maxX.rounded(), y: chosenRect.maxY.rounded())
}

func squaredDistance(from lhs: CGPoint, to rhs: CGPoint) -> CGFloat {
    let dx = lhs.x - rhs.x
    let dy = lhs.y - rhs.y
    return (dx * dx) + (dy * dy)
}

func focusedElement(for appElement: AXUIElement) -> AXUIElement? {
    // Strategy 1: system-wide focused element
    let systemWide = AXUIElementCreateSystemWide()
    var systemFocusRef: CFTypeRef?
    let systemResult = AXUIElementCopyAttributeValue(
        systemWide,
        kAXFocusedUIElementAttribute as CFString,
        &systemFocusRef
    )
    if systemResult == .success, let element = systemFocusRef {
        let el = element as! AXUIElement
        let role = stringAttribute(element: el, attribute: kAXRoleAttribute as String) ?? ""
        if role != "AXWindow" && role != "AXApplication" {
            return el
        }
    }

    // Strategy 2: app-level focused element
    var focusedRef: CFTypeRef?
    let focusResult = AXUIElementCopyAttributeValue(
        appElement,
        kAXFocusedUIElementAttribute as CFString,
        &focusedRef
    )
    if focusResult == .success, let rawElement = focusedRef {
        let el = rawElement as! AXUIElement
        let role = stringAttribute(element: el, attribute: kAXRoleAttribute as String) ?? ""
        if role != "AXWindow" && role != "AXApplication" {
            return el
        }

        // Strategy 3: Got a window — walk children tree to find text elements
        if let textEl = findTextElement(in: el, depth: 0) {
            return textEl
        }
    }

    return nil
}

func focusedWindow(for appElement: AXUIElement) -> AXUIElement? {
    var windowRef: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(
        appElement,
        kAXFocusedWindowAttribute as CFString,
        &windowRef
    )
    guard result == .success, let windowRef else {
        return nil
    }

    return (windowRef as! AXUIElement)
}

/// Recursively search for a text-capable element in the AX tree (max depth 6)
func findTextElement(in element: AXUIElement, depth: Int) -> AXUIElement? {
    if depth > 6 { return nil }

    let role = stringAttribute(element: element, attribute: kAXRoleAttribute as String) ?? ""
    let textRoles: Set<String> = ["AXTextArea", "AXTextField", "AXComboBox", "AXSearchField", "AXWebArea", "AXStaticText"]
    if textRoles.contains(role) {
        debugLog("  findTextElement: found \(role) at depth \(depth)")
        return element
    }

    // Get children
    var childrenRef: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &childrenRef)
    guard result == .success, let children = childrenRef as? [AXUIElement] else {
        if depth == 0 {
            debugLog("  findTextElement: no children at depth 0, AX code=\(result.rawValue)")
        }
        return nil
    }

    if depth == 0 {
        debugLog("  findTextElement: window has \(children.count) children, searching...")
    }

    for child in children {
        if let found = findTextElement(in: child, depth: depth + 1) {
            return found
        }
    }

    return nil
}

func selectedRange(for element: AXUIElement) -> NSRange? {
    if let direct = rangeAttribute(element: element, attribute: kAXSelectedTextRangeAttribute as String) {
        return direct
    }

    let ranges = rangeArrayAttribute(element: element, attribute: kAXSelectedTextRangesAttribute as String)
    guard ranges.count == 1 else {
        return nil
    }
    return ranges.first
}

func selectedText(for element: AXUIElement, range: NSRange) -> String? {
    if let direct = stringAttribute(element: element, attribute: kAXSelectedTextAttribute as String),
       !direct.isEmpty {
        return direct
    }

    if let viaRange = parameterizedStringAttribute(element: element, range: range),
       !viaRange.isEmpty {
        return viaRange
    }

    guard let fullText = stringAttribute(element: element, attribute: kAXValueAttribute as String) else {
        return nil
    }

    let nsText = fullText as NSString
    guard NSMaxRange(range) <= nsText.length else {
        return nil
    }
    return nsText.substring(with: range)
}

func isEditable(element: AXUIElement) -> Bool {
    if let editable = boolAttribute(element: element, attribute: "AXEditable") {
        return editable
    }

    let role = stringAttribute(element: element, attribute: kAXRoleAttribute as String) ?? ""
    return ["AXTextArea", "AXTextField", "AXComboBox", "AXSearchField"].contains(role)
}

func stringAttribute(element: AXUIElement, attribute: String) -> String? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
    guard result == .success else {
        return nil
    }
    return value as? String
}

func boolAttribute(element: AXUIElement, attribute: String) -> Bool? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
    guard result == .success else {
        return nil
    }

    if let boolValue = value as? Bool {
        return boolValue
    }

    if let number = value as? NSNumber {
        return number.boolValue
    }

    return nil
}

func pointAttribute(element: AXUIElement, attribute: String) -> CGPoint? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
    guard result == .success, let value else {
        return nil
    }

    return cgPoint(from: value)
}

func sizeAttribute(element: AXUIElement, attribute: String) -> CGSize? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
    guard result == .success, let value else {
        return nil
    }

    return cgSize(from: value)
}

func frameForElement(_ element: AXUIElement) -> CGRect? {
    guard let origin = pointAttribute(element: element, attribute: kAXPositionAttribute as String),
          let size = sizeAttribute(element: element, attribute: kAXSizeAttribute as String) else {
        return nil
    }

    return CGRect(origin: origin, size: size)
}

func windowFrameForElement(_ element: AXUIElement) -> CGRect? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, kAXWindowAttribute as CFString, &value)
    guard result == .success, let value else {
        return nil
    }

    return frameForElement(value as! AXUIElement)
}

func rangeAttribute(element: AXUIElement, attribute: String) -> NSRange? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
    guard result == .success, let value else {
        return nil
    }

    return nsRange(from: value)
}

func rangeArrayAttribute(element: AXUIElement, attribute: String) -> [NSRange] {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
    guard result == .success, let values = value as? [Any] else {
        return []
    }

    return values.compactMap { nsRange(from: $0 as CFTypeRef) }
}

func nsRange(from value: CFTypeRef) -> NSRange? {
    guard CFGetTypeID(value) == AXValueGetTypeID() else {
        return nil
    }

    let axValue = value as! AXValue
    guard AXValueGetType(axValue) == .cfRange else {
        return nil
    }

    var rawRange = CFRange(location: 0, length: 0)
    guard AXValueGetValue(axValue, .cfRange, &rawRange),
          rawRange.location >= 0,
          rawRange.length > 0 else {
        return nil
    }

    return NSRange(location: rawRange.location, length: rawRange.length)
}

func parameterizedStringAttribute(element: AXUIElement, range: NSRange) -> String? {
    var rawRange = CFRange(location: range.location, length: range.length)
    guard let rangeValue = AXValueCreate(.cfRange, &rawRange) else {
        return nil
    }

    var value: CFTypeRef?
    let result = AXUIElementCopyParameterizedAttributeValue(
        element,
        kAXStringForRangeParameterizedAttribute as CFString,
        rangeValue,
        &value
    )
    guard result == .success else {
        return nil
    }

    return value as? String
}

func boundsForRange(element: AXUIElement, range: NSRange) -> CGRect? {
    var rawRange = CFRange(location: range.location, length: range.length)
    guard let rangeValue = AXValueCreate(.cfRange, &rawRange) else {
        return nil
    }

    var value: CFTypeRef?
    let result = AXUIElementCopyParameterizedAttributeValue(
        element,
        kAXBoundsForRangeParameterizedAttribute as CFString,
        rangeValue,
        &value
    )
    guard result == .success, let value else {
        return nil
    }

    return cgRect(from: value)
}

func cgRect(from value: CFTypeRef) -> CGRect? {
    guard CFGetTypeID(value) == AXValueGetTypeID() else {
        return nil
    }

    let axValue = value as! AXValue
    guard AXValueGetType(axValue) == .cgRect else {
        return nil
    }

    var rect = CGRect.zero
    guard AXValueGetValue(axValue, .cgRect, &rect) else {
        return nil
    }

    return rect
}

func cgPoint(from value: CFTypeRef) -> CGPoint? {
    guard CFGetTypeID(value) == AXValueGetTypeID() else {
        return nil
    }

    let axValue = value as! AXValue
    guard AXValueGetType(axValue) == .cgPoint else {
        return nil
    }

    var point = CGPoint.zero
    guard AXValueGetValue(axValue, .cgPoint, &point) else {
        return nil
    }

    return point
}

func cgSize(from value: CFTypeRef) -> CGSize? {
    guard CFGetTypeID(value) == AXValueGetTypeID() else {
        return nil
    }

    let axValue = value as! AXValue
    guard AXValueGetType(axValue) == .cgSize else {
        return nil
    }

    var size = CGSize.zero
    guard AXValueGetValue(axValue, .cgSize, &size) else {
        return nil
    }

    return size
}

// MARK: - Browser AppleScript

func getSelectionViaBrowser(bundleID: String, appName: String, mousePos: NSPoint) -> SelectionSnapshot? {
    var scriptText: String
    var urlScript: String?

    switch bundleID {
    case "com.apple.Safari":
        scriptText = """
            tell application "Safari"
                set selectedText to (do JavaScript "window.getSelection().toString()" in front document)
                return selectedText
            end tell
        """
        urlScript = """
            tell application "Safari"
                return URL of front document
            end tell
        """
    case "com.google.Chrome", "com.microsoft.edgemac":
        let appForScript = bundleID == "com.google.Chrome" ? "Google Chrome" : "Microsoft Edge"
        scriptText = """
            tell application "\(appForScript)"
                set selectedText to execute front window's active tab javascript "window.getSelection().toString()"
                return selectedText
            end tell
        """
        urlScript = """
            tell application "\(appForScript)"
                return URL of active tab of front window
            end tell
        """
    case "company.thebrowser.Browser":
        scriptText = """
            tell application "Arc"
                set selectedText to execute front window's active tab javascript "window.getSelection().toString()"
                return selectedText
            end tell
        """
        urlScript = """
            tell application "Arc"
                return URL of active tab of front window
            end tell
        """
    default:
        return nil
    }

    guard let text = runAppleScript(scriptText), !text.isEmpty else { return nil }
    let url = urlScript.flatMap { runAppleScript($0) } ?? ""
    let mouseQuartz = appKitToQuartz(mousePos)

    return SelectionSnapshot(
        text: text,
        app: bundleID,
        appName: appName,
        url: url,
        editable: false,
        method: "applescript",
        mouseX: mouseQuartz.x,
        mouseY: mouseQuartz.y,
        anchorX: nil,
        anchorY: nil
    )
}

func runAppleScript(_ source: String) -> String? {
    let script = NSAppleScript(source: source)
    var error: NSDictionary?
    let result = script?.executeAndReturnError(&error)
    if error != nil { return nil }
    return result?.stringValue
}

// MARK: - Output

func printJSON<T: Encodable>(_ snapshot: T) {
    let encoder = JSONEncoder()
    if let data = try? encoder.encode(snapshot),
       let json = String(data: data, encoding: .utf8) {
        print(json)
    }
}

func printError(_ code: String) {
    print("{\"error\":\"\(code)\"}")
}

main()

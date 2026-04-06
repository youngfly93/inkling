// selection-bridge
// Two modes:
//   (no args)    — one-shot: return current selection as JSON
//   --monitor    — continuous: watch mouse events, emit JSON lines on selection
//   --replace    — replace current selection with stdin text

import AppKit
import Foundation
import ApplicationServices

struct SelectionSnapshot: Encodable {
    let text: String
    let app: String
    let appName: String
    let url: String
    let editable: Bool
    let method: String
    let mouseX: Double
    let mouseY: Double
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

func runMonitor() {
    var lastText = ""
    var lastAppBundleID = ""
    var hadSelection = false
    var debounceItem: DispatchWorkItem?

    func emitClearIfNeeded(frontApp: NSRunningApplication?, mousePos: NSPoint) {
        let bundleID = frontApp?.bundleIdentifier ?? ""
        if bundleID == "com.seleany.pro" || !hadSelection {
            return
        }

        hadSelection = false
        lastText = ""
        lastAppBundleID = ""

        let appName = frontApp?.localizedName ?? ""
        let screenHeight = NSScreen.main?.frame.height ?? 900
        printJSON(
            SelectionSnapshot(
                text: "",
                app: bundleID,
                appName: appName,
                url: "",
                editable: false,
                method: "clear",
                mouseX: mousePos.x,
                mouseY: screenHeight - mousePos.y
            )
        )
        fflush(stdout)
    }

    func processSelection(forceRefreshSameSelection: Bool = false) {
        let frontApp = NSWorkspace.shared.frontmostApplication
        let bundleID = frontApp?.bundleIdentifier ?? ""

        if bundleID == "com.seleany.pro" {
            return
        }

        if let snapshot = captureSelection() {
            if snapshot.text.isEmpty {
                emitClearIfNeeded(frontApp: frontApp, mousePos: NSEvent.mouseLocation)
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
            printJSON(snapshot)
            fflush(stdout)
        } else {
            emitClearIfNeeded(frontApp: frontApp, mousePos: NSEvent.mouseLocation)
        }
    }

    var wasDragging = false

    NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .leftMouseUp, .rightMouseUp, .leftMouseDragged, .keyDown, .scrollWheel]) { event in
        if event.type == .leftMouseDown {
            wasDragging = false
            return
        }
        if event.type == .leftMouseDragged {
            wasDragging = true
            return
        }

        let eventType = event.type
        let delay: TimeInterval =
            (eventType == .rightMouseUp || (eventType == .leftMouseUp && !wasDragging))
            ? 0.05
            : 0.18
        debounceItem?.cancel()
        let work = DispatchWorkItem {
            let frontApp = NSWorkspace.shared.frontmostApplication
            let bundleID = frontApp?.bundleIdentifier ?? ""

            if bundleID == "com.seleany.pro" {
                return
            }

            // Right-click → clear
            if eventType == .rightMouseUp {
                emitClearIfNeeded(frontApp: frontApp, mousePos: NSEvent.mouseLocation)
                return
            }

            // Plain click (no drag) → user clicked elsewhere, clear the bar
            if eventType == .leftMouseUp && !wasDragging {
                emitClearIfNeeded(frontApp: frontApp, mousePos: NSEvent.mouseLocation)
                return
            }

            processSelection(forceRefreshSameSelection: eventType == .scrollWheel)
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
        if bundleID == "com.seleany.pro" || bundleID == lastAppBundleID {
            return
        }

        emitClearIfNeeded(frontApp: frontApp, mousePos: NSEvent.mouseLocation)
    }

    Timer.scheduledTimer(withTimeInterval: 0.45, repeats: true) { _ in
        processSelection()
    }

    // NSEvent global monitors require an NSApplication run loop
    let app = NSApplication.shared
    app.setActivationPolicy(.accessory) // no dock icon
    app.run()
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

func captureSelection() -> SelectionSnapshot? {
    guard let frontApp = NSWorkspace.shared.frontmostApplication else { return nil }

    let bundleID = frontApp.bundleIdentifier ?? ""
    let appName = frontApp.localizedName ?? ""
    let pid = frontApp.processIdentifier
    let mousePos = NSEvent.mouseLocation

    // Try AX
    if let result = getSelectionViaAX(pid: pid, bundleID: bundleID, appName: appName, mousePos: mousePos) {
        return result
    }

    // Try AppleScript for browsers
    let browsers = [
        "com.apple.Safari",
        "com.google.Chrome",
        "com.microsoft.edgemac",
        "company.thebrowser.Browser",
    ]
    if browsers.contains(bundleID) {
        if let result = getSelectionViaBrowser(bundleID: bundleID, appName: appName, mousePos: mousePos) {
            return result
        }
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
          let selection = getAXSelectionContext(app: app) else {
        return nil
    }

    // Convert mouse position: NSEvent uses bottom-left origin, we want top-left
    let screenHeight = NSScreen.main?.frame.height ?? 900
    return SelectionSnapshot(
        text: selection.text,
        app: bundleID,
        appName: appName,
        url: "",
        editable: selection.editable,
        method: "ax",
        mouseX: mousePos.x,
        mouseY: screenHeight - mousePos.y
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

func getAXSelectionContext(app: NSRunningApplication) -> AXSelectionContext? {
    let appElement = AXUIElementCreateApplication(app.processIdentifier)
    guard let element = focusedElement(for: appElement),
          let selectionRange = selectedRange(for: element),
          let selectionText = selectedText(for: element, range: selectionRange),
          !selectionText.isEmpty else {
        return nil
    }

    return AXSelectionContext(
        element: element,
        text: selectionText,
        editable: isEditable(element: element),
        range: selectionRange
    )
}

func focusedElement(for appElement: AXUIElement) -> AXUIElement? {
    var focusedElement: CFTypeRef?
    let focusResult = AXUIElementCopyAttributeValue(
        appElement,
        kAXFocusedUIElementAttribute as CFString,
        &focusedElement
    )
    guard focusResult == .success, let rawElement = focusedElement else {
        return nil
    }

    return (rawElement as! AXUIElement)
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
    let screenHeight = NSScreen.main?.frame.height ?? 900

    return SelectionSnapshot(
        text: text,
        app: bundleID,
        appName: appName,
        url: url,
        editable: false,
        method: "applescript",
        mouseX: mousePos.x,
        mouseY: screenHeight - mousePos.y
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

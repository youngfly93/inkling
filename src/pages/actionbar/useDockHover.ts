import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { CursorPosition, Selection, SurfaceMode } from "./types";

interface UseDockHoverOptions {
  surfaceMode: SurfaceMode;
  hasResult: boolean;
  askPanelOpen: boolean;
}

export function useDockHover({ surfaceMode, hasResult, askPanelOpen }: UseDockHoverOptions) {
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const dockItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const dockMetricsRef = useRef<{
    bounds: { left: number; right: number; top: number; bottom: number } | null;
    items: Array<{ id: string; centerX: number }>;
  }>({ bounds: null, items: [] });

  const setDockItemRef = useCallback(
    (id: string, node: HTMLButtonElement | null) => {
      dockItemRefs.current[id] = node;
    },
    []
  );

  const recomputeDockMetrics = useCallback(() => {
    const dockNode = dockRef.current;
    if (!dockNode) {
      dockMetricsRef.current = { bounds: null, items: [] };
      return;
    }

    const rect = dockNode.getBoundingClientRect();
    const items: Array<{ id: string; centerX: number }> = [];
    for (const [id, node] of Object.entries(dockItemRefs.current)) {
      if (!node) continue;
      const b = node.getBoundingClientRect();
      items.push({ id, centerX: b.x + b.width / 2 });
    }

    dockMetricsRef.current = {
      bounds: {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      },
      items,
    };
  }, []);

  const clearDockHover = useCallback(() => {
    setHoveredAction(null);
  }, []);

  const syncDockHoverFromClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      const metrics = dockMetricsRef.current;
      const bounds = metrics.bounds;
      if (!bounds) {
        clearDockHover();
        return;
      }

      const withinX = clientX >= bounds.left - 18 && clientX <= bounds.right + 18;
      const withinY = clientY >= bounds.top - 10 && clientY <= bounds.bottom + 12;

      if (!withinX || !withinY) {
        clearDockHover();
        return;
      }

      const items = metrics.items;
      if (!items.length) {
        return;
      }

      let nearestId: string | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (const item of items) {
        const distance = Math.abs(clientX - item.centerX);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestId = item.id;
        }
      }

      setHoveredAction(nearestId);
    },
    [clearDockHover]
  );

  const syncDockHoverFromSelection = useCallback(
    async (selection: Selection) => {
      if (selection.mouseX == null || selection.mouseY == null) {
        clearDockHover();
        return;
      }

      const win = getCurrentWindow();

      const applyPointerState = async () => {
        const [outerPos, scaleFactor] = await Promise.all([
          win.outerPosition(),
          win.scaleFactor(),
        ]);

        const clientX = (selection.mouseX! - outerPos.x) / scaleFactor;
        const clientY = (selection.mouseY! - outerPos.y) / scaleFactor;
        syncDockHoverFromClientPoint(clientX, clientY);
      };

      window.requestAnimationFrame(() => {
        void applyPointerState();
        window.requestAnimationFrame(() => {
          void applyPointerState();
        });
      });
    },
    [clearDockHover, syncDockHoverFromClientPoint]
  );

  useEffect(() => {
    if (surfaceMode !== "dock") {
      dockMetricsRef.current = { bounds: null, items: [] };
      return;
    }

    const dockNode = dockRef.current;
    if (!dockNode) return;

    let rafId = 0;
    const schedule = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        recomputeDockMetrics();
      });
    };

    schedule();

    const ro = new ResizeObserver(schedule);
    ro.observe(dockNode);
    for (const node of Object.values(dockItemRefs.current)) {
      if (node) ro.observe(node);
    }

    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [surfaceMode, hasResult, askPanelOpen, recomputeDockMetrics]);

  useEffect(() => {
    if (surfaceMode !== "dock" || hasResult || askPanelOpen) {
      clearDockHover();
      return;
    }

    let cancelled = false;
    let inFlight = false;
    const win = getCurrentWindow();

    const pollCursor = async () => {
      if (cancelled || inFlight || !dockRef.current) {
        return;
      }

      inFlight = true;
      try {
        const [cursor, outerPos, scaleFactor] = await Promise.all([
          invoke<CursorPosition>("get_cursor_position"),
          win.outerPosition(),
          win.scaleFactor(),
        ]);

        if (cancelled) {
          return;
        }

        const clientX = (cursor.x - outerPos.x) / scaleFactor;
        const clientY = (cursor.y - outerPos.y) / scaleFactor;
        syncDockHoverFromClientPoint(clientX, clientY);
      } catch {
        // Ignore transient window or cursor lookup errors while the action bar is hidden/repositioning.
      } finally {
        inFlight = false;
      }
    };

    void pollCursor();
    const interval = window.setInterval(() => {
      void pollCursor();
    }, 70);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [surfaceMode, hasResult, askPanelOpen, clearDockHover, syncDockHoverFromClientPoint]);

  return {
    dockRef,
    hoveredAction,
    setHoveredAction,
    setDockItemRef,
    clearDockHover,
    syncDockHoverFromClientPoint,
    syncDockHoverFromSelection,
  };
}

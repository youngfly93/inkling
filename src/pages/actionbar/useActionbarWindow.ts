import { useCallback, useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ORB_SHADOW_BLEED_X,
  ORB_SHADOW_BLEED_Y,
  ORB_WINDOW_HEIGHT,
  ORB_WINDOW_WIDTH,
  SURFACE_PADDING_TOP,
  SURFACE_PADDING_X,
  WINDOW_SHADOW_BLEED_X,
  WINDOW_SHADOW_BLEED_Y,
} from "./constants";
import type { ResultTone, SurfaceMode, WindowAnchor } from "./types";

interface UseActionbarWindowOptions {
  surfaceMode: SurfaceMode;
  hasResult: boolean;
  askPanelOpen: boolean;
  resultTitle: string | null;
  resultTone: ResultTone;
  statusMessage: string | null;
  showSettingsCta: boolean;
  replaceApplied: boolean;
  loading: string | null;
}

export function useActionbarWindow({
  surfaceMode,
  hasResult,
  askPanelOpen,
  resultTitle,
  resultTone,
  statusMessage,
  showSettingsCta,
  replaceApplied,
  loading,
}: UseActionbarWindowOptions) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const lastMeasuredWindowSize = useRef<{ width: number; height: number } | null>(null);

  const resizeActionBarWindow = useCallback(
    async (
      width: number,
      height: number,
      options?: { anchor?: WindowAnchor; screenPoint?: { x: number; y: number } | null }
    ) => {
      const win = getCurrentWindow();
      const { LogicalSize, PhysicalPosition } = await import("@tauri-apps/api/dpi");

      if (options?.anchor) {
        const [outerPos, innerSize, scaleFactor] = await Promise.all([
          win.outerPosition(),
          win.innerSize(),
          win.scaleFactor(),
        ]);
        const currentLogical = innerSize.toLogical(scaleFactor);
        let nextX = outerPos.x;
        let nextY = outerPos.y;

        if (options.anchor === "center") {
          nextX = outerPos.x - ((width - currentLogical.width) * scaleFactor) / 2;
          nextY = outerPos.y - ((height - currentLogical.height) * scaleFactor) / 2;
        } else if (options.anchor === "bottom-left") {
          nextY = outerPos.y - (height - currentLogical.height) * scaleFactor;
        } else if (options.anchor === "point-to-surface-top-left") {
          const pointX = outerPos.x + (currentLogical.width * scaleFactor) / 2;
          const pointY = outerPos.y + (currentLogical.height * scaleFactor) / 2;
          nextX = pointX - SURFACE_PADDING_X * scaleFactor;
          nextY = pointY - SURFACE_PADDING_TOP * scaleFactor;
        } else if (options.anchor === "screen-point-to-surface-top-left" && options.screenPoint) {
          nextX = options.screenPoint.x - SURFACE_PADDING_X * scaleFactor;
          nextY = options.screenPoint.y - SURFACE_PADDING_TOP * scaleFactor;
        } else if (options.anchor === "surface-top-left-to-point-center") {
          const pointX = outerPos.x + SURFACE_PADDING_X * scaleFactor;
          const pointY = outerPos.y + SURFACE_PADDING_TOP * scaleFactor;
          nextX = pointX - (width * scaleFactor) / 2;
          nextY = pointY - (height * scaleFactor) / 2;
        }

        await win.setSize(new LogicalSize(width, height));
        await win.setPosition(new PhysicalPosition(Math.round(nextX), Math.round(nextY)));
        return;
      }

      await win.setSize(new LogicalSize(width, height));
    },
    []
  );

  useEffect(() => {
    const node = contentRef.current;
    if (!node) {
      return;
    }

    let frame = 0;

    const syncWindowToContent = () => {
      if (surfaceMode === "orb" && !hasResult && !askPanelOpen) {
        lastMeasuredWindowSize.current = { width: ORB_WINDOW_WIDTH, height: ORB_WINDOW_HEIGHT };
        return;
      }

      const bleedX = surfaceMode === "orb" && !hasResult && !askPanelOpen
        ? ORB_SHADOW_BLEED_X
        : WINDOW_SHADOW_BLEED_X;
      const bleedY = surfaceMode === "orb" && !hasResult && !askPanelOpen
        ? ORB_SHADOW_BLEED_Y
        : WINDOW_SHADOW_BLEED_Y;
      const width = Math.ceil(node.scrollWidth + bleedX);
      const height = Math.ceil(node.scrollHeight + bleedY);
      const last = lastMeasuredWindowSize.current;

      if (last && Math.abs(last.width - width) < 2 && Math.abs(last.height - height) < 2) {
        return;
      }

      lastMeasuredWindowSize.current = { width, height };
      void resizeActionBarWindow(width, height, { anchor: "top-left" });
    };

    const scheduleSync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncWindowToContent);
    };

    scheduleSync();

    const observer = new ResizeObserver(() => {
      scheduleSync();
    });

    observer.observe(node);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [
    surfaceMode,
    hasResult,
    resultTitle,
    resultTone,
    statusMessage,
    showSettingsCta,
    replaceApplied,
    loading,
    askPanelOpen,
    resizeActionBarWindow,
  ]);

  return {
    contentRef,
    resizeActionBarWindow,
  };
}

import React, { useRef } from "react";
import { Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { DOCK_SIZE } from "./constants";
import { preventButtonFocus } from "./styles";

interface DockIconProps {
  id: string;
  children: React.ReactNode;
  label: string;
  cn: string;
  shortcut: string;
  hovered: boolean;
  isLoading: boolean;
  onHoverChange: (id: string, hovered: boolean) => void;
  setButtonRef: (id: string, node: HTMLButtonElement | null) => void;
  onClick: (id: string) => void;
}

export const DockIcon = React.memo(function DockIcon({
  id,
  children,
  label,
  cn,
  shortcut,
  hovered,
  isLoading,
  onHoverChange,
  setButtonRef,
  onClick,
}: DockIconProps) {
  const ref = useRef<HTMLButtonElement | null>(null);

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "flex-end" }}>
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{
              type: "spring",
              mass: 0.2,
              stiffness: 420,
              damping: 26,
            }}
            style={{
              position: "absolute",
              bottom: "calc(100% + 10px)",
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              padding: "5px 8px",
              borderRadius: 10,
              background: "#ffffff",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid rgba(10,10,10,0.1)",
              color: "#0a0a0a",
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              zIndex: 10,
              boxShadow: "0 10px 22px rgba(0,0,0,0.1)",
            }}
          >
            <span>{label}</span>
            <span
              style={{
                color: "rgba(10,10,10,0.46)",
                fontSize: 10,
                fontWeight: 500,
                lineHeight: 1,
              }}
            >
              {cn} · {shortcut}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.button
        ref={(node) => {
          ref.current = node;
          setButtonRef(id, node);
        }}
        type="button"
        className={`dock-icon ${hovered ? "dock-icon-hovered" : ""}`}
        animate={{ scale: hovered ? 1.06 : 1, y: hovered ? -1 : 0 }}
        whileTap={{ scale: 0.9 }}
        transition={{ type: "spring", mass: 0.15, stiffness: 600, damping: 22 }}
        style={{
          width: DOCK_SIZE,
          height: DOCK_SIZE,
          color: hovered ? "#ffffff" : "#0a0a0a",
          willChange: "transform",
          backfaceVisibility: "hidden",
        }}
        onMouseEnter={() => {
          onHoverChange(id, true);
        }}
        onMouseLeave={() => onHoverChange(id, false)}
        onMouseDown={preventButtonFocus}
        aria-label={label}
        data-dock-id={id}
        onClick={() => onClick(id)}
      >
        <motion.div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isLoading ? <Loader2 size={15} className="spin" /> : children}
        </motion.div>
      </motion.button>
    </div>
  );
});

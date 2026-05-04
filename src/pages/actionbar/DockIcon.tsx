import React, { useRef } from "react";
import { Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { DOCK_SIZE } from "./constants";
import { preventButtonFocus, ui } from "./styles";

interface DockIconProps {
  id: string;
  children: React.ReactNode;
  label: string;
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
  hovered,
  isLoading,
  onHoverChange,
  setButtonRef,
  onClick,
}: DockIconProps) {
  const ref = useRef<HTMLButtonElement | null>(null);

  return (
    <div style={{ display: "flex", alignItems: "flex-end" }}>
      <motion.button
        ref={(node) => {
          ref.current = node;
          setButtonRef(id, node);
        }}
        type="button"
        className={`dock-icon ${hovered ? "dock-icon-hovered" : ""}`}
        animate={{ scale: hovered ? 1.02 : 1 }}
        whileTap={{ scale: 0.96 }}
        transition={{ duration: 0.12, ease: "easeOut" }}
        style={{
          width: DOCK_SIZE,
          height: DOCK_SIZE,
          color: hovered ? ui.color.white : ui.color.ink,
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
          {isLoading ? <Loader2 size={13} className="spin" /> : children}
        </motion.div>
      </motion.button>
    </div>
  );
});

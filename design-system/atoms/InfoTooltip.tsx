"use client";

import { useState } from "react";
import { cn } from "../utils";

export interface InfoTooltipProps {
  text: string;
  side?: "top" | "bottom";
  className?: string;
}

/** Ícono "?" con popover de ayuda — hover en desktop, tap en touch. */
export function InfoTooltip({ text, side = "top", className }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        onBlur={() => setOpen(false)}
        aria-label="Ayuda"
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-cadet-gray text-cadet-gray text-[9px] font-bold leading-none cursor-help hover:border-erie-black hover:text-erie-black transition-colors"
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          className={cn(
            "absolute z-50 w-56 rounded-[0.5rem] bg-erie-black text-white text-xs leading-relaxed px-3 py-2 shadow-lg pointer-events-none",
            "left-1/2 -translate-x-1/2",
            side === "top" ? "bottom-full mb-2" : "top-full mt-2"
          )}
        >
          {text}
        </span>
      )}
    </span>
  );
}

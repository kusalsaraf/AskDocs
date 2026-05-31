"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface CitationBadgeProps {
  id: number;
  isActive?: boolean;
  onClick: () => void;
}

export function CitationBadge({ id, isActive, onClick }: CitationBadgeProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "inline-flex items-center justify-center font-mono text-[10px] font-semibold",
        "h-[18px] min-w-[18px] px-1 rounded mx-0.5",
        "transition-all duration-150 cursor-pointer select-none",
        "relative top-[-1px]",
        isActive
          ? "bg-indigo-500 text-white ring-2 ring-indigo-400/40"
          : "bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/30 hover:text-indigo-300 ring-1 ring-indigo-500/20"
      )}
      aria-label={`View source ${id}`}
    >
      {id}
    </button>
  );
}

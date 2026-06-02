"use client";

import React from "react";
import { X, FileText } from "lucide-react";
import type { Citation } from "@/lib/types/domain";
import { cn } from "@/lib/utils";

interface SourcePanelProps {
  citation: Citation | null;
  onClose: () => void;
}

export function SourcePanel({ citation, onClose }: SourcePanelProps) {
  if (!citation) return null;

  return (
    <aside
      className={cn(
        "w-[320px] shrink-0 border-l border-border/80 bg-card flex flex-col",
        "animate-slide-in-right"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-border/60">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
            <FileText className="h-3.5 w-3.5 text-indigo-400" />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-[11px] text-foreground/70 leading-snug truncate">
              {citation.documentName}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {citation.pageNumber != null ? `Page ${citation.pageNumber}` : 'Unknown page'}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground/70 hover:bg-muted transition-colors"
          aria-label="Close source panel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Excerpt body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Source excerpt
        </p>
        <div className="rounded-lg bg-muted/60 border border-border/40 p-3.5">
          <p className="text-sm text-foreground/70 leading-relaxed whitespace-pre-wrap">
            {citation.excerpt || 'No excerpt available.'}
          </p>
        </div>
      </div>

    </aside>
  );
}


"use client";

import React from "react";
import { X, FileText, ExternalLink } from "lucide-react";
import { Citation } from "@/lib/types";
import { formatFileSize, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SourcePanelProps {
  citation: Citation | null;
  onClose: () => void;
}

export function SourcePanel({ citation, onClose }: SourcePanelProps) {
  if (!citation) return null;

  // Split excerpt at the highlighted text to render the highlight
  const parts = citation.excerpt.split(citation.highlightedText);

  return (
    <aside
      className={cn(
        "w-[320px] shrink-0 border-l border-zinc-800/80 bg-zinc-900 flex flex-col",
        "animate-slide-in-right"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-zinc-800/60">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-800">
            <FileText className="h-3.5 w-3.5 text-indigo-400" />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-[11px] text-zinc-300 leading-snug truncate">
              {citation.documentName}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Page {citation.pageNumber}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          aria-label="Close source panel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Excerpt body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-3">
          Source excerpt
        </p>
        <div className="rounded-lg bg-zinc-800/60 border border-zinc-700/40 p-3.5">
          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
            {parts.map((part, i) => (
              <React.Fragment key={i}>
                {part}
                {i < parts.length - 1 && (
                  <mark className="cited-highlight not-italic">
                    {citation.highlightedText}
                  </mark>
                )}
              </React.Fragment>
            ))}
          </p>
        </div>

        {/* Metadata */}
        <div className="mt-5 space-y-2.5">
          <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
            Document details
          </p>
          <div className="space-y-2">
            <MetaRow label="Uploaded" value={formatRelativeTime(citation.uploadedAt)} />
            <MetaRow label="Size" value={formatFileSize(citation.fileSize)} />
            <MetaRow label="By" value={citation.uploadedBy.name} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3.5 border-t border-zinc-800/60">
        <Button variant="outline" size="sm" className="w-full gap-2">
          <ExternalLink className="h-3.5 w-3.5" />
          View full document
        </Button>
      </div>
    </aside>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xs text-zinc-300 font-medium truncate max-w-[160px] text-right">
        {value}
      </span>
    </div>
  );
}

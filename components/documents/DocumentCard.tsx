"use client";

import React, { useState } from "react";
import { FileText, MoreHorizontal } from "lucide-react";
import { Document, DocumentType } from "@/lib/types";
import { cn, formatFileSize, formatRelativeTime } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const FILE_STYLES: Record<DocumentType, { bg: string; icon: string }> = {
  pdf:  { bg: "bg-rose-500/15",    icon: "text-rose-400"    },
  docx: { bg: "bg-blue-500/15",    icon: "text-blue-400"    },
  xlsx: { bg: "bg-emerald-500/15", icon: "text-emerald-400" },
  txt:  { bg: "bg-zinc-500/15",    icon: "text-zinc-400"    },
  md:   { bg: "bg-violet-500/15",  icon: "text-violet-400"  },
};

// ── Grid card ────────────────────────────────────────────────────────────────

interface DocumentCardProps {
  document: Document;
  onClick?: () => void;
}

export function DocumentCard({ document: doc, onClick }: DocumentCardProps) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const showKebab = hovered || menuOpen;
  const styles = FILE_STYLES[doc.type] ?? FILE_STYLES.txt;

  const meta = [
    doc.pageCount > 0 ? `${doc.pageCount} pages` : null,
    formatFileSize(doc.size),
    `${formatRelativeTime(doc.uploadedAt)} by ${doc.uploadedBy.name}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      className={cn(
        "relative flex flex-col rounded-xl border bg-zinc-900 p-4 cursor-pointer",
        "transition-all duration-150 select-none",
        hovered || menuOpen
          ? "border-indigo-500/25 shadow-lg shadow-black/30"
          : "border-zinc-800"
      )}
    >
      {/* Kebab — absolute top-right, appears on hover */}
      <div
        className={cn(
          "absolute top-2.5 right-2.5 z-10 transition-opacity duration-100",
          showKebab ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-800/90 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
              aria-label="Document options"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={(e) => e.stopPropagation()}>Rename</DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => e.stopPropagation()}>Download</DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => e.stopPropagation()}>View source</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => e.stopPropagation()}
              className="text-rose-400 focus:text-rose-300 focus:bg-rose-500/10"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* File type icon */}
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", styles.bg)}>
        <FileText className={cn("h-4 w-4", styles.icon)} />
      </div>

      {/* Title */}
      <h3 className="mt-3 pr-2 text-sm font-medium text-zinc-100 line-clamp-2 leading-snug">
        {doc.name}
      </h3>

      {/* Bottom row: metadata + status badge */}
      <div className="mt-auto pt-3 flex items-end justify-between gap-2">
        <p className="text-[11px] text-zinc-500 leading-relaxed min-w-0">
          {meta}
        </p>
        <StatusBadge status={doc.status} className="shrink-0" />
      </div>
    </div>
  );
}

// ── List row ─────────────────────────────────────────────────────────────────

interface DocumentRowProps {
  document: Document;
  onClick?: () => void;
}

export function DocumentRow({ document: doc, onClick }: DocumentRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const styles = FILE_STYLES[doc.type] ?? FILE_STYLES.txt;

  return (
    <div
      onClick={onClick}
      className="group grid items-center gap-4 px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors cursor-pointer"
      style={{ gridTemplateColumns: "1fr 72px 88px 128px 100px auto auto" }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", styles.bg)}>
          <FileText className={cn("h-3.5 w-3.5", styles.icon)} />
        </div>
        <span className="truncate text-sm text-zinc-200 font-medium">{doc.name}</span>
      </div>
      <span className="text-xs text-zinc-500">{doc.pageCount > 0 ? `${doc.pageCount} pp.` : "—"}</span>
      <span className="text-xs text-zinc-500">{formatFileSize(doc.size)}</span>
      <span className="text-xs text-zinc-500 truncate">{doc.uploadedBy.name}</span>
      <span className="text-xs text-zinc-500">{formatRelativeTime(doc.uploadedAt)}</span>
      <StatusBadge status={doc.status} />
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-zinc-700 opacity-0 group-hover:opacity-100 transition-all"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem>Rename</DropdownMenuItem>
          <DropdownMenuItem>Download</DropdownMenuItem>
          <DropdownMenuItem>View source</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-rose-400 focus:text-rose-300 focus:bg-rose-500/10">Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

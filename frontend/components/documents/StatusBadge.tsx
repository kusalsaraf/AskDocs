import React from "react";
import { Loader2 } from "lucide-react";
import type { DocumentStatus } from "@/lib/types/domain";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<
  DocumentStatus,
  { label: string; className: string; spinner?: boolean }
> = {
  pending: {
    label: "Pending",
    className: "bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/20",
    spinner: true,
  },
  ready: {
    label: "Ready",
    className: "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20",
  },
  processing: {
    label: "Processing",
    className: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20",
    spinner: true,
  },
  failed: {
    label: "Failed",
    className: "bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/20",
  },
};

interface StatusBadgeProps {
  status: DocumentStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        config.className,
        className
      )}
    >
      {config.spinner && (
        <Loader2 className="h-2.5 w-2.5 animate-spin shrink-0" />
      )}
      {config.label}
    </span>
  );
}

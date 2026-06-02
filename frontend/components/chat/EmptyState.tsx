"use client";

import React from "react";
import { Sparkles } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 animate-fade-in">
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 ring-1 ring-indigo-500/20">
        <Sparkles className="h-6 w-6 text-indigo-400" />
      </div>
      <h2 className="text-xl font-medium text-foreground tracking-tight mb-2">
        What do you want to know?
      </h2>
      <p className="text-sm text-muted-foreground text-center max-w-sm leading-relaxed">
        Ask a question and get answers grounded in your team&apos;s documents,
        with inline citations linking back to the source.
      </p>
    </div>
  );
}

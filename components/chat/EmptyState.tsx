"use client";

import React from "react";
import { Sparkles } from "lucide-react";

interface EmptyStateProps {
  onExampleClick: (question: string) => void;
}

const EXAMPLES = [
  "What is our refund policy for annual plan customers?",
  "Summarize the data retention requirements under GDPR for our product.",
  "What hardware is a new employee eligible to expense?",
  "What's the SLA uptime commitment for enterprise tier customers?",
];

export function EmptyState({ onExampleClick }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 animate-fade-in">
      {/* Icon */}
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 ring-1 ring-indigo-500/20">
        <Sparkles className="h-6 w-6 text-indigo-400" />
      </div>

      {/* Heading */}
      <h2 className="text-xl font-medium text-zinc-100 tracking-tight mb-2">
        What do you want to know?
      </h2>
      <p className="text-sm text-zinc-500 text-center max-w-sm mb-8 leading-relaxed">
        Ask a question and get answers grounded in your team&apos;s documents,
        with inline citations linking back to the source.
      </p>

      {/* Example chips */}
      <div className="flex flex-col gap-2 w-full max-w-md">
        {EXAMPLES.map((q) => (
          <button
            key={q}
            onClick={() => onExampleClick(q)}
            className="group flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-left text-sm text-zinc-400 transition-all duration-150 hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <span className="shrink-0 text-zinc-600 group-hover:text-zinc-400 transition-colors">
              →
            </span>
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

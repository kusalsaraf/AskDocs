"use client";

import React, { useRef, useEffect, KeyboardEvent } from "react";
import { Paperclip, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/hooks/useWorkspace";
import { useProvider } from "@/lib/hooks/useProviders";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ value, onChange, onSubmit, disabled, placeholder }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { activeWorkspace } = useWorkspace();
  const { data: providerData } = useProvider(activeWorkspace?.id);

  // Auto-resize up to 6 lines
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = 22 * 6 + 24;
    el.style.height = Math.min(el.scrollHeight, maxHeight) + "px";
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !disabled) {
      e.preventDefault();
      if (value.trim()) onSubmit();
    }
  };

  const canSubmit = value.trim().length > 0 && !disabled;

  const modelLabel = (() => {
    if (!providerData) return "loading…";
    if ("using_platform_default" in providerData) return "platform default";
    return `${providerData.model_name} · ${providerData.provider_name}`;
  })();

  return (
    <div className="px-4 pb-4 pt-2">
      <div
        className={cn(
          "flex items-end gap-2 rounded-xl border bg-muted/80 px-3 py-2.5",
          "border-border/50 transition-all duration-150",
          "focus-within:border-indigo-500/50 focus-within:bg-muted focus-within:ring-2 focus-within:ring-indigo-500/10"
        )}
      >
        {/* Paperclip */}
        <button
          type="button"
          aria-label="Attach file"
          className="shrink-0 mb-0.5 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground/70 hover:bg-muted transition-colors"
        >
          <Paperclip className="h-4 w-4" />
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? "Ask anything about your documents…"}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 leading-relaxed py-0.5"
          style={{ minHeight: "22px" }}
        />

        {/* Model label + send button */}
        <div className="flex items-center gap-2 shrink-0 mb-0.5">
          <span
            title={modelInfo ? `Provider: ${modelInfo.provider}` : undefined}
            className="font-mono text-[10px] text-muted-foreground/60 hidden sm:block select-none cursor-default"
          >
            {modelLabel}
          </span>
          <button
            onClick={() => canSubmit && onSubmit()}
            disabled={!canSubmit}
            aria-label="Send message"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-150",
              canSubmit
                ? "bg-indigo-500 text-white hover:bg-indigo-400 active:bg-indigo-600 shadow-sm"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>

      <p className="mt-2 text-center text-[11px] text-muted-foreground/60">
        AskDocs can make mistakes. Verify important information.
      </p>
    </div>
  );
}

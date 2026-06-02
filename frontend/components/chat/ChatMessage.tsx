"use client";

import React, { useState } from "react";
import { ThumbsUp, ThumbsDown, Copy, RotateCcw, Sparkles, Check, AlertCircle } from "lucide-react";
import type { Message, Citation } from "@/lib/types/domain";
import { CitationBadge } from "./CitationBadge";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  message: Message
  activeCitationId: number | null
  onCitationClick: (citation: Citation) => void
  onRegenerate?: () => void
}

export function ChatMessage({ message, activeCitationId, onCitationClick, onRegenerate }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (message.role === "user") {
    return (
      <div className="flex justify-end px-4 animate-fade-in">
        <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-muted px-4 py-3">
          <p className="text-sm text-foreground leading-relaxed">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="group px-4 animate-fade-in">
      <div className="flex gap-3">
        {/* Sparkle icon */}
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 ring-1 ring-indigo-500/20">
          <Sparkles className="h-3 w-3 text-indigo-400" />
        </div>

        <div className="flex-1 min-w-0 pb-2">
          {/* Message content */}
          <div className={cn("text-sm text-foreground leading-relaxed", message.isStreaming && "streaming-cursor")}>
            <MarkdownContent
              content={message.content}
              citations={message.citations}
              activeCitationId={activeCitationId}
              onCitationClick={onCitationClick}
            />
          </div>

          {/* Stream error */}
          {message.streamError && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {message.streamError}
            </div>
          )}

          {/* Action row — visible on group hover */}
          {!message.isStreaming && (
            <div className="mt-3 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <ActionButton
                icon={feedback === "up" ? <ThumbsUp className="h-3.5 w-3.5 fill-current text-indigo-400" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                label="Good response"
                onClick={() => setFeedback("up")}
                active={feedback === "up"}
              />
              <ActionButton
                icon={feedback === "down" ? <ThumbsDown className="h-3.5 w-3.5 fill-current text-rose-400" /> : <ThumbsDown className="h-3.5 w-3.5" />}
                label="Poor response"
                onClick={() => setFeedback("down")}
                active={feedback === "down"}
              />
              <ActionButton
                icon={copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                label={copied ? "Copied" : "Copy"}
                onClick={handleCopy}
              />
              <ActionButton
                icon={<RotateCcw className="h-3.5 w-3.5" />}
                label="Regenerate"
                onClick={() => onRegenerate?.()}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
        active
          ? "text-foreground bg-muted/50"
          : "text-muted-foreground hover:text-foreground/70 hover:bg-muted"
      )}
    >
      {icon}
    </button>
  );
}

// ── Inline markdown + citation renderer ──────────────────────────────────────

interface MarkdownContentProps {
  content: string;
  citations: Citation[];
  activeCitationId: number | null;
  onCitationClick: (citation: Citation) => void;
}

function MarkdownContent({ content, citations, activeCitationId, onCitationClick }: MarkdownContentProps) {
  const citationMap = new Map(citations.map((c) => [c.id, c]));
  const blocks = content.split(/\n\n+/);

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        // Numbered list
        if (/^(\d+\. .+)(\n\d+\. .+)*$/.test(block.trim())) {
          const items = block.trim().split(/\n/);
          return (
            <ol key={i} className="space-y-1 pl-0">
              {items.map((item, j) => {
                const text = item.replace(/^\d+\.\s*/, "");
                return (
                  <li key={j} className="flex gap-2.5 text-sm">
                    <span className="font-mono text-xs text-muted-foreground mt-[2px] shrink-0 w-4 text-right">
                      {j + 1}.
                    </span>
                    <span>{renderInline(text, citationMap, activeCitationId, onCitationClick)}</span>
                  </li>
                );
              })}
            </ol>
          );
        }

        // Bullet list
        if (block.trim().startsWith("- ")) {
          const items = block.trim().split(/\n- /);
          return (
            <ul key={i} className="space-y-1.5 pl-0">
              {items.map((item, j) => {
                const text = item.replace(/^- /, "");
                return (
                  <li key={j} className="flex gap-2.5 text-sm">
                    <span className="text-muted-foreground/60 mt-[6px] shrink-0 h-1 w-1 rounded-full bg-zinc-500 ml-1" />
                    <span>{renderInline(text, citationMap, activeCitationId, onCitationClick)}</span>
                  </li>
                );
              })}
            </ul>
          );
        }

        // Code block
        if (block.startsWith("```")) {
          const code = block.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
          return (
            <pre key={i} className="rounded-lg bg-muted/80 border border-border/50 px-4 py-3 overflow-x-auto">
              <code className="font-mono text-xs text-foreground/70">{code}</code>
            </pre>
          );
        }

        // Normal paragraph
        return (
          <p key={i} className="text-sm leading-relaxed">
            {renderInline(block, citationMap, activeCitationId, onCitationClick)}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(
  text: string,
  citationMap: Map<number, Citation>,
  activeCitationId: number | null,
  onCitationClick: (citation: Citation) => void
): React.ReactNode[] {
  // Split by **bold**, `code`, and [n] patterns
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[\d+\])/g;
  const parts = text.split(pattern);

  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (/^`[^`]+`$/.test(part)) {
      return (
        <code key={i} className="font-mono text-xs bg-muted border border-border/50 rounded px-1.5 py-0.5 text-foreground/70">
          {part.slice(1, -1)}
        </code>
      );
    }
    const citMatch = part.match(/^\[(\d+)\]$/);
    if (citMatch) {
      const id = parseInt(citMatch[1]);
      const citation = citationMap.get(id);
      if (citation) {
        return (
          <CitationBadge
            key={i}
            id={id}
            isActive={activeCitationId === id}
            onClick={() => onCitationClick(citation)}
          />
        );
      }
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

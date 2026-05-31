"use client";

import React, { useState, useRef, useEffect } from "react";
import { Share2, MoreHorizontal, Pencil, Check } from "lucide-react";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import { SourcePanel } from "@/components/chat/SourcePanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { mockConversation, mockCitations } from "@/lib/mock-data";
import { Citation, Message } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function ConversationPage() {
  const [messages, setMessages] = useState<Message[]>(mockConversation.messages);
  const [title, setTitle] = useState(mockConversation.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const [input, setInput] = useState("");
  const [activeCitation, setActiveCitation] = useState<Citation | null>(mockCitations[0]);
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const initialMessageCount = useRef(mockConversation.messages.length);

  // Only auto-scroll when NEW messages are added (not on initial render)
  useEffect(() => {
    if (messages.length > initialMessageCount.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Focus title input when editing
  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  const handleCitationClick = (citation: Citation) => {
    setActiveCitation((prev) => (prev?.id === citation.id ? null : citation));
  };

  const handleTitleSave = () => {
    if (titleDraft.trim()) setTitle(titleDraft.trim());
    setEditingTitle(false);
  };

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return;
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: input.trim(),
      citations: [],
      createdAt: new Date(),
    };
    const loadingMessage: Message = {
      id: `msg-${Date.now()}-ai`,
      role: "assistant",
      content: "",
      citations: [],
      createdAt: new Date(),
      isStreaming: true,
    };
    setMessages((prev) => [...prev, userMessage, loadingMessage]);
    setInput("");
    setIsLoading(true);

    // Simulate streaming response
    await new Promise((r) => setTimeout(r, 1400));
    const responseContent =
      "I'm analyzing your documents to answer that question. Connect the Django backend to get answers grounded in your actual uploaded documents, with precise inline citations.";
    setMessages((prev) =>
      prev.map((m) =>
        m.isStreaming
          ? { ...m, content: responseContent, isStreaming: false }
          : m
      )
    );
    setIsLoading(false);
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Center: chat area */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-3">
          {/* Editable title */}
          <div className="flex items-center gap-2 min-w-0">
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  ref={titleInputRef}
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleTitleSave();
                    if (e.key === "Escape") setEditingTitle(false);
                  }}
                  onBlur={handleTitleSave}
                  className="bg-muted border border-border rounded-md px-2.5 py-1 text-sm text-foreground focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 min-w-[240px]"
                />
                <button
                  onClick={handleTitleSave}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setTitleDraft(title);
                  setEditingTitle(true);
                }}
                className="group flex items-center gap-2 min-w-0"
              >
                <span className="truncate text-sm font-medium text-foreground max-w-[400px]">
                  {title}
                </span>
                <Pencil className="h-3 w-3 text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <button className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:border-border hover:text-foreground transition-colors">
              <Share2 className="h-3 w-3" />
              Share
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground/70 hover:bg-muted transition-colors">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem>Export as PDF</DropdownMenuItem>
                <DropdownMenuItem>Copy share link</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-rose-400 focus:text-rose-300 focus:bg-rose-500/10">
                  Delete conversation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="py-6 space-y-6 max-w-3xl mx-auto w-full">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                activeCitationId={activeCitation?.id ?? null}
                onCitationClick={handleCitationClick}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          disabled={isLoading}
        />
      </div>

      {/* Right source panel */}
      {activeCitation && (
        <SourcePanel
          citation={activeCitation}
          onClose={() => setActiveCitation(null)}
        />
      )}
    </div>
  );
}

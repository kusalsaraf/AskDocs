"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/chat/EmptyState";
import { ChatInput } from "@/components/chat/ChatInput";

export default function ChatPage() {
  const [input, setInput] = useState("");
  const router = useRouter();

  const handleSubmit = () => {
    if (!input.trim()) return;
    // In production: create conversation, then navigate to it
    router.push("/chat/conv-1");
  };

  const handleExampleClick = (question: string) => {
    setInput(question);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-border/60 px-6 py-3.5">
        <span className="text-sm font-medium text-muted-foreground">New chat</span>
      </div>

      {/* Empty state + input */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <EmptyState onExampleClick={handleExampleClick} />
        </div>
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
}

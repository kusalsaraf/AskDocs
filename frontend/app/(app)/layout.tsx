"use client";

import React, { useState } from "react";
import { PanelLeft } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { mockConversationList, mockWorkspace, mockUser } from "@/lib/mock-data";
import { usePathname } from "next/navigation";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();

  const activeId = pathname.startsWith("/chat/")
    ? pathname.split("/chat/")[1]
    : undefined;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      {!sidebarCollapsed && (
        <Sidebar
          conversations={mockConversationList}
          activeConversationId={activeId}
          workspace={mockWorkspace}
          user={mockUser}
          onCollapse={() => setSidebarCollapsed(true)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {/* Re-open sidebar button — only when collapsed */}
        {sidebarCollapsed && (
          <div className="absolute top-3 left-3 z-10">
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground/70 hover:border-border transition-colors"
              aria-label="Open sidebar"
            >
              <PanelLeft className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

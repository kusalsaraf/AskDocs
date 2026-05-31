"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, MoreHorizontal, FileText, PanelLeftClose } from "lucide-react";
import { ConversationSummary, User, Workspace } from "@/lib/types";
import { formatRelativeTime, truncate, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { UserMenu } from "./UserMenu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { mockWorkspaces } from "@/lib/mock-data";

interface SidebarProps {
  conversations: ConversationSummary[];
  activeConversationId?: string;
  workspace: Workspace;
  user: User;
  onCollapse?: () => void;
}

export function Sidebar({
  conversations,
  activeConversationId,
  workspace,
  user,
  onCollapse,
}: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-900">
      {/* Logo + collapse toggle */}
      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex items-center gap-2.5 px-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500">
            <FileText className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-zinc-100 tracking-tight">AskDocs</span>
        </div>
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* New chat button */}
      <div className="px-3 pb-3">
        <Link href="/chat">
          <Button variant="default" size="sm" className="w-full gap-2 justify-start">
            <Plus className="h-3.5 w-3.5" />
            New chat
          </Button>
        </Link>
      </div>

      {/* Nav links */}
      <div className="px-3 pb-3">
        <Link
          href="/documents"
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
            pathname === "/documents"
              ? "bg-zinc-800 text-zinc-100"
              : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
          )}
        >
          <FileText className="h-3.5 w-3.5" />
          Documents
        </Link>
      </div>

      <div className="mx-3 h-px bg-zinc-800/80" />

      {/* Recent conversations */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <p className="px-4 pt-3 pb-1.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
          Recent
        </p>
        <ScrollArea className="flex-1">
          <div className="px-2 pb-2 space-y-0.5">
            {conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Bottom: workspace + user */}
      <div className="border-t border-zinc-800/80 px-2 py-2 space-y-0.5">
        <WorkspaceSwitcher workspace={workspace} workspaces={mockWorkspaces} />
        <UserMenu user={user} />
      </div>
    </aside>
  );
}

function ConversationItem({
  conversation,
  isActive,
}: {
  conversation: ConversationSummary;
  isActive: boolean;
}) {
  return (
    <div
      className={cn(
        "group relative flex items-center gap-1 rounded-lg px-2.5 py-2 cursor-pointer transition-colors",
        isActive ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
      )}
    >
      <Link href={`/chat/${conversation.id}`} className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="block truncate text-xs font-medium leading-snug">
          {truncate(conversation.title, 38)}
        </span>
        <span className="text-[11px] text-zinc-600">
          {formatRelativeTime(conversation.updatedAt)}
        </span>
      </Link>

      {/* Kebab menu — visible on hover */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "h-6 w-6 shrink-0 flex items-center justify-center rounded-md transition-colors",
              "opacity-0 group-hover:opacity-100",
              isActive ? "text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200" : "text-zinc-600 hover:bg-zinc-700 hover:text-zinc-300"
            )}
            onClick={(e) => e.preventDefault()}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" className="w-44">
          <DropdownMenuItem>Rename</DropdownMenuItem>
          <DropdownMenuItem>Share</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-rose-400 focus:text-rose-300 focus:bg-rose-500/10">
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

"use client";

import React from "react";
import { ChevronsUpDown } from "lucide-react";
import { Workspace } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface WorkspaceSwitcherProps {
  workspace: Workspace;
  workspaces: Workspace[];
}

export function WorkspaceSwitcher({ workspace, workspaces }: WorkspaceSwitcherProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-muted transition-colors group">
          {/* Logo */}
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-500/20 text-indigo-400 font-mono text-[10px] font-bold">
            {workspace.logoInitials.slice(0, 1)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-xs font-medium text-foreground">
              {workspace.name}
            </p>
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((ws) => (
          <DropdownMenuItem key={ws.id} className="gap-2.5">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-indigo-500/20 text-indigo-400 font-mono text-[9px] font-bold">
              {ws.logoInitials.slice(0, 1)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm">{ws.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{ws.plan}</p>
            </div>
            {ws.id === workspace.id && (
              <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-muted-foreground">
          Create workspace…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

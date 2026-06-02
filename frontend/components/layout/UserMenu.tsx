"use client";

import React from "react";
import { Settings, LogOut, User as UserIcon, Monitor, Sun, Moon, Check, Palette } from "lucide-react";
import { useTheme } from "next-themes";
import { useAuth } from "@/lib/hooks/useAuth";
import type { User } from "@/lib/types/domain";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface UserMenuProps {
  user: User;
}

export function UserMenu({ user }: UserMenuProps) {
  const { theme, setTheme } = useTheme()
  const { logout } = useAuth()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-muted transition-colors group">
          <Avatar className="h-6 w-6 shrink-0">
            <AvatarFallback className="text-[10px] bg-muted text-foreground/70">
              {user.avatarInitials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="truncate text-xs font-medium text-foreground">{user.name}</p>
          </div>
          <Settings className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground transition-colors" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" className="w-52">
        <DropdownMenuLabel className="font-normal">
          <p className="text-xs font-medium text-foreground">{user.name}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem className="gap-2.5">
          <UserIcon className="h-4 w-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2.5">
          <Settings className="h-4 w-4" />
          Settings
        </DropdownMenuItem>

        {/* Appearance submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2.5">
            <Palette className="h-4 w-4" />
            Appearance
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-36">
            <ThemeOption
              label="Dark"
              icon={<Moon className="h-3.5 w-3.5" />}
              value="dark"
              current={theme}
              onSelect={setTheme}
            />
            <ThemeOption
              label="Light"
              icon={<Sun className="h-3.5 w-3.5" />}
              value="light"
              current={theme}
              onSelect={setTheme}
            />
            <ThemeOption
              label="System"
              icon={<Monitor className="h-3.5 w-3.5" />}
              value="system"
              current={theme}
              onSelect={setTheme}
            />
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2.5 text-rose-400 focus:text-rose-300 focus:bg-rose-500/10"
          onClick={() => logout()}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeOption({
  label,
  icon,
  value,
  current,
  onSelect,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  current: string | undefined;
  onSelect: (v: string) => void;
}) {
  const active = current === value;
  return (
    <DropdownMenuItem
      className="gap-2 pr-2"
      onClick={() => onSelect(value)}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {active && <Check className="h-3.5 w-3.5 text-indigo-400 shrink-0" />}
    </DropdownMenuItem>
  );
}

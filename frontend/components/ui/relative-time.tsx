"use client";

import { useState, useEffect } from "react";
import { formatRelativeTime } from "@/lib/utils";

interface RelativeTimeProps {
  date: Date;
  className?: string;
}

export function RelativeTime({ date, className }: RelativeTimeProps) {
  const [text, setText] = useState("");

  useEffect(() => {
    setText(formatRelativeTime(date));
    const id = setInterval(() => setText(formatRelativeTime(date)), 60_000);
    return () => clearInterval(id);
  }, [date]);

  // suppressHydrationWarning handles the empty-string → real-value swap silently
  return <span className={className} suppressHydrationWarning>{text}</span>;
}

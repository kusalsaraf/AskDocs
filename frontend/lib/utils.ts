import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const absDiff = Math.abs(diff);
  const isPast = diff > 0;

  const minutes = Math.floor(absDiff / 60000);
  const hours = Math.floor(absDiff / 3600000);
  const days = Math.floor(absDiff / 86400000);

  if (minutes < 1) return "just now";

  if (isPast) {
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return "yesterday";
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  if (minutes < 60) return `in ${minutes}m`;
  if (hours < 24) return `in ${hours}h`;
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days}d`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "…";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Extract a user-friendly error message from an API error.
 * Handles the backend's `{error: {message}}` envelope, Axios errors,
 * and falls back to the native Error message.
 */
export function getApiErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err && typeof err === 'object') {
    // Axios error with backend envelope
    const axiosErr = err as { response?: { data?: { error?: { message?: string } }; status?: number } }
    const apiMsg = axiosErr.response?.data?.error?.message
    if (apiMsg) return apiMsg

    // Plain Error
    if ('message' in err && typeof (err as Error).message === 'string') {
      const msg = (err as Error).message
      if (!msg.startsWith('Request failed with status code')) return msg
    }
  }
  return fallback
}

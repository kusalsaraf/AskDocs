"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { UploadCloud, X, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// ── Types ────────────────────────────────────────────────────────────────────

type FileStatus = "ready" | "uploading" | "uploaded" | "failed";
type FileKind = "pdf" | "docx" | "txt" | "unknown";

interface StagedFile {
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  error?: string;
  validationError?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const MAX_BYTES = 50 * 1024 * 1024;

function getKind(file: File): FileKind {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".txt")) return "txt";
  return "unknown";
}

function fmtBytes(b: number): string {
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function validate(file: File): string | undefined {
  if (getKind(file) === "unknown") return "Unsupported type";
  if (file.size > MAX_BYTES) return "Exceeds 50MB limit";
}

// ── Sub-components ───────────────────────────────────────────────────────────

function FileKindIcon({ kind }: { kind: FileKind }) {
  const cls = {
    pdf: "bg-rose-500/10 text-rose-400",
    docx: "bg-blue-500/10 text-blue-400",
    txt: "bg-muted/40 text-muted-foreground",
    unknown: "bg-muted/40 text-muted-foreground",
  }[kind];
  return (
    <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[9px] font-bold tracking-tight", cls)}>
      {kind === "unknown" ? "?" : kind.toUpperCase()}
    </div>
  );
}

function StatusBadge({ status, progress, error }: { status: FileStatus; progress: number; error?: string }) {
  if (status === "ready") return <span className="text-xs text-muted-foreground">Ready</span>;
  if (status === "uploading") return <span className="text-xs text-muted-foreground">Uploading {progress}%</span>;
  if (status === "uploaded") return <span className="text-xs font-medium text-emerald-400">✓ Uploaded</span>;
  return <span className="text-xs text-rose-400">✗ Failed{error ? `: ${error}` : ""}</span>;
}

// ── Dropzone ─────────────────────────────────────────────────────────────────

interface DropzoneProps {
  compact?: boolean;
  isDragOver: boolean;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onClick: () => void;
}

function Dropzone({ compact, isDragOver, onDrop, onDragOver, onDragLeave, onClick }: DropzoneProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className={cn(
        "cursor-pointer rounded-lg border-2 border-dashed transition-all duration-150",
        isDragOver
          ? "border-indigo-500 bg-indigo-500/5"
          : "border-border hover:border-border/60 hover:bg-muted/20",
        compact
          ? "flex items-center justify-center py-2.5"
          : "flex h-[200px] flex-col items-center justify-center gap-2"
      )}
    >
      {compact ? (
        <span className={cn("text-sm font-medium", isDragOver ? "text-indigo-400" : "text-muted-foreground hover:text-muted-foreground")}>
          + Add more files
        </span>
      ) : (
        <>
          <UploadCloud className={cn("h-10 w-10", isDragOver ? "text-indigo-400" : "text-muted-foreground")} />
          <div className="text-center">
            <p className={cn("text-sm font-medium", isDragOver ? "text-indigo-300" : "text-foreground/70")}>
              Drop files here
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">or click to browse</p>
          </div>
        </>
      )}
    </div>
  );
}

// ── UploadModal ───────────────────────────────────────────────────────────────

interface UploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UploadModal({ open, onOpenChange }: UploadModalProps) {
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setFiles([]);
      setIsDragOver(false);
      setTags([]);
      setTagInput("");
      setIsUploading(false);
      setSuccessCount(0);
    }
  }, [open]);

  // Auto-close after success
  useEffect(() => {
    if (successCount > 0) {
      const t = setTimeout(() => onOpenChange(false), 2000);
      return () => clearTimeout(t);
    }
  }, [successCount, onOpenChange]);

  const stageFiles = useCallback((incoming: File[]) => {
    const staged: StagedFile[] = incoming.map((f) => ({
      id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
      file: f,
      status: "ready",
      progress: 0,
      validationError: validate(f),
    }));
    setFiles((prev) => [...prev, ...staged]);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length) stageFiles(Array.from(e.dataTransfer.files));
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      stageFiles(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault();
      const t = tagInput.trim();
      if (!tags.includes(t)) setTags((p) => [...p, t]);
      setTagInput("");
    }
  };

  const mockUpload = (id: string, shouldFail: boolean): Promise<"uploaded" | "failed"> =>
    new Promise((resolve) => {
      // Failing file animates to 65% over 1.8s, then fails
      const duration = shouldFail ? 1800 : 2000 + Math.random() * 1000;
      const peakProgress = shouldFail ? 65 : 100;
      const start = Date.now();

      const tick = () => {
        const ratio = Math.min((Date.now() - start) / duration, 1);
        const progress = Math.round(ratio * peakProgress);

        setFiles((prev) =>
          prev.map((f) => (f.id === id ? { ...f, status: "uploading", progress } : f))
        );

        if (ratio >= 1) {
          if (shouldFail) {
            setFiles((prev) =>
              prev.map((f) => (f.id === id ? { ...f, status: "failed", progress: 0, error: "Server error" } : f))
            );
            resolve("failed");
          } else {
            setFiles((prev) =>
              prev.map((f) => (f.id === id ? { ...f, status: "uploaded", progress: 100 } : f))
            );
            resolve("uploaded");
          }
        } else {
          requestAnimationFrame(tick);
        }
      };

      requestAnimationFrame(tick);
    });

  const handleUpload = async () => {
    const valid = files.filter((f) => !f.validationError);
    if (!valid.length || isUploading) return;
    setIsUploading(true);

    // Mock: second file fails when uploading 2+ files
    const results = await Promise.all(
      valid.map((f, i) => mockUpload(f.id, valid.length >= 2 && i === 1))
    );

    setIsUploading(false);
    if (results.every((r) => r === "uploaded")) {
      setSuccessCount(results.length);
    }
  };

  const hasFiles = files.length > 0;
  const hasValidFiles = files.some((f) => !f.validationError);
  const isSuccess = successCount > 0;

  const close = () => { if (!isUploading) onOpenChange(false); };
  const dropzoneProps = { isDragOver, onDrop: handleDrop, onDragOver: handleDragOver, onDragLeave: handleDragLeave, onClick: () => fileInputRef.current?.click() };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isUploading) onOpenChange(v); }}>
      <DialogContent className="flex flex-col gap-0 p-0 max-h-[85vh]">

        {/* ── Header ── */}
        <div className="flex shrink-0 items-start justify-between border-b border-border px-6 pb-4 pt-5">
          <div>
            <DialogTitle>Upload documents</DialogTitle>
            <DialogDescription>
              Add PDFs, DOCX, or TXT files. Up to 50MB per file.
            </DialogDescription>
          </div>
          <button
            onClick={close}
            disabled={isUploading}
            className="mt-0.5 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground/70 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {isSuccess ? (
            // State 3 — Success
            <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
              <CheckCircle className="h-14 w-14 text-emerald-500" />
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  {successCount} {successCount === 1 ? "document" : "documents"} uploaded
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  They're processing now. You'll be able to chat with them in a few moments.
                </p>
              </div>
            </div>
          ) : !hasFiles ? (
            // State 1 — Empty
            <>
              <Dropzone {...dropzoneProps} />
              <p className="text-center text-xs text-muted-foreground/60">
                Supported: PDF, DOCX, TXT · Max 50MB per file
              </p>
            </>
          ) : (
            // State 2 — Files staged
            <>
              <Dropzone compact {...dropzoneProps} />

              {/* File rows */}
              <div className="space-y-2">
                {files.map((sf) => {
                  const kind = getKind(sf.file);
                  const canRemove = !isUploading && sf.status !== "uploaded" && sf.status !== "failed";
                  const canRemoveValidationError = sf.validationError && !isUploading;

                  return (
                    <div
                      key={sf.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border px-3 py-2.5",
                        sf.validationError
                          ? "border-rose-500/30 bg-rose-500/5"
                          : "border-border bg-muted/20"
                      )}
                    >
                      <FileKindIcon kind={kind} />

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">{sf.file.name}</p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{fmtBytes(sf.file.size)}</span>
                          {sf.validationError && (
                            <span className="text-xs text-rose-400">{sf.validationError}</span>
                          )}
                        </div>
                        {sf.status === "uploading" && (
                          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-indigo-500 transition-all duration-100"
                              style={{ width: `${sf.progress}%` }}
                            />
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {!sf.validationError && (
                          <StatusBadge status={sf.status} progress={sf.progress} error={sf.error} />
                        )}
                        {(canRemove || canRemoveValidationError) && (
                          <button
                            onClick={() => setFiles((p) => p.filter((f) => f.id !== sf.id))}
                            className="text-muted-foreground/60 transition-colors hover:text-muted-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tags chip input */}
              <div>
                <div className="flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card/50 px-3 py-2">
                  {tags.map((tag) => (
                    <span key={tag} className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-foreground/70">
                      {tag}
                      <button onClick={() => setTags((p) => p.filter((t) => t !== tag))} className="text-muted-foreground hover:text-foreground/70">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    placeholder={tags.length === 0 ? "Add tags and press Enter…" : ""}
                    className="min-w-[150px] flex-1 bg-transparent text-xs text-foreground/70 outline-none placeholder:text-muted-foreground/60"
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground/60">Optional · helps organize documents</p>
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        {!isSuccess && (
          <div className="flex shrink-0 items-center justify-between border-t border-border px-6 py-4">
            <Button variant="ghost" size="sm" onClick={close} disabled={isUploading}>
              Cancel
            </Button>
            <Button size="sm" disabled={!hasValidFiles || isUploading} onClick={handleUpload} className="gap-2">
              {isUploading && (
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {isUploading ? "Uploading…" : "Upload"}
            </Button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt"
          className="hidden"
          onChange={handleFileChange}
        />
      </DialogContent>
    </Dialog>
  );
}

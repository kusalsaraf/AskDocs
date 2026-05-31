"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Search, Upload, LayoutGrid, List, FileQuestion } from "lucide-react";
import { Document, DocumentStatus } from "@/lib/types";
import { mockDocuments } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DocumentCard, DocumentRow } from "@/components/documents/DocumentCard";

type ViewMode = "grid" | "list";
type FilterKey = "all" | DocumentStatus;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ready", label: "Ready" },
  { key: "processing", label: "Processing" },
  { key: "failed", label: "Failed" },
];

export default function DocumentsPage() {
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Simulate async load with skeleton
  useEffect(() => {
    const t = setTimeout(() => {
      setDocuments(mockDocuments);
      setLoading(false);
    }, 850);
    return () => clearTimeout(t);
  }, []);

  const counts = useMemo(
    () => ({
      all: documents.length,
      ready: documents.filter((d) => d.status === "ready").length,
      processing: documents.filter((d) => d.status === "processing").length,
      failed: documents.filter((d) => d.status === "failed").length,
    }),
    [documents]
  );

  const filtered = useMemo(() => {
    return documents.filter((doc) => {
      const matchesFilter =
        activeFilter === "all" || doc.status === activeFilter;
      const matchesSearch = doc.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [documents, activeFilter, searchQuery]);

  const handleUpload = () => {
    console.log("Upload modal — Screen 3 coming soon");
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 border-b border-zinc-800/60 px-6 py-3.5">
        {/* Title */}
        <h1 className="text-sm font-medium text-zinc-200 shrink-0">Documents</h1>

        {/* Search — centered */}
        <div className="flex-1 flex justify-center">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(
                "w-full rounded-lg border border-zinc-800 bg-zinc-900 py-1.5 pl-9 pr-3",
                "text-sm text-zinc-200 placeholder:text-zinc-500",
                "focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/10",
                "transition-all duration-150"
              )}
            />
          </div>
        </div>

        {/* Upload button */}
        <Button size="sm" className="gap-2 shrink-0" onClick={handleUpload}>
          <Upload className="h-3.5 w-3.5" />
          Upload documents
        </Button>
      </div>

      {/* ── Filter row ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-zinc-800/40 px-6 py-2.5">
        {/* Filter chips */}
        <div className="flex items-center gap-1">
          {FILTERS.map(({ key, label }) => {
            const count = counts[key];
            const active = activeFilter === key;
            return (
              <button
                key={key}
                onClick={() => setActiveFilter(key)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-100",
                  active
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60"
                )}
              >
                {label}
                {!loading && (
                  <span
                    className={cn(
                      "ml-1.5 font-mono text-[10px]",
                      active ? "text-zinc-400" : "text-zinc-600"
                    )}
                  >
                    ({count})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-0.5 rounded-lg border border-zinc-800 p-0.5">
          <ViewToggleButton
            active={viewMode === "grid"}
            onClick={() => setViewMode("grid")}
            label="Grid view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </ViewToggleButton>
          <ViewToggleButton
            active={viewMode === "list"}
            onClick={() => setViewMode("list")}
            label="List view"
          >
            <List className="h-3.5 w-3.5" />
          </ViewToggleButton>
        </div>
      </div>

      {/* ── Content area ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <SkeletonGrid />
        ) : filtered.length === 0 ? (
          <EmptyState onUpload={handleUpload} hasQuery={searchQuery.length > 0} />
        ) : viewMode === "grid" ? (
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  document={doc}
                  onClick={() => console.log("Open document:", doc.id)}
                />
              ))}
            </div>
          </div>
        ) : (
          <ListView documents={filtered} />
        )}
      </div>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function ViewToggleButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-zinc-800 text-zinc-200"
          : "text-zinc-600 hover:text-zinc-400"
      )}
    >
      {children}
    </button>
  );
}

function ListView({ documents }: { documents: Document[] }) {
  return (
    <div>
      {/* Header row */}
      <div
        className="grid items-center gap-4 px-4 py-2 border-b border-zinc-800/80"
        style={{ gridTemplateColumns: "1fr 72px 88px 128px 100px auto auto" }}
      >
        {["Name", "Pages", "Size", "Uploaded by", "Date", "Status", ""].map(
          (col, i) => (
            <span key={i} className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
              {col}
            </span>
          )
        )}
      </div>
      {documents.map((doc) => (
        <DocumentRow
          key={doc.id}
          document={doc}
          onClick={() => console.log("Open document:", doc.id)}
        />
      ))}
    </div>
  );
}

function EmptyState({
  onUpload,
  hasQuery,
}: {
  onUpload: () => void;
  hasQuery: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] py-16 px-6">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800 ring-1 ring-zinc-700">
        <FileQuestion className="h-6 w-6 text-zinc-500" />
      </div>
      <h2 className="text-base font-medium text-zinc-200 mb-2">
        {hasQuery ? "No documents match your search" : "No documents yet"}
      </h2>
      <p className="text-sm text-zinc-500 text-center max-w-xs mb-6">
        {hasQuery
          ? "Try a different search term or clear the filter."
          : "Upload your first document to start asking questions across your team's knowledge base."}
      </p>
      {!hasQuery && (
        <Button size="sm" className="gap-2" onClick={onUpload}>
          <Upload className="h-3.5 w-3.5" />
          Upload documents
        </Button>
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-4 gap-3">
      <div className="flex items-start justify-between">
        <div className="h-9 w-9 rounded-lg shimmer" />
        <div className="h-5 w-14 rounded-full shimmer" />
      </div>
      <div className="space-y-2 mt-1">
        <div className="h-3.5 w-full rounded-full shimmer" />
        <div className="h-3.5 w-3/4 rounded-full shimmer" />
      </div>
      <div className="mt-auto h-3 w-2/3 rounded-full shimmer" />
    </div>
  );
}

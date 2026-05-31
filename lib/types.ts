export interface User {
  id: string;
  name: string;
  email: string;
  avatarInitials: string;
  role: "admin" | "member" | "viewer";
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: "starter" | "pro" | "enterprise";
  memberCount: number;
  logoInitials: string;
}

export type DocumentStatus = "processing" | "ready" | "failed";
export type DocumentType = "pdf" | "docx" | "xlsx" | "txt" | "md";

export interface ModelInfo {
  provider: string;
  model: string;
  source: "free-tier" | "own-key" | "enterprise";
}

export interface Document {
  id: string;
  name: string;
  type: DocumentType;
  size: number;
  pageCount: number;
  uploadedAt: Date;
  uploadedBy: User;
  status: DocumentStatus;
  tags: string[];
}

export interface Citation {
  id: number;
  documentId: string;
  documentName: string;
  excerpt: string;
  highlightedText: string;
  pageNumber: number;
  uploadedAt: Date;
  uploadedBy: User;
  fileSize: number;
}

export type MessageRole = "user" | "assistant";

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  citations: Citation[];
  createdAt: Date;
  isStreaming?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  workspaceId: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  lastMessage: string;
  updatedAt: Date;
}

// ── Settings ──────────────────────────────────────────────────────────────────

export type ProviderKey =
  | "askdocs-default"
  | "openai"
  | "anthropic"
  | "google-gemini"
  | "azure-openai"
  | "mistral"
  | "groq"
  | "ollama";

export interface ProviderConfig {
  provider: ProviderKey;
  apiKey?: string;
  baseUrl?: string;
  region?: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface WorkspaceMember {
  id: string;
  user: User;
  role: "admin" | "member" | "viewer";
  joinedAt: Date;
  lastActiveAt: Date;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: "admin" | "member" | "viewer";
  invitedAt: Date;
}

export interface DailyQueryStat {
  date: string;
  count: number;
}

export interface UsageStats {
  queriesThisMonth: number;
  queriesLimit: number;
  documentsCount: number;
  storageUsedBytes: number;
  storageLimitBytes: number;
  dailyQueries: DailyQueryStat[];
  topUsers: { user: User; queries: number }[];
}

export interface Invoice {
  id: string;
  date: Date;
  amount: number;
  status: "paid" | "pending";
}

export interface BillingInfo {
  plan: "starter" | "pro" | "enterprise";
  price: number;
  billingCycle: "monthly" | "annual";
  paymentMethod: { type: string; last4: string };
  invoices: Invoice[];
}

export interface SendMessagePayload {
  conversationId: string;
  content: string;
}

export interface CreateConversationPayload {
  workspaceId: string;
  initialMessage: string;
}

/**
 * Stubbed API layer — swap these functions for real fetch() calls
 * pointing at the Django REST API when the backend is ready.
 * All functions return a Promise so the calling code needs no changes.
 */

import {
  mockUser,
  mockWorkspace,
  mockWorkspaces,
  mockConversation,
  mockConversationList,
  mockDocuments,
  mockProviderConfig,
  mockMembers,
  mockPendingInvites,
  mockUsageStats,
  mockBillingInfo,
} from "./mock-data";
import type {
  User,
  Workspace,
  Conversation,
  ConversationSummary,
  Document,
  Message,
  ModelInfo,
  ProviderConfig,
  WorkspaceMember,
  PendingInvite,
  UsageStats,
  BillingInfo,
  SendMessagePayload,
  CreateConversationPayload,
} from "./types";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Auth / User ────────────────────────────────────────────────────────────

export async function getCurrentUser(): Promise<User> {
  await delay(200);
  return mockUser;
}

// ─── Workspaces ──────────────────────────────────────────────────────────────

export async function getWorkspace(id: string): Promise<Workspace> {
  await delay(150);
  return mockWorkspaces.find((w) => w.id === id) ?? mockWorkspace;
}

export async function listWorkspaces(): Promise<Workspace[]> {
  await delay(150);
  return mockWorkspaces;
}

// ─── Conversations ───────────────────────────────────────────────────────────

export async function listConversations(
  workspaceId: string
): Promise<ConversationSummary[]> {
  await delay(300);
  void workspaceId;
  return mockConversationList;
}

export async function getConversation(id: string): Promise<Conversation> {
  await delay(400);
  if (id === mockConversation.id) return mockConversation;
  return {
    ...mockConversation,
    id,
    title: mockConversationList.find((c) => c.id === id)?.title ?? "Untitled",
    messages: [],
  };
}

export async function createConversation(
  payload: CreateConversationPayload
): Promise<Conversation> {
  await delay(500);
  void payload;
  return {
    ...mockConversation,
    id: `conv-${Date.now()}`,
    title: "New conversation",
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function updateConversationTitle(
  id: string,
  title: string
): Promise<void> {
  await delay(200);
  void id;
  void title;
}

export async function deleteConversation(id: string): Promise<void> {
  await delay(300);
  void id;
}

// ─── Messages ────────────────────────────────────────────────────────────────

export async function sendMessage(
  payload: SendMessagePayload
): Promise<Message> {
  await delay(1200);
  void payload;
  return {
    id: `msg-${Date.now()}`,
    role: "assistant",
    content:
      "I'm analyzing the uploaded documents to answer your question. This is a placeholder response — connect the Django backend to get real answers grounded in your documents.",
    citations: [],
    createdAt: new Date(),
  };
}

// ─── Documents ───────────────────────────────────────────────────────────────

export async function listDocuments(workspaceId: string): Promise<Document[]> {
  await delay(400);
  void workspaceId;
  return mockDocuments;
}

export async function uploadDocument(
  workspaceId: string,
  file: File
): Promise<Document> {
  await delay(2000);
  void workspaceId;
  return {
    id: `doc-${Date.now()}`,
    name: file.name,
    type: file.name.endsWith(".pdf")
      ? "pdf"
      : file.name.endsWith(".docx")
      ? "docx"
      : file.name.endsWith(".md")
      ? "md"
      : "txt",
    size: file.size,
    pageCount: 0,
    uploadedAt: new Date(),
    uploadedBy: mockUser,
    status: "processing",
    tags: [],
  };
}

export async function deleteDocument(id: string): Promise<void> {
  await delay(400);
  void id;
}

// ─── Model / Provider ────────────────────────────────────────────────────────

export async function getActiveModel(): Promise<ModelInfo> {
  await delay(50);
  return { provider: "gemini", model: "gemini-flash", source: "free-tier" };
}

// ─── Feedback ────────────────────────────────────────────────────────────────

export async function submitMessageFeedback(
  messageId: string,
  feedback: "up" | "down"
): Promise<void> {
  await delay(200);
  void messageId;
  void feedback;
}

// ─── Settings / Provider ──────────────────────────────────────────────────────

export async function getProviderConfig(workspaceId: string): Promise<ProviderConfig> {
  await delay(300);
  void workspaceId;
  return mockProviderConfig;
}

export async function saveProviderConfig(
  workspaceId: string,
  config: ProviderConfig
): Promise<void> {
  await delay(600);
  void workspaceId;
  void config;
}

export async function testProviderConnection(
  config: Partial<ProviderConfig>
): Promise<{ success: boolean; message: string }> {
  await delay(1500);
  void config;
  return { success: true, message: "Connected successfully" };
}

// ─── Members ──────────────────────────────────────────────────────────────────

export async function getMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  await delay(350);
  void workspaceId;
  return mockMembers;
}

export async function getPendingInvites(workspaceId: string): Promise<PendingInvite[]> {
  await delay(300);
  void workspaceId;
  return mockPendingInvites;
}

export async function inviteMember(
  workspaceId: string,
  email: string,
  role: string
): Promise<void> {
  await delay(600);
  void workspaceId;
  void email;
  void role;
}

export async function removeMember(memberId: string): Promise<void> {
  await delay(400);
  void memberId;
}

export async function updateMemberRole(
  memberId: string,
  role: string
): Promise<void> {
  await delay(300);
  void memberId;
  void role;
}

// ─── Usage ────────────────────────────────────────────────────────────────────

export async function getUsageStats(workspaceId: string): Promise<UsageStats> {
  await delay(400);
  void workspaceId;
  return mockUsageStats;
}

// ─── Billing ──────────────────────────────────────────────────────────────────

export async function getBillingInfo(workspaceId: string): Promise<BillingInfo> {
  await delay(350);
  void workspaceId;
  return mockBillingInfo;
}

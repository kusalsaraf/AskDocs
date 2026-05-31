import {
  User,
  Workspace,
  Document,
  Citation,
  Message,
  Conversation,
  ConversationSummary,
  ProviderConfig,
  WorkspaceMember,
  PendingInvite,
  UsageStats,
  BillingInfo,
} from "./types";

export const mockUser: User = {
  id: "user-1",
  name: "Alex Chen",
  email: "alex.chen@meridian.io",
  avatarInitials: "AC",
  role: "admin",
};

export const mockWorkspace: Workspace = {
  id: "ws-1",
  name: "Meridian Technologies",
  slug: "meridian",
  plan: "pro",
  memberCount: 34,
  logoInitials: "MT",
};

export const mockWorkspaces: Workspace[] = [
  mockWorkspace,
  {
    id: "ws-2",
    name: "Meridian — Legal",
    slug: "meridian-legal",
    plan: "pro",
    memberCount: 8,
    logoInitials: "ML",
  },
];

// Citations referenced in the mock conversation
export const mockCitations: Citation[] = [
  {
    id: 1,
    documentId: "doc-1",
    documentName: "Customer Agreement & Refund Policy v3.1.pdf",
    excerpt:
      "4.2 Monthly Subscription Cancellations\n\nCustomers on monthly billing cycles may cancel their subscription at any time through the Account Settings portal or by contacting our support team. Upon cancellation, access to the platform will continue through the end of the current billing period. No partial or prorated refunds will be issued for the unused portion of a billing cycle, except as outlined in Section 4.5 (Service Credits).\n\nTo ensure your cancellation is processed before the next billing date, requests must be submitted no fewer than 24 hours prior to the scheduled renewal date.",
    highlightedText:
      "No partial or prorated refunds will be issued for the unused portion of a billing cycle, except as outlined in Section 4.5 (Service Credits).",
    pageNumber: 4,
    uploadedAt: new Date("2024-11-03T09:00:00Z"),
    uploadedBy: mockUser,
    fileSize: 284_312,
  },
  {
    id: 2,
    documentId: "doc-1",
    documentName: "Customer Agreement & Refund Policy v3.1.pdf",
    excerpt:
      "4.5 Service Credits\n\nIn the event of a verified service outage exceeding 72 consecutive hours, affected customers on any subscription plan are entitled to a prorated service credit equal to the downtime period divided by the total billing cycle days, multiplied by the monthly fee. Service credits are applied automatically to the next invoice and are non-transferable and non-refundable as cash.",
    highlightedText:
      "affected customers on any subscription plan are entitled to a prorated service credit equal to the downtime period divided by the total billing cycle days",
    pageNumber: 5,
    uploadedAt: new Date("2024-11-03T09:00:00Z"),
    uploadedBy: mockUser,
    fileSize: 284_312,
  },
  {
    id: 3,
    documentId: "doc-1",
    documentName: "Customer Agreement & Refund Policy v3.1.pdf",
    excerpt:
      "4.3 Annual Subscription Cancellations\n\nCustomers on annual billing plans who choose to cancel before the end of their subscription term are eligible for a prorated refund of prepaid fees corresponding to complete, unused calendar months remaining in their subscription period. Partial months at the time of cancellation are not eligible for refund. Credits applied from promotional pricing, trial extensions, or complimentary months are excluded from refund calculations.\n\nRefunds are processed within 10–14 business days and credited to the original payment method on file. To initiate a cancellation and refund, customers must submit a formal request through the Finance portal. Verbal requests and informal email communications are insufficient to trigger the refund process.",
    highlightedText:
      "eligible for a prorated refund of prepaid fees corresponding to complete, unused calendar months remaining in their subscription period",
    pageNumber: 4,
    uploadedAt: new Date("2024-11-03T09:00:00Z"),
    uploadedBy: mockUser,
    fileSize: 284_312,
  },
];

export const mockConversation: Conversation = {
  id: "conv-1",
  title: "Refund policy for monthly and annual plans",
  workspaceId: "ws-1",
  createdAt: new Date("2025-01-14T14:20:00Z"),
  updatedAt: new Date("2025-01-14T14:26:00Z"),
  messages: [
    {
      id: "msg-1",
      role: "user",
      content:
        "What's our refund policy for customers on a monthly plan if they cancel mid-billing cycle?",
      citations: [],
      createdAt: new Date("2025-01-14T14:20:00Z"),
    },
    {
      id: "msg-2",
      role: "assistant",
      content: `Monthly plan customers who cancel mid-cycle **do not receive a partial refund** for the unused days. Instead, they retain full platform access through the end of their current billing period, at which point the subscription expires without further charges [1].

There are two exceptions where a customer may receive financial relief:

- **Service outages exceeding 72 consecutive hours**: A prorated service credit is applied automatically to the customer's next invoice — not issued as a cash refund [2]
- **Billing errors**: If a customer was charged an incorrect amount, a full refund is processed within 5–7 business days regardless of plan type

To avoid being charged for the next cycle, cancellations must be submitted at least **24 hours before the next renewal date** via the Account Settings portal or by contacting support [1].`,
      citations: [mockCitations[0], mockCitations[1]],
      createdAt: new Date("2025-01-14T14:21:00Z"),
    },
    {
      id: "msg-3",
      role: "user",
      content:
        "Got it. What about annual plan customers who cancel early — do they get a prorated refund for unused months?",
      citations: [],
      createdAt: new Date("2025-01-14T14:24:00Z"),
    },
    {
      id: "msg-4",
      role: "assistant",
      content: `Yes — annual plan customers who cancel early are eligible for a prorated refund, but only for **complete, unused calendar months** remaining in the subscription term [3]. Partial months at the point of cancellation are excluded.

Here's how the refund is calculated:

1. The monthly equivalent rate is determined (annual fee ÷ 12)
2. That rate is multiplied by the number of full months remaining
3. Any promotional credits, trial extensions, or complimentary months are excluded from the calculation

Refunds are processed within **10–14 business days** and returned to the original payment method on file. Customers must submit the request through the **Finance portal** — email or verbal requests alone are not sufficient to trigger the process [3].`,
      citations: [mockCitations[2]],
      createdAt: new Date("2025-01-14T14:26:00Z"),
    },
  ],
};

export const mockConversationList: ConversationSummary[] = [
  {
    id: "conv-1",
    title: "Refund policy for monthly and annual plans",
    lastMessage: "Yes — annual plan customers who cancel early...",
    updatedAt: new Date(Date.now() - 1000 * 60 * 14),
  },
  {
    id: "conv-2",
    title: "Data retention and deletion under GDPR",
    lastMessage: "Under Article 17, customers have the right to...",
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
  },
  {
    id: "conv-3",
    title: "SLA uptime commitments by tier",
    lastMessage: "Enterprise tier carries a 99.99% uptime SLA...",
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 5),
  },
  {
    id: "conv-4",
    title: "Remote work hardware reimbursement policy",
    lastMessage: "Full-time employees are eligible for up to...",
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
  },
  {
    id: "conv-5",
    title: "PTO accrual and carryover rules",
    lastMessage: "PTO accrues at a rate of 1.5 days per month...",
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
  },
  {
    id: "conv-6",
    title: "IP ownership for contractor engagements",
    lastMessage: "Clause 8.2 of the contractor agreement states...",
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4),
  },
];

const priya: User = { ...mockUser, id: "user-2", name: "Priya Raman", email: "priya.raman@meridian.io", avatarInitials: "PR", role: "member" };
const daniel: User = { ...mockUser, id: "user-3", name: "Daniel Torres", email: "daniel.torres@meridian.io", avatarInitials: "DT", role: "member" };

const t = (msAgo: number) => new Date(Date.now() - msAgo);
const days = (n: number) => n * 24 * 60 * 60 * 1000;
const hours = (n: number) => n * 60 * 60 * 1000;
const weeks = (n: number) => days(n * 7);
const months = (n: number) => days(n * 30);

// ── Settings mock data ────────────────────────────────────────────────────────

export const mockProviderConfig: ProviderConfig = {
  provider: "anthropic",
  apiKey: "sk-ant-api03-••••••••••••••••••••••••••••••••••••••••",
  model: "claude-3-5-sonnet-20241022",
  temperature: 0.7,
  maxTokens: 2048,
};

export const mockProviderKeys: Record<string, boolean> = {
  "askdocs-default": true,
  openai: false,
  anthropic: true,
  "google-gemini": false,
  "azure-openai": false,
  mistral: false,
  groq: false,
  ollama: false,
};

const sarah: User = { ...mockUser, id: "user-4", name: "Sarah Kim",  email: "sarah.kim@meridian.io",  avatarInitials: "SK", role: "viewer" };
const james: User  = { ...mockUser, id: "user-5", name: "James Liu",  email: "james.liu@meridian.io",  avatarInitials: "JL", role: "member" };

export const mockMembers: WorkspaceMember[] = [
  { id: "m-1", user: mockUser, role: "admin",  joinedAt: new Date("2025-01-02"), lastActiveAt: new Date(Date.now() - 1000 * 60 * 14) },
  { id: "m-2", user: priya,    role: "member", joinedAt: new Date("2025-01-15"), lastActiveAt: new Date(Date.now() - 1000 * 60 * 60 * 2) },
  { id: "m-3", user: daniel,   role: "member", joinedAt: new Date("2025-01-20"), lastActiveAt: new Date(Date.now() - days(1)) },
  { id: "m-4", user: sarah,    role: "viewer", joinedAt: new Date("2025-02-03"), lastActiveAt: new Date(Date.now() - days(5)) },
  { id: "m-5", user: james,    role: "member", joinedAt: new Date("2025-02-14"), lastActiveAt: new Date(Date.now() - days(14)) },
];

export const mockPendingInvites: PendingInvite[] = [
  { id: "inv-1", email: "maya.patel@example.com",      role: "member", invitedAt: new Date(Date.now() - days(3)) },
  { id: "inv-2", email: "thomas.wright@meridian.io",   role: "admin",  invitedAt: new Date(Date.now() - days(7)) },
];

// 30 days of daily query counts (May 2 – May 31, 2026)
const DAILY_COUNTS = [45,32,156,189,203,178,165,58,41,167,192,208,184,171,63,47,145,178,196,187,173,64,49,162,194,211,192,178,67,42];

export const mockUsageStats: UsageStats = {
  queriesThisMonth: 4_287,
  queriesLimit: 10_000,
  documentsCount: 127,
  storageUsedBytes: 1_503_238_553,  // 1.4 GB
  storageLimitBytes: 10_737_418_240, // 10 GB
  dailyQueries: DAILY_COUNTS.map((count, i) => {
    const d = new Date("2026-05-02");
    d.setDate(d.getDate() + i);
    return { date: d.toISOString().split("T")[0], count };
  }),
  topUsers: [
    { user: mockUser, queries: 1_623 },
    { user: priya,    queries: 987  },
    { user: daniel,   queries: 742  },
    { user: sarah,    queries: 521  },
    { user: james,    queries: 414  },
  ],
};

export const mockBillingInfo: BillingInfo = {
  plan: "pro",
  price: 49,
  billingCycle: "monthly",
  paymentMethod: { type: "Visa", last4: "4242" },
  invoices: [
    { id: "inv-2026-05", date: new Date("2026-05-01"), amount: 49, status: "paid" },
    { id: "inv-2026-04", date: new Date("2026-04-01"), amount: 49, status: "paid" },
    { id: "inv-2026-03", date: new Date("2026-03-01"), amount: 49, status: "paid" },
  ],
};

export const mockDocuments: Document[] = [
  {
    id: "doc-1",
    name: "Customer Agreement & Refund Policy v3.1.pdf",
    type: "pdf",
    size: 284_312,
    pageCount: 12,
    uploadedAt: t(months(2)),
    uploadedBy: mockUser,
    status: "ready",
    tags: ["legal", "policy"],
  },
  {
    id: "doc-2",
    name: "Employee Handbook v3.2.pdf",
    type: "pdf",
    size: 1_842_048,
    pageCount: 64,
    uploadedAt: t(months(1) + weeks(2)),
    uploadedBy: mockUser,
    status: "ready",
    tags: ["hr", "policy"],
  },
  {
    id: "doc-3",
    name: "GDPR Data Retention Policy.pdf",
    type: "pdf",
    size: 412_640,
    pageCount: 18,
    uploadedAt: t(weeks(3)),
    uploadedBy: daniel,
    status: "ready",
    tags: ["legal", "compliance"],
  },
  {
    id: "doc-4",
    name: "SLA Tier Definitions.pdf",
    type: "pdf",
    size: 198_200,
    pageCount: 7,
    uploadedAt: t(weeks(2)),
    uploadedBy: mockUser,
    status: "ready",
    tags: ["product", "legal"],
  },
  {
    id: "doc-5",
    name: "Q3 2025 Engineering Roadmap.docx",
    type: "docx",
    size: 142_080,
    pageCount: 8,
    uploadedAt: t(months(1)),
    uploadedBy: priya,
    status: "ready",
    tags: ["engineering", "planning"],
  },
  {
    id: "doc-6",
    name: "Contractor IP Assignment Agreement.pdf",
    type: "pdf",
    size: 164_480,
    pageCount: 5,
    uploadedAt: t(weeks(1)),
    uploadedBy: mockUser,
    status: "ready",
    tags: ["legal", "hr"],
  },
  {
    id: "doc-7",
    name: "Security Incident Response Plan.pdf",
    type: "pdf",
    size: 634_112,
    pageCount: 23,
    uploadedAt: t(weeks(1) + days(2)),
    uploadedBy: daniel,
    status: "ready",
    tags: ["security"],
  },
  {
    id: "doc-8",
    name: "PTO and Leave Policy 2026.pdf",
    type: "pdf",
    size: 224_768,
    pageCount: 11,
    uploadedAt: t(days(5)),
    uploadedBy: mockUser,
    status: "ready",
    tags: ["hr", "policy"],
  },
  {
    id: "doc-9",
    name: "Brand Guidelines 2026.pdf",
    type: "pdf",
    size: 12_427_264,
    pageCount: 34,
    uploadedAt: t(days(3)),
    uploadedBy: mockUser,
    status: "ready",
    tags: ["design", "brand"],
  },
  {
    id: "doc-10",
    name: "Remote Work Equipment Policy.pdf",
    type: "pdf",
    size: 89_600,
    pageCount: 0,
    uploadedAt: t(days(2)),
    uploadedBy: priya,
    status: "processing",
    tags: ["hr", "policy"],
  },
  {
    id: "doc-11",
    name: "Vendor Onboarding Checklist.docx",
    type: "docx",
    size: 48_128,
    pageCount: 0,
    uploadedAt: t(days(1)),
    uploadedBy: priya,
    status: "processing",
    tags: ["operations"],
  },
  {
    id: "doc-12",
    name: "Compensation Bands - Engineering.xlsx",
    type: "xlsx",
    size: 76_800,
    pageCount: 0,
    uploadedAt: t(hours(6)),
    uploadedBy: mockUser,
    status: "failed",
    tags: ["hr", "compensation"],
  },
];

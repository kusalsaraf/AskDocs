// Playwright screenshot script for AskDocs README/portfolio
// Uses API route mocking to bypass CORS issues with the dev server.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:3001';
const API_BASE = 'http://localhost:8000/api/v1';
const OUT_DIR = path.resolve(__dirname, '../../docs/screenshots');

const ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzgwNDcyNzE3LCJpYXQiOjE3ODA0NjkxMTcsImp0aSI6IjJmNGI1YmM1NjgyYzQxNzE5M2JjOTRmZDE0YWZhMjE2IiwidXNlcl9pZCI6IjA0ZGFhNjk0LTNmODEtNDU1ZC04Njg5LWQxODE5YzJiMzNiYiJ9.fL-Ozw7YjvDdeCGghIza31iEi7VnokHNXB3fibdx10o';
const REFRESH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4MTA3MzkxNywiaWF0IjoxNzgwNDY5MTE3LCJqdGkiOiIwYjgzNjgxNmU3MTA0NDdmODRlNTU2YzgzYmMxNTBjYiIsInVzZXJfaWQiOiIwNGRhYTY5NC0zZjgxLTQ1NWQtODY4OS1kMTgxOWMyYjMzYmIifQ.UesXyWdIFGAwA0s3iq5N44i0rUY6VBu_G7-7d1vrFEI';
const WS_ID = '063af0a7-af09-4fe6-9932-93928d1f33c1';
const CHAT_ID = '2ff14560-9abb-4980-97b4-16946bb688d1';

// ── Mock data ─────────────────────────────────────────────────────────────────
const MOCK_USER = {
  id: '04daa694-3f81-455d-8689-d1819c2b33bb', email: 'kusal@company.com',
  first_name: 'Kusal', last_name: 'Saraf', display_name: 'Kusal Saraf', avatar_url: null,
  workspaces: [{
    id: WS_ID, name: 'Acme Corp', slug: 'acme-corp', is_personal: false,
    role: 'admin', member_count: 4, created_at: '2026-01-15T10:00:00Z',
  }],
};

const MOCK_CONVERSATIONS = {
  results: [
    { id: CHAT_ID, title: 'What are the main components of the BFSI sector?', last_message_at: '2026-06-03T05:30:00Z', message_count: 14 },
    { id: 'conv-2', title: 'Refund policy for monthly plans', last_message_at: '2026-06-02T14:20:00Z', message_count: 6 },
    { id: 'conv-3', title: 'Employee remote work policy', last_message_at: '2026-06-01T09:15:00Z', message_count: 4 },
    { id: 'conv-4', title: 'Q3 2026 product roadmap', last_message_at: '2026-05-30T16:45:00Z', message_count: 8 },
  ],
};

const MOCK_CONVERSATION = {
  id: CHAT_ID, title: 'What are the main components of the BFSI sector?',
  is_pinned: false, last_message_at: '2026-06-03T05:30:00Z',
  created_at: '2026-06-03T05:00:00Z', updated_at: '2026-06-03T05:30:00Z',
  messages: [
    {
      id: 'msg-1', role: 'user', content: 'What are the main components of the BFSI sector?',
      citations: [], is_cached: false, created_at: '2026-06-03T05:00:00Z',
    },
    {
      id: 'msg-2', role: 'assistant',
      content: 'The BFSI (Banking, Financial Services, and Insurance) sector encompasses three major segments:\n\n**Banking** includes retail banks, commercial banks, and investment banks that provide deposit, lending, and transaction services [1].\n\n**Financial Services** covers wealth management, stock broking, asset management, and capital markets operations [2].\n\n**Insurance** includes life, health, and general insurance providers offering risk management products [1].',
      citations: [
        { index: 1, chunk_id: 'c1', document_id: 'doc-1', document_filename: 'BFSI_Sector_Overview.pdf', page_number: 3, score: 0.94 },
        { index: 2, chunk_id: 'c2', document_id: 'doc-2', document_filename: 'Financial_Services_Report_2026.pdf', page_number: 7, score: 0.89 },
      ],
      is_cached: false, created_at: '2026-06-03T05:01:00Z',
    },
    {
      id: 'msg-3', role: 'user', content: 'Which segment has the highest market capitalisation?',
      citations: [], is_cached: false, created_at: '2026-06-03T05:05:00Z',
    },
    {
      id: 'msg-4', role: 'assistant',
      content: 'According to the 2026 market data, the **Banking** segment holds the largest share with approximately 45% of total BFSI market capitalisation, followed by Insurance at 32% and other Financial Services at 23% [1].',
      citations: [
        { index: 1, chunk_id: 'c3', document_id: 'doc-1', document_filename: 'BFSI_Sector_Overview.pdf', page_number: 12, score: 0.97 },
      ],
      is_cached: true, created_at: '2026-06-03T05:06:00Z',
    },
  ],
};

const MOCK_DOCUMENTS = [
  { id: 'doc-1', filename: 'BFSI_Sector_Overview.pdf', file_size_bytes: 2_340_000, mime_type: 'application/pdf', status: 'ready', error_message: '', uploaded_by: { id: 'u1', display_name: 'Kusal Saraf' }, created_at: '2026-06-01T10:00:00Z', updated_at: '2026-06-01T10:02:00Z' },
  { id: 'doc-2', filename: 'Financial_Services_Report_2026.pdf', file_size_bytes: 4_150_000, mime_type: 'application/pdf', status: 'ready', error_message: '', uploaded_by: { id: 'u1', display_name: 'Kusal Saraf' }, created_at: '2026-06-01T11:00:00Z', updated_at: '2026-06-01T11:03:00Z' },
  { id: 'doc-3', filename: 'Employee_Handbook_2026.pdf', file_size_bytes: 1_120_000, mime_type: 'application/pdf', status: 'ready', error_message: '', uploaded_by: { id: 'u2', display_name: 'Priya Mehta' }, created_at: '2026-05-28T09:00:00Z', updated_at: '2026-05-28T09:01:00Z' },
  { id: 'doc-4', filename: 'Refund_Policy_v3.docx', file_size_bytes: 256_000, mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', status: 'ready', error_message: '', uploaded_by: { id: 'u1', display_name: 'Kusal Saraf' }, created_at: '2026-05-25T14:00:00Z', updated_at: '2026-05-25T14:01:00Z' },
  { id: 'doc-5', filename: 'Q3_Product_Roadmap.pdf', file_size_bytes: 890_000, mime_type: 'application/pdf', status: 'processing', error_message: '', uploaded_by: { id: 'u3', display_name: 'Arjun Rao' }, created_at: '2026-06-03T06:00:00Z', updated_at: '2026-06-03T06:00:00Z' },
  { id: 'doc-6', filename: 'Legal_Compliance_2026.pdf', file_size_bytes: 3_200_000, mime_type: 'application/pdf', status: 'ready', error_message: '', uploaded_by: { id: 'u2', display_name: 'Priya Mehta' }, created_at: '2026-05-20T10:00:00Z', updated_at: '2026-05-20T10:04:00Z' },
];

const MOCK_PROVIDER = {
  provider_name: 'openai', model_name: 'gpt-4o', api_key_last_4: '3x9k',
  base_url: null, azure_region: null, temperature: 0.1, max_tokens: 2048,
  last_test_status: 'ok', last_tested_at: '2026-06-02T12:00:00Z', last_test_error: '',
};

const MOCK_SUPPORTED_PROVIDERS = [
  { name: 'openai', display_name: 'OpenAI', requires_api_key: true, supports_base_url: true, default_model: 'gpt-4o', available_models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { name: 'anthropic', display_name: 'Anthropic', requires_api_key: true, supports_base_url: false, default_model: 'claude-sonnet-4-6', available_models: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'] },
  { name: 'gemini', display_name: 'Google Gemini', requires_api_key: true, supports_base_url: false, default_model: 'gemini-2.0-flash', available_models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'] },
];

const MOCK_QUOTA = {
  user_messages_limit: 100, user_messages_used_today: 12, using_platform_default: false,
  global_budget_remaining: null, workspace_usage: null,
};

const MOCK_MEMBERS = {
  results: [
    { user_id: 'u1', first_name: 'Kusal', last_name: 'Saraf', email: 'kusal@company.com', avatar_url: null, role: 'admin', joined_at: '2026-01-15T10:00:00Z' },
    { user_id: 'u2', first_name: 'Priya', last_name: 'Mehta', email: 'priya@company.com', avatar_url: null, role: 'member', joined_at: '2026-02-01T10:00:00Z' },
    { user_id: 'u3', first_name: 'Arjun', last_name: 'Rao', email: 'arjun@company.com', avatar_url: null, role: 'member', joined_at: '2026-03-10T10:00:00Z' },
  ],
};

const MOCK_INVITATIONS = { results: [] };

// ── Helpers ───────────────────────────────────────────────────────────────────
function json(data) {
  return { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(data) };
}

async function setupMocks(page) {
  // Playwright uses "last registered wins" — catch-all must come FIRST
  await page.route(`${API_BASE}/**`, r => r.fulfill({ status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: '{}' }));
  // Specific routes registered after override the catch-all
  await page.route(`${API_BASE}/me/`, r => r.fulfill(json(MOCK_USER)));
  await page.route(`${API_BASE}/workspaces/${WS_ID}/conversations/`, r => r.fulfill(json(MOCK_CONVERSATIONS)));
  await page.route(`${API_BASE}/workspaces/${WS_ID}/conversations/${CHAT_ID}/`, r => r.fulfill(json(MOCK_CONVERSATION)));
  await page.route(`${API_BASE}/workspaces/${WS_ID}/conversations/conv-*/`, r => r.fulfill(json({ ...MOCK_CONVERSATION, id: 'conv-other', messages: [] })));
  await page.route(`${API_BASE}/workspaces/${WS_ID}/documents/`, r => r.fulfill(json(MOCK_DOCUMENTS)));
  await page.route(`${API_BASE}/workspaces/${WS_ID}/provider/`, r => r.fulfill(json(MOCK_PROVIDER)));
  await page.route(`${API_BASE}/providers/supported/`, r => r.fulfill(json(MOCK_SUPPORTED_PROVIDERS)));
  await page.route(`${API_BASE}/workspaces/${WS_ID}/chat/quota/`, r => r.fulfill(json(MOCK_QUOTA)));
  await page.route(`${API_BASE}/workspaces/${WS_ID}/members/`, r => r.fulfill(json(MOCK_MEMBERS)));
  await page.route(`${API_BASE}/workspaces/${WS_ID}/invitations/`, r => r.fulfill(json(MOCK_INVITATIONS)));
}

// addInitScript runs before page JS on every navigation — seeds localStorage reliably
async function seedAuth(page) {
  await page.addInitScript(({ access, refresh, workspace }) => {
    localStorage.setItem('askdocs_access_token', access);
    localStorage.setItem('askdocs_refresh_token', refresh);
    localStorage.setItem('askdocs_active_workspace', workspace);
  }, { access: ACCESS_TOKEN, refresh: REFRESH_TOKEN, workspace: WS_ID });
}

async function shot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  saved: ${name}.png`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const viewport = { width: 1440, height: 900 };
  const scale = { deviceScaleFactor: 2 };

  // ── Public pages (no auth) ─────────────────────────────────────────────
  const pubCtx = await browser.newContext({ viewport, ...scale });
  const pubPage = await pubCtx.newPage();
  await setupMocks(pubPage);

  console.log('1/6  landing-page');
  await pubPage.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await pubPage.waitForSelector('h1', { timeout: 15000 });
  await pubPage.waitForTimeout(500);
  await shot(pubPage, 'landing-page');

  console.log('2/6  sign-in');
  await pubPage.goto(`${BASE_URL}/sign-in`, { waitUntil: 'domcontentloaded' });
  await pubPage.waitForSelector('button', { timeout: 10000 });
  await pubPage.waitForTimeout(400);
  await shot(pubPage, 'sign-in');
  await pubCtx.close();

  // ── Authenticated pages ────────────────────────────────────────────────
  // Use a fresh context and seed localStorage via addInitScript (runs before page JS)
  const authCtx = await browser.newContext({ viewport, ...scale });
  const authPage = await authCtx.newPage();
  await setupMocks(authPage);
  await seedAuth(authPage);  // seeds localStorage on every navigation

  // ── 3. Chat interface ──────────────────────────────────────────────────
  console.log('3/6  chat-interface');
  await authPage.goto(`${BASE_URL}/chat/${CHAT_ID}`, { waitUntil: 'domcontentloaded' });
  await authPage.waitForTimeout(4000);  // let auth context + data load
  await shot(authPage, 'chat-interface');

  // ── 4. Documents library ───────────────────────────────────────────────
  console.log('4/6  documents-library');
  await authPage.goto(`${BASE_URL}/documents`, { waitUntil: 'domcontentloaded' });
  await authPage.waitForTimeout(3000);
  await shot(authPage, 'documents-library');

  // ── 5. Settings / AI Provider tab ─────────────────────────────────────
  console.log('5/6  settings-provider');
  await authPage.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
  await authPage.waitForTimeout(2500);
  const providerTab = authPage.getByRole('tab', { name: /ai provider|provider/i });
  if (await providerTab.isVisible().catch(() => false)) {
    await providerTab.click();
    await authPage.waitForTimeout(700);
  }
  await shot(authPage, 'settings-provider');

  // ── 6. Upload modal ────────────────────────────────────────────────────
  console.log('6/6  upload-modal');
  await authPage.goto(`${BASE_URL}/documents`, { waitUntil: 'domcontentloaded' });
  await authPage.waitForTimeout(2500);
  const uploadBtn = authPage.getByRole('button', { name: /upload/i });
  if (await uploadBtn.first().isVisible().catch(() => false)) {
    await uploadBtn.first().click();
    await authPage.waitForTimeout(1000);
  }
  await shot(authPage, 'upload-modal');

  await authCtx.close();
  await browser.close();
  console.log('\nAll screenshots saved to docs/screenshots/');
})();

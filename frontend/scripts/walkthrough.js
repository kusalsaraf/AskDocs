/**
 * AskDocs walkthrough video generator
 *
 * Pipeline:
 *   1. Generate per-scene narration audio via macOS `say`
 *   2. Measure exact audio durations with ffprobe
 *   3. Record a Playwright browser session with each scene timed to its narration
 *   4. Stitch audio segments (with silence gaps) into one track via ffmpeg
 *   5. Combine video + audio into docs/walkthrough.mp4
 */
const { chromium } = require('playwright');
const { execSync }  = require('child_process');
const path          = require('path');
const fs            = require('fs');

// ── Config ─────────────────────────────────────────────────────────────────
const BASE_URL  = 'http://localhost:3001';
const API_BASE  = 'http://localhost:8000/api/v1';
const WS_ID     = '063af0a7-af09-4fe6-9932-93928d1f33c1';
const CHAT_ID   = '2ff14560-9abb-4980-97b4-16946bb688d1';
const DOCS_DIR  = path.resolve(__dirname, '../../docs');
const TMP_DIR   = path.join(DOCS_DIR, '.video-tmp');
const OUT_FILE  = path.join(DOCS_DIR, 'walkthrough.mp4');
const VOICE     = 'Samantha';
const SAY_RATE  = 145;   // wpm — a clear, comfortable pace
const GAP_S     = 1.2;   // silence (seconds) between scenes

const ACCESS_TOKEN  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzgwNDcyNzE3LCJpYXQiOjE3ODA0NjkxMTcsImp0aSI6IjJmNGI1YmM1NjgyYzQxNzE5M2JjOTRmZDE0YWZhMjE2IiwidXNlcl9pZCI6IjA0ZGFhNjk0LTNmODEtNDU1ZC04Njg5LWQxODE5YzJiMzNiYiJ9.fL-Ozw7YjvDdeCGghIza31iEi7VnokHNXB3fibdx10o';
const REFRESH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsImV4cCI6MTc4MTA3MzkxNywiaWF0IjoxNzgwNDY5MTE3LCJqdGkiOiIwYjgzNjgxNmU3MTA0NDdmODRlNTU2YzgzYmMxNTBjYiIsInVzZXJfaWQiOiIwNGRhYTY5NC0zZjgxLTQ1NWQtODY4OS1kMTgxOWMyYjMzYmIifQ.UesXyWdIFGAwA0s3iq5N44i0rUY6VBu_G7-7d1vrFEI';

// ── Scene definitions ─────────────────────────────────────────────────────
const SCENES = [
  {
    name: 'landing',
    narration:
      'AskDocs is a multi-tenant document intelligence platform for B2B teams. ' +
      'Upload your company\'s PDFs, Word documents, and text files into an isolated workspace. ' +
      'Then ask questions in plain English and get answers — with citations linking to the exact source passages.',
    auth: false,
    act: async (page) => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('h1', { timeout: 10000 });
    },
    extra: async (page, remainMs) => {
      // Slow scroll to reveal features section
      const scrollMs = Math.max(remainMs - 1000, 0);
      const steps = 8;
      for (let i = 0; i < steps; i++) {
        await page.evaluate(() => window.scrollBy({ top: 180, behavior: 'smooth' }));
        await page.waitForTimeout(scrollMs / steps);
      }
      await page.waitForTimeout(1000);
    },
  },
  {
    name: 'signin',
    narration:
      'Teams sign in with Google OAuth and land in their isolated workspace. ' +
      'Access is controlled through admin and member roles.',
    auth: false,
    act: async (page) => {
      await page.goto(`${BASE_URL}/sign-in`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('button', { timeout: 8000 });
    },
    extra: async (page, remainMs) => {
      await page.waitForTimeout(remainMs);
    },
  },
  {
    name: 'chat',
    narration:
      'In the chat view, you ask questions about your uploaded documents. ' +
      'Every answer is grounded in your actual content — the model never invents facts. ' +
      'Each response includes inline citation numbers. ' +
      'The sidebar lists recent conversations for quick navigation.',
    auth: true,
    act: async (page) => {
      await page.goto(`${BASE_URL}/chat/${CHAT_ID}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
    },
    extra: async (page, remainMs) => {
      // Slowly scroll through the conversation
      const scrollMs = Math.max(remainMs - 2000, 0);
      const steps = 6;
      for (let i = 0; i < steps; i++) {
        await page.evaluate(() => window.scrollBy({ top: 90, behavior: 'smooth' }));
        await page.waitForTimeout(scrollMs / steps);
      }
      await page.waitForTimeout(2000);
    },
  },
  {
    name: 'documents',
    narration:
      'The document library shows all files with their processing status — ready, processing, or failed. ' +
      'Documents are parsed and indexed asynchronously in the background. ' +
      'Clicking Upload documents opens a drag-and-drop modal that accepts PDFs, DOCX, and TXT files.',
    auth: true,
    act: async (page) => {
      await page.goto(`${BASE_URL}/documents`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
    },
    extra: async (page, remainMs) => {
      // Show the grid for half the time, then open the upload modal
      await page.waitForTimeout(Math.floor(remainMs * 0.55));
      const btn = page.getByRole('button', { name: /upload/i });
      if (await btn.first().isVisible().catch(() => false)) {
        await btn.first().click();
        await page.waitForTimeout(Math.floor(remainMs * 0.45));
      } else {
        await page.waitForTimeout(Math.floor(remainMs * 0.45));
      }
    },
  },
  {
    name: 'settings',
    narration:
      'In workspace settings, each team configures their own AI provider. ' +
      'AskDocs supports OpenAI, Anthropic Claude, and Google Gemini. ' +
      'Your API key is encrypted at rest and never exposed to other workspace members.',
    auth: true,
    act: async (page) => {
      await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      const tab = page.getByRole('tab', { name: /ai provider|provider/i });
      if (await tab.isVisible().catch(() => false)) {
        await tab.click();
        await page.waitForTimeout(600);
      }
    },
    extra: async (page, remainMs) => {
      await page.waitForTimeout(remainMs);
    },
  },
  {
    name: 'outro',
    narration:
      'AskDocs — chat with your company\'s documents. Get answers with sources. ' +
      'Self-host on your own infrastructure, or run it on the free tier with your own API key.',
    auth: false,
    act: async (page) => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('h1', { timeout: 10000 });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    },
    extra: async (page, remainMs) => {
      await page.waitForTimeout(remainMs);
    },
  },
];

// ── Mock data (same as screenshots.js) ───────────────────────────────────
const MOCK_USER = {
  id: '04daa694-3f81-455d-8689-d1819c2b33bb', email: 'kusal@company.com',
  first_name: 'Kusal', last_name: 'Saraf', display_name: 'Kusal Saraf', avatar_url: null,
  workspaces: [{ id: WS_ID, name: 'Acme Corp', slug: 'acme-corp', is_personal: false, role: 'admin', member_count: 4, created_at: '2026-01-15T10:00:00Z' }],
};
const MOCK_CONVERSATIONS = { results: [
  { id: CHAT_ID, title: 'What are the main components of the BFSI sector?', last_message_at: '2026-06-03T05:30:00Z', message_count: 14 },
  { id: 'conv-2', title: 'Refund policy for monthly plans', last_message_at: '2026-06-02T14:20:00Z', message_count: 6 },
  { id: 'conv-3', title: 'Employee remote work policy', last_message_at: '2026-06-01T09:15:00Z', message_count: 4 },
]};
const MOCK_CONVERSATION = {
  id: CHAT_ID, title: 'What are the main components of the BFSI sector?',
  is_pinned: false, last_message_at: '2026-06-03T05:30:00Z', created_at: '2026-06-03T05:00:00Z', updated_at: '2026-06-03T05:30:00Z',
  messages: [
    { id: 'msg-1', role: 'user', content: 'What are the main components of the BFSI sector?', citations: [], is_cached: false, created_at: '2026-06-03T05:00:00Z' },
    { id: 'msg-2', role: 'assistant', content: 'The BFSI (Banking, Financial Services, and Insurance) sector encompasses three major segments:\n\n**Banking** includes retail banks, commercial banks, and investment banks that provide deposit, lending, and transaction services [1].\n\n**Financial Services** covers wealth management, stock broking, asset management, and capital markets operations [2].\n\n**Insurance** includes life, health, and general insurance providers offering risk management products [1].', citations: [{ index: 1, chunk_id: 'c1', document_id: 'doc-1', document_filename: 'BFSI_Sector_Overview.pdf', page_number: 3, score: 0.94 }, { index: 2, chunk_id: 'c2', document_id: 'doc-2', document_filename: 'Financial_Services_Report_2026.pdf', page_number: 7, score: 0.89 }], is_cached: false, created_at: '2026-06-03T05:01:00Z' },
    { id: 'msg-3', role: 'user', content: 'Which segment has the highest market capitalisation?', citations: [], is_cached: false, created_at: '2026-06-03T05:05:00Z' },
    { id: 'msg-4', role: 'assistant', content: 'According to the 2026 market data, the **Banking** segment holds the largest share with approximately 45% of total BFSI market capitalisation, followed by Insurance at 32% and other Financial Services at 23% [1].', citations: [{ index: 1, chunk_id: 'c3', document_id: 'doc-1', document_filename: 'BFSI_Sector_Overview.pdf', page_number: 12, score: 0.97 }], is_cached: true, created_at: '2026-06-03T05:06:00Z' },
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
const MOCK_PROVIDER = { provider_name: 'openai', model_name: 'gpt-4o', api_key_last_4: '3x9k', base_url: null, azure_region: null, temperature: 0.1, max_tokens: 2048, last_test_status: 'ok', last_tested_at: '2026-06-02T12:00:00Z', last_test_error: '' };
const MOCK_SUPPORTED_PROVIDERS = [
  { name: 'openai', display_name: 'OpenAI', requires_api_key: true, supports_base_url: true, default_model: 'gpt-4o', available_models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
  { name: 'anthropic', display_name: 'Anthropic', requires_api_key: true, supports_base_url: false, default_model: 'claude-sonnet-4-6', available_models: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'] },
  { name: 'gemini', display_name: 'Google Gemini', requires_api_key: true, supports_base_url: false, default_model: 'gemini-2.0-flash', available_models: ['gemini-2.0-flash', 'gemini-1.5-pro'] },
];
const MOCK_QUOTA = { user_messages_limit: 100, user_messages_used_today: 12, using_platform_default: false, global_budget_remaining: null, workspace_usage: null };
const MOCK_MEMBERS = { results: [{ user_id: 'u1', first_name: 'Kusal', last_name: 'Saraf', email: 'kusal@company.com', avatar_url: null, role: 'admin', joined_at: '2026-01-15T10:00:00Z' }] };
const MOCK_INVITATIONS = { results: [] };

// ── Helpers ───────────────────────────────────────────────────────────────
function jsonResp(data) {
  return { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(data) };
}

async function setupMocks(page) {
  await page.route(`${API_BASE}/**`, r => r.fulfill({ status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: '{}' }));
  await page.route(`${API_BASE}/me/`, r => r.fulfill(jsonResp(MOCK_USER)));
  await page.route(`${API_BASE}/workspaces/${WS_ID}/conversations/`, r => r.fulfill(jsonResp(MOCK_CONVERSATIONS)));
  await page.route(`${API_BASE}/workspaces/${WS_ID}/conversations/${CHAT_ID}/`, r => r.fulfill(jsonResp(MOCK_CONVERSATION)));
  await page.route(`${API_BASE}/workspaces/${WS_ID}/documents/`, r => r.fulfill(jsonResp(MOCK_DOCUMENTS)));
  await page.route(`${API_BASE}/workspaces/${WS_ID}/provider/`, r => r.fulfill(jsonResp(MOCK_PROVIDER)));
  await page.route(`${API_BASE}/providers/supported/`, r => r.fulfill(jsonResp(MOCK_SUPPORTED_PROVIDERS)));
  await page.route(`${API_BASE}/workspaces/${WS_ID}/chat/quota/`, r => r.fulfill(jsonResp(MOCK_QUOTA)));
  await page.route(`${API_BASE}/workspaces/${WS_ID}/members/`, r => r.fulfill(jsonResp(MOCK_MEMBERS)));
  await page.route(`${API_BASE}/workspaces/${WS_ID}/invitations/`, r => r.fulfill(jsonResp(MOCK_INVITATIONS)));
}

function audioDuration(file) {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`,
    { encoding: 'utf8' }
  );
  return parseFloat(out.trim());
}

function sh(cmd) {
  execSync(cmd, { stdio: 'pipe' });
}

// ── Step 1: Generate audio ────────────────────────────────────────────────
async function generateAudio() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const durations = [];
  for (let i = 0; i < SCENES.length; i++) {
    const s = SCENES[i];
    const file = path.join(TMP_DIR, `scene_${i}.aiff`);
    if (!fs.existsSync(file)) {
      process.stdout.write(`  generating audio ${i + 1}/${SCENES.length}: ${s.name} … `);
      execSync(`say -v "${VOICE}" -r ${SAY_RATE} -o "${file}" "${s.narration.replace(/"/g, '\\"')}"`);
      console.log('done');
    }
    const dur = audioDuration(file);
    durations.push(dur);
    console.log(`  scene ${i + 1} (${s.name}): ${dur.toFixed(2)}s audio`);
  }
  return durations;
}

// ── Step 2: Build full narration track ───────────────────────────────────
function buildFullAudio(durations) {
  const silFile = path.join(TMP_DIR, 'silence.wav');
  const fullAudio = path.join(TMP_DIR, 'narration.aac');
  if (fs.existsSync(fullAudio)) return { fullAudio, totalDuration: durations.reduce((a, b) => a + b, 0) + (SCENES.length - 1) * GAP_S };

  // Generate silence gap
  sh(`ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t ${GAP_S} "${silFile}"`);

  // Convert all scene audios to wav for consistent concatenation
  const wavFiles = [];
  for (let i = 0; i < SCENES.length; i++) {
    const src = path.join(TMP_DIR, `scene_${i}.aiff`);
    const dst = path.join(TMP_DIR, `scene_${i}.wav`);
    sh(`ffmpeg -y -i "${src}" -ar 44100 -ac 2 "${dst}"`);
    wavFiles.push(dst);
  }

  // Build concat list: scene0, sil, scene1, sil, ..., sceneN
  const concatParts = [];
  for (let i = 0; i < wavFiles.length; i++) {
    concatParts.push(`file '${wavFiles[i]}'`);
    if (i < wavFiles.length - 1) concatParts.push(`file '${silFile}'`);
  }
  const listFile = path.join(TMP_DIR, 'audio_list.txt');
  fs.writeFileSync(listFile, concatParts.join('\n'));

  // Concatenate and encode to AAC
  sh(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c:a aac -b:a 192k "${fullAudio}"`);

  const totalDuration = durations.reduce((a, b) => a + b, 0) + (SCENES.length - 1) * GAP_S;
  return { fullAudio, totalDuration };
}

// ── Step 3: Record video with Playwright ─────────────────────────────────
async function recordVideo(durations) {
  const videoDir = TMP_DIR;
  const browser  = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } },
  });
  const page = await ctx.newPage();
  await setupMocks(page);

  // Manage localStorage tokens per-scene:
  // - public scenes (landing, sign-in, outro): NO tokens so the page renders normally
  // - auth scenes (chat, documents, settings): inject tokens before navigation
  //
  // page.evaluate() requires being on an HTTP origin, so we do an initial
  // navigation to establish the origin, then clear/inject as needed.

  async function clearAuth() {
    await page.evaluate(() => {
      localStorage.removeItem('askdocs_access_token');
      localStorage.removeItem('askdocs_refresh_token');
    });
  }

  async function injectAuth() {
    await page.evaluate(({ a, r, w }) => {
      localStorage.setItem('askdocs_access_token', a);
      localStorage.setItem('askdocs_refresh_token', r);
      localStorage.setItem('askdocs_active_workspace', w);
    }, { a: ACCESS_TOKEN, r: REFRESH_TOKEN, w: WS_ID });
  }

  // ── Scene 1: Landing page ──────────────────────────────────────────────
  {
    const i = 0, d = durations[i];
    process.stdout.write(`  scene 1/6: landing (${d.toFixed(1)}s) … `);
    const t0 = Date.now();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    // Now on an origin — auth is clear by default on fresh context
    await page.waitForSelector('h1', { timeout: 15000 });
    const elapsed = Date.now() - t0;
    const remainMs = Math.max(Math.round(d * 1000) - elapsed, 500);
    // Slow scroll through features
    const steps = 10;
    for (let s = 0; s < steps; s++) {
      await page.evaluate(() => window.scrollBy({ top: 160, behavior: 'smooth' }));
      await page.waitForTimeout(remainMs / steps);
    }
    await page.waitForTimeout(Math.round(GAP_S * 1000));
    console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  // ── Scene 2: Sign-in ──────────────────────────────────────────────────
  {
    const i = 1, d = durations[i];
    process.stdout.write(`  scene 2/6: sign-in (${d.toFixed(1)}s) … `);
    const t0 = Date.now();
    await clearAuth();
    await page.goto(`${BASE_URL}/sign-in`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button', { timeout: 8000 });
    await page.waitForTimeout(Math.max(Math.round(d * 1000) - (Date.now() - t0), 500));
    await page.waitForTimeout(Math.round(GAP_S * 1000));
    console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  // ── Scene 3: Chat interface ───────────────────────────────────────────
  {
    const i = 2, d = durations[i];
    process.stdout.write(`  scene 3/6: chat (${d.toFixed(1)}s) … `);
    const t0 = Date.now();
    await injectAuth();
    await page.goto(`${BASE_URL}/chat/${CHAT_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const elapsed = Date.now() - t0;
    const scrollMs = Math.max(Math.round(d * 1000) - elapsed - 1500, 500);
    const steps = 8;
    for (let s = 0; s < steps; s++) {
      await page.evaluate(() => window.scrollBy({ top: 80, behavior: 'smooth' }));
      await page.waitForTimeout(scrollMs / steps);
    }
    await page.waitForTimeout(1500);
    await page.waitForTimeout(Math.round(GAP_S * 1000));
    console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  // ── Scene 4: Documents + upload modal ────────────────────────────────
  {
    const i = 3, d = durations[i];
    process.stdout.write(`  scene 4/6: documents (${d.toFixed(1)}s) … `);
    const t0 = Date.now();
    await injectAuth();
    await page.goto(`${BASE_URL}/documents`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const elapsed = Date.now() - t0;
    const remainMs = Math.max(Math.round(d * 1000) - elapsed, 2000);
    await page.waitForTimeout(Math.floor(remainMs * 0.5));
    const btn = page.getByRole('button', { name: /upload/i });
    if (await btn.first().isVisible().catch(() => false)) {
      await btn.first().click();
      await page.waitForTimeout(Math.floor(remainMs * 0.5));
    } else {
      await page.waitForTimeout(Math.floor(remainMs * 0.5));
    }
    await page.waitForTimeout(Math.round(GAP_S * 1000));
    console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  // ── Scene 5: Settings / AI Provider ──────────────────────────────────
  {
    const i = 4, d = durations[i];
    process.stdout.write(`  scene 5/6: settings (${d.toFixed(1)}s) … `);
    const t0 = Date.now();
    await injectAuth();
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const tab = page.getByRole('tab', { name: /ai provider|provider/i });
    if (await tab.isVisible().catch(() => false)) {
      await tab.click();
      await page.waitForTimeout(700);
    }
    const elapsed = Date.now() - t0;
    await page.waitForTimeout(Math.max(Math.round(d * 1000) - elapsed, 500));
    await page.waitForTimeout(Math.round(GAP_S * 1000));
    console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  // ── Scene 6: Outro (landing page, no auth) ────────────────────────────
  {
    const i = 5, d = durations[i];
    process.stdout.write(`  scene 6/6: outro (${d.toFixed(1)}s) … `);
    const t0 = Date.now();
    await clearAuth();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { timeout: 15000 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    const elapsed = Date.now() - t0;
    await page.waitForTimeout(Math.max(Math.round(d * 1000) - elapsed, 500));
    console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  await ctx.close();  // finalises the .webm file

  const webms = fs.readdirSync(videoDir).filter(f => f.endsWith('.webm'));
  if (!webms.length) throw new Error('No .webm video found in ' + videoDir);
  const webm = webms
    .map(f => ({ f, mtime: fs.statSync(path.join(videoDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0].f;

  await browser.close();
  return path.join(videoDir, webm);
}

// ── Step 4: Combine video + audio ─────────────────────────────────────────
function combineVideoAudio(videoFile, audioFile) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  // Convert webm to mp4 first (some players struggle with webm+aac)
  const tmpMp4 = path.join(TMP_DIR, 'raw_video.mp4');
  sh(`ffmpeg -y -i "${videoFile}" -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p "${tmpMp4}"`);

  // Merge: keep video length, add audio track (pad or trim as needed)
  sh(
    `ffmpeg -y -i "${tmpMp4}" -i "${audioFile}" ` +
    `-c:v copy -c:a aac -b:a 192k ` +
    `-filter_complex "[1:a]apad[a]" -map 0:v -map "[a]" ` +
    `-shortest "${OUT_FILE}"`
  );
}

// ── Main ──────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n── Step 1: Generate scene narration audio ──────────────────');
  const durations = await generateAudio();
  const total = durations.reduce((a, b) => a + b, 0) + (SCENES.length - 1) * GAP_S;
  console.log(`  total narration: ${total.toFixed(1)}s`);

  console.log('\n── Step 2: Build full narration track ──────────────────────');
  const { fullAudio } = buildFullAudio(durations);
  console.log(`  audio track: ${fullAudio}`);

  console.log('\n── Step 3: Record browser walkthrough ───────────────────────');
  const videoFile = await recordVideo(durations);
  console.log(`  video: ${videoFile}`);

  console.log('\n── Step 4: Combine video + audio ────────────────────────────');
  combineVideoAudio(videoFile, fullAudio);
  const stats = fs.statSync(OUT_FILE);
  console.log(`  output: ${OUT_FILE}  (${(stats.size / 1_000_000).toFixed(1)} MB)`);

  console.log('\nDone! docs/walkthrough.mp4 is ready.\n');
})();

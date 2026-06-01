# Freelance Pitch

This document prepares you to talk about AskDocs confidently in Upwork proposals, Toptal screenings, and client conversations. It is not marketing copy — it is preparation material grounded in the actual implementation.

## The 30-Second Elevator Pitch

> "AskDocs is a multi-tenant RAG platform I built from scratch. Teams upload their documents — PDFs, DOCX, plain text — and ask natural-language questions against them. Answers stream back in real time with inline citations pointing to the exact source passages. The backend is Django with pgvector for vector search, Celery for async document processing, and a provider-abstraction system that lets each workspace connect their own LLM key — OpenAI, Anthropic, Gemini, Azure, Mistral, Groq, or local Ollama. It's the kind of system you'd build for an enterprise knowledge base, a legal document assistant, or an internal AI search tool."

## The 3-Minute Walkthrough

*Use this as a script for a spoken demo or portfolio walk-through. Adjust timing as needed.*

**Opening (30s):** "I'll walk you through AskDocs — a document-question-answering platform I designed and built. I'll cover the architecture, the interesting technical decisions, and what I'd do differently."

**The upload pipeline (45s):** "When you upload a document, the API creates a database row, dispatches a Celery task, and returns immediately. The worker then runs the document through an unstructured.io parser — which gives you typed elements: titles, paragraphs, tables, list items. Those get chunked at 512-token boundaries using tiktoken, then embedded into a pgvector HNSW index at 768 dimensions. Everything is workspace-scoped — Workspace A's documents are never visible to Workspace B."

**The chat pipeline (45s):** "When you ask a question, the API embeds the query with the same model, runs a cosine similarity search in Postgres — no external vector database — and retrieves the top 5 chunks above a 0.5 score threshold. Those chunks get numbered and inserted into the prompt. The response streams back as SSE with [1], [2] citation markers. After the stream completes, the citation indices are mapped back to the exact chunk UUIDs, which the frontend uses to render the sources panel."

**The BYOK system (30s):** "Each workspace can bring its own API key — OpenAI, Anthropic, Gemini, or six other providers. Keys are encrypted at rest with Fernet before hitting the database. Workspaces with their own key bypass my platform rate limits and pay their own usage directly. Workspaces without a key fall back to a platform default — currently Gemini — with per-user and global daily limits enforced via Redis."

**The multi-tenancy model (30s):** "Isolation is enforced at three layers. Permission classes at the HTTP layer check workspace membership before any view logic runs. A queryset mixin filters every database query to the current workspace. And child models like DocumentChunk and Message carry a denormalized workspace FK so retrieval queries never need a join. It's the same pattern you'd use in a production SaaS."

**Wrap-up (15s):** "The backend is production-ready minus the file upload REST API, which I'm building in Phase 6. The deployment target is Fly.io + Supabase + Upstash — all free tier, all standard infrastructure choices."

## Talking Points by Client Type

### Startup wanting a RAG feature

*"Your users have documents — contracts, manuals, research reports. Instead of building this from scratch, you need a team that understands the full pipeline: async ingestion, chunking strategy, vector retrieval, streaming responses, citation accuracy. I've built every layer of that. I can integrate it into your product or extend it to fit your domain. The key decisions — which chunking model, which embedding model, how to bound conversation history — I've already worked through."*

### Enterprise wanting BYOK

*"Enterprise clients won't let their documents hit a third-party LLM key. They need to bring their own. AskDocs has a working BYOK system supporting seven providers — OpenAI, Anthropic, Gemini, Azure, Mistral, Groq, and local Ollama for air-gapped deployments. API keys are encrypted with Fernet before database storage. The test-connection endpoint lets workspace admins verify their key works before going live. Each provider follows the same interface, so adding a new one is a day's work."*

### Indie founder wanting multi-tenant SaaS

*"Multi-tenancy is one of the hardest things to add after the fact. AskDocs was designed tenant-first. The permission model, the queryset mixin, the denormalized workspace IDs on child tables — everything is built around hard isolation between workspaces. The invite system handles onboarding. The three-role model (Admin, Member, Viewer) is simple enough for a small team and flexible enough for a 500-person org."*

## Common Questions and Answers

**"Why Django and not FastAPI?"**

> Django was the right call for this project because it comes with a complete ecosystem out of the box — ORM, migrations, admin, authentication. I needed multi-tenancy, role-based permissions, and a solid user model. Building that from scratch with FastAPI would have taken longer. Django REST Framework gave me browsable API docs, serializer validation, and viewset patterns that map cleanly to REST. If I were building a pure microservice with high-throughput real-time requirements, I'd use FastAPI. For a full-featured SaaS, Django was the better tool.

**"How would you scale this to 1 million documents?"**

> The current architecture scales reasonably well. pgvector with HNSW handles tens of millions of vectors — you just need to tune `m` and `ef_construction`. The real bottleneck would be the Celery worker: a single worker can process maybe 20-50 documents per hour depending on file size and embedding batching. You'd scale by running multiple workers (`--concurrency=4`), sharding the Celery queue by workspace, and moving to a distributed task system if needed. The embedding step is the most expensive — batching requests (which the current code doesn't yet do) would help. Object storage is already externalizable to S3. The Django API itself is stateless and horizontally scalable. You'd add a read replica for retrieval queries and a separate write replica for ingestion, and you'd hit the database's horizontal scaling limit well past 1M documents at typical query rates.

**"What if the LLM hallucinates?"**

> The system prompt explicitly instructs the model to only answer from the numbered context chunks and to say clearly when it doesn't know. Citation enforcement — every claim must have a `[N]` marker — makes hallucinations visible: if the model makes something up, there won't be a citation backing it. The sources panel lets users verify claims against the original text. This doesn't eliminate hallucination, but it makes it auditable. For high-stakes use cases (legal, medical), I'd add a similarity-check post-processor that flags responses where the cited chunk doesn't semantically support the claim.

**"How do you handle GDPR?"**

> The design supports GDPR compliance: all data is workspace-scoped, so a right-to-erasure request is a workspace deletion. Deleting a workspace cascades to all documents, chunks, conversations, and messages. API keys are encrypted at rest and only decrypted in memory. The system doesn't train on user documents — they're chunked, embedded, and retrieved, but the raw bytes and chunks are only used at query time. For full GDPR compliance you'd add: data residency controls (EU-only Fly.io regions), a data processing agreement with any LLM provider, and audit logs for data access — none of which are in the current build.

**"Why not use LangChain / LlamaIndex?"**

> I considered both. I chose to build the pipeline directly for two reasons. First, I wanted to understand every layer — chunking strategy, retrieval threshold, prompt construction, citation extraction — without framework magic hiding the decisions. Second, LangChain and LlamaIndex are moving fast and have historically had breaking changes and leaky abstractions. For a production system, I'd rather own the pipeline. The retrieval logic in `chat/retrieval.py` is ~40 lines. The prompt builder is ~50 lines. There's no abstraction that couldn't be handed to a new engineer in an afternoon. That said, for rapid prototyping or if you need multi-step agents, LangChain is a reasonable choice.

**"What would you do differently with more time?"**

> A few things. First, the embedding step embeds one chunk at a time — I'd add batch embedding (pass a list of texts to the embedding API in one call) to reduce ingestion latency and API cost by ~10x. Second, I'd add a reranker (cross-encoder) pass after initial vector retrieval to improve citation precision for ambiguous queries. Third, I'd add conversation-level document scoping — right now retrieval searches all workspace documents; for large workspaces you'd want to let users specify which documents to query. Fourth, I'd improve the chunking strategy with sliding-window overlap across section boundaries, not just token boundaries. Fifth, the test-connection endpoint currently just sends a 5-token ping — I'd make it a more realistic end-to-end test that validates model access specifically.

## Skills This Project Demonstrates

**Architecture:**
- Multi-tenant SaaS design with hard data isolation
- Layered architecture (views → serializers → services → models)
- Asynchronous pipeline design (Celery + Redis)
- Provider abstraction pattern (registry + factory + base class)
- State machine design (document lifecycle)

**Backend:**
- Django 5 + DRF 3.15 (serializers, viewsets, custom permissions, mixins)
- PostgreSQL query optimization (denormalized FKs, composite indexes)
- pgvector HNSW index design and cosine similarity retrieval
- Celery task design (retries, error handling, idempotency)
- Redis-backed rate limiting and response caching
- Fernet encryption for secrets at rest
- Server-Sent Events (SSE) streaming API
- JWT authentication with token rotation and blacklisting
- Google OAuth 2.0 integration via allauth + dj-rest-auth

**Testing:**
- pytest with real database integration tests
- Multi-tenancy isolation tests
- Permission enforcement tests
- SSE streaming response tests with mock providers

**Operational:**
- 12-factor app configuration (env vars, no secrets in code)
- Docker + docker-compose for local development
- Health check endpoint
- Structured JSON logging in production
- drf-spectacular OpenAPI schema generation

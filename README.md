<p align="center">
  <img src="public/brand/loom-logo.svg" width="360" alt="Loom" />
</p>

<h1 align="center">Loom</h1>

<p align="center"><strong>Turn one complex goal into a live, durable, validated agent swarm.</strong></p>
<p align="center">
  <em>Plan · Delegate · Execute · Validate · Synthesize</em>
</p>

<p align="center">
  <a href="https://github.com/D3S-Gaurav/Loom/actions/workflows/ci.yml"><img src="https://github.com/D3S-Gaurav/Loom/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="Contributions welcome" /></a>
</p>

---

## 🧬 What is Loom?

**Loom** is a production-oriented orchestration workspace that decomposes a single complex goal into a **Directed Acyclic Graph (DAG)** of specialized agent tasks. A planner creates the task graph, workers execute ready tasks in parallel, a mode-aware validator can request focused revisions, and a synthesizer produces the final answer — all while **React Flow** renders every event in real time.

It's not just a demo. Loom pairs a focused product experience with **production-grade identity, billing, durable workflows, streaming state, distributed infrastructure, and observability**.

---

## ✨ Key Features

| Feature | Description |
|---|---|
| 🧠 **AI-Powered Planning** | An LLM planner decomposes goals into a typed, dependency-aware task DAG with Zod-validated structured output. |
| ⚡ **Parallel Execution** | Independent tasks in the DAG run concurrently — the swarm gets latency benefits over serial task lists. |
| ✅ **Mode-Aware Validation** | A validator agent reviews each task output. Rejected outputs get concrete feedback for self-correction (revision depth is mode-controlled). |
| 🔬 **Live Research** | Researcher agents use bounded Firecrawl web search, preserve source links, and state clearly when live search is unavailable. |
| 📊 **Real-Time Visualization** | React Flow renders the live execution graph. Zustand drives the state. WebSocket-first with SSE fallback. |
| 🔐 **Production Auth & Billing** | Better Auth email/password sessions backed by PostgreSQL. Stripe Checkout, signed webhooks, Customer Portal, and entitlement projection. |
| 🏗️ **Durable Workflows** | Temporal moves long-running orchestration out of the HTTP process. Heartbeats, cancellation, and crash recovery. |
| 📡 **Polyglot Telemetry** | A standalone Go service consumes Kafka events and fans them out via gRPC, WebSocket, and Prometheus metrics. |
| 🖼️ **Image Understanding** | Cloudinary stores attached images as authenticated assets. A vision model derives instruction-resistant text context. |
| 🤖 **MCP Server** | A read-only, account-scoped Streamable HTTP MCP server lets Codex or Claude Code discover runs and retrieve final Markdown deliverables. |

---

## 🏛️ Architecture Overview

```text
Browser
  │ authenticated POST /api/swarm { goal, mode, attachments }
  ▼
Next.js Route Adapter
  ├─ session + origin + bounded input + infrastructure checks
  ├─ PostgreSQL plan lookup → Redis user quota
  ├─ text file ─────────────────────────────┐
  ├─ public GitHub repo → fixed GitHub API ─┤→ untrusted reference context
  ├─ image → authenticated Cloudinary asset ┘→ vision-derived text
  └─ starts Temporal workflow
          │
          ▼
Temporal Worker → swarm Activity → planner → DAG workers → validators → synthesizer
          │                         │
          │                         ├─ OpenRouter through Vercel AI SDK
          │                         └─ Zod structured-output validation
          ▼
Redis event stream ──SSE (fallback + durable replay)──▶ Zustand ──▶ React Flow
          │                                                          ▲
          └─ Kafka ──▶ Go telemetry consumer ──┬─▶ /metrics          │  (Prometheus)
                                               ├─▶ gRPC :9090       │  (StreamRunEvents)
                                               └─▶ wss://.../ws ────┘  (primary browser transport)

Codex / Claude Code ──bearer token──▶ /api/mcp
                                      ├─ list_runs
                                      └─ get_final_deliverable
```

> The planner, worker, validator, and synthesizer are **code roles**, not separate servers. TypeScript controls their order and data flow; the LLM supplies language reasoning.

---

## 🎛️ Execution Modes

Loom provides three execution modes that control DAG size, validation depth, and token budgets:

| Mode | DAG Size | Revision Budget | Repeated-Context Policy | Best Fit |
|---|---:|---:|---|---|
| **Low** | 1–2 tasks | 0 revisions | smallest budgets | fast, concise work |
| **Auto** | 2–4 tasks | up to 1 revision | balanced budgets | normal adaptive use |
| **Max** | 4–6 tasks | up to 2 revisions | largest bounded context | deep, multi-angle work |

> Max is deliberately more expensive and slower, but **never unbounded**. Every mode has deterministic caps on material repeated between model calls.

### Token-Efficiency Design

| Mode | Upstream Handoff | Revision Feedback | Worker → Validation | Synthesis Corpus |
|---|---:|---:|---:|---:|
| Low | 4,000 chars | 1,000 chars | 8,000 chars | 12,000 chars |
| Auto | 8,000 chars | 2,000 chars | 12,000 chars | 24,000 chars |
| Max | 16,000 chars | 4,000 chars | 24,000 chars | 48,000 chars |

- Upstream blackboard outputs, validator inputs, revision feedback, and the synthesis corpus each have a **mode-specific character budget**
- Labeled sections share a budget fairly — one oversized worker cannot crowd out every other specialist
- Compaction preserves section labels plus opening and conclusion, with an explicit truncation marker
- Attachment data is prepared once for planning, not copied raw into every worker prompt

---

## 🛡️ Security Boundaries

- **Text files** are type-checked and size-bounded before becoming untrusted planner context.
- **GitHub attachments** accept only exact public `https://github.com/owner/repository` URLs. Loom constructs the `api.github.com` request itself — no user-controlled host fetching.
- **Image attachments** are validated, stored with Cloudinary's `authenticated` delivery type, and described by a vision model told to treat visible instructions as data.
- **Raw base64 image data** is never written to Redis run state, Kafka events, or Temporal input. Only the derived text description enters orchestration.

---

## 🧱 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16, React 19, React Flow, Zustand, Tailwind CSS |
| **AI / LLM** | Vercel AI SDK, OpenRouter, Zod structured outputs |
| **Auth** | Better Auth (email/password + PostgreSQL sessions) |
| **Billing** | Stripe Checkout, webhooks, Customer Portal |
| **Orchestration** | Temporal (durable workflows, activities, heartbeats) |
| **State & Cache** | Redis (run state, event replay, rate limits via Lua scripts) |
| **Event Streaming** | Kafka (versioned swarm envelopes, 6-partition topic) |
| **Telemetry** | Go service (gRPC, WebSocket, Prometheus /metrics) |
| **Media** | Cloudinary (authenticated image storage) |
| **Research** | Firecrawl (bounded web search with source preservation) |
| **Database** | PostgreSQL (users, sessions, billing projection) |
| **Testing** | Vitest (TS), Go test with `-race` |

---

## 📂 Repository Layout

```
src/
├── app/                    Next.js routes and page composition
│   ├── api/                API routes (swarm, billing, chat, MCP, auth)
│   └── sign-in/            Authentication page
├── components/             React components (SwarmGraph, GoalBar, SidePanel, etc.)
├── lib/
│   ├── swarm/              Core orchestration domain + application services
│   │   ├── orchestrator.ts     DAG execution engine
│   │   ├── planner.ts          LLM-powered task decomposition
│   │   ├── worker.ts           Specialist agent execution
│   │   ├── validator.ts        Output quality gate
│   │   ├── bus.ts              Event bus (Redis + Kafka)
│   │   ├── runStream.ts        Client-side stream management
│   │   └── tokenBudget.ts      Mode-aware context compaction
│   ├── billing/            Plans, Stripe gateway, entitlement repository
│   ├── mcp/                Model Context Protocol server + token service
│   ├── media/              Authenticated Cloudinary image storage adapter
│   ├── research/           Firecrawl web search integration
│   ├── auth.ts             Identity and shared authentication policy
│   └── store.ts            Zustand global store
├── styles/                 CSS modules (foundation, workspace, auth, etc.)
└── temporal/               Temporal workflow/worker process boundary

services/telemetry/         Independent Go Kafka consumer → gRPC + WS + Prometheus
proto/telemetry/v1/         Protocol Buffer contracts for the gRPC surface
scripts/                    Idempotent database migrations + build scripts
docs/                       Architecture, design, product, and deployment docs
```

---

## 🚀 Local Setup

### Prerequisites

- **Node.js** 20+
- **pnpm** 11
- **Docker** (for Redis, PostgreSQL, Kafka, Temporal)
- **OpenRouter API key**
- Firecrawl API key *(optional — enables live Researcher web search)*

### Quick Start

```bash
# Install dependencies
pnpm install

# Set up environment
cp .env.example .env.local
# Fill in: OPENROUTER_API_KEY, BETTER_AUTH_SECRET
# Optional: FIRECRAWL_API_KEY, CLOUDINARY_*, STRIPE_*

# Start infrastructure
pnpm infra:up

# Run database migrations
pnpm db:migrate

# Start the Temporal worker (in a second terminal)
pnpm temporal:worker

# Start the dev server
pnpm dev
# → http://localhost:3000
```

Generate an auth secret: `openssl rand -base64 32`

### Local Services

| Service | Address | Purpose |
|---|---|---|
| Next.js | `http://localhost:3000` | UI, auth, API, SSE fallback + durable replay |
| Temporal UI | `http://localhost:8233` | Workflow inspection |
| Go Telemetry HTTP | `http://localhost:9091/metrics` | Prometheus metrics, `/healthz` |
| Go Telemetry WS | `ws://localhost:9091/ws` | Primary live event transport for the UI |
| Go Telemetry gRPC | `localhost:9090` | `TelemetryService`, health, reflection |
| PostgreSQL | `localhost:5432` | Users, sessions, billing |
| Redis | `localhost:6379` | State, replay, limits |
| Kafka | `localhost:9092` | Event stream |

---

## 📡 Real-Time Event Transport

### Transport Selection

| `NEXT_PUBLIC_TELEMETRY_WS_URL` | Live Transport |
|---|---|
| **set** | WebSocket (with automatic fallback to SSE) |
| **empty** | SSE only |

The graph header shows which transport is actually live — the choice is **observable in the product**, not asserted in a diagram.

### Why WebSocket + SSE Fallback?

- **WebSocket** is preferred because it pushes events straight off the Kafka fan-out (zero-latency), while SSE polls Redis at 150ms intervals.
- **SSE** is the fallback because Vercel's serverless functions cannot hold a long-lived socket open, and corporate proxies may refuse `Upgrade`.
- **A durable Redis log** sits underneath both. Every frame carries a monotonic `sequence`; gaps trigger replay from the Redis-backed endpoint. A replayed event is a no-op.

### Fan-Out Architecture

The Go telemetry consumer reads each Kafka partition once and fans events out through an in-process hub. Each subscriber owns a **256-event buffered channel**; `hub.publish` sends non-blocking. A subscriber that fills its buffer is **evicted** (not waited on) to prevent blocking the Kafka poll loop — one frozen browser tab will never take telemetry down for everyone.

---

## 💳 Billing & Plans

| Plan | Rate Limit | Max Runs |
|---|---|---|
| **Free** | 3 runs/hour (at most 1 Max run/hour) | — |
| **Pro** | 100 runs/hour | — |

Limits are atomically enforced in Redis by user ID. Stripe-hosted surfaces ensure card data never enters this application.

<details>
<summary><strong>Stripe Setup</strong></summary>

1. Create a Stripe Product and recurring Price.
2. Set `STRIPE_SECRET_KEY` and `STRIPE_PRO_PRICE_ID`.
3. Configure a webhook at `https://your-domain/api/billing/webhook` for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Set its signing secret as `STRIPE_WEBHOOK_SECRET`.
5. Enable the Stripe Customer Portal and set `APP_URL`.

For local webhook testing:
```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```
</details>

---

## 🧪 Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Start development server |
| `pnpm typecheck` | TypeScript verification |
| `pnpm lint` | ESLint checks |
| `pnpm test` | Unit/integration test suite |
| `pnpm db:migrate` | Better Auth + billing + MCP schemas |
| `pnpm infra:up` | Start local dependencies |
| `pnpm infra:full` | Start dependencies + containerized Worker |
| `pnpm infra:topic` | Inspect the six-partition Kafka topic |
| `pnpm infra:logs` | Follow infrastructure logs |
| `pnpm infra:down` | Stop containers, preserve volumes |
| `pnpm infra:reset` | Remove containers and local data volumes |
| `go test -race ./...` | Telemetry service tests (run in `services/telemetry`) |

CI runs both halves on every push and PR: a `web` job (lint, typecheck, test against a real Redis service container) and a `telemetry` job (go vet, go build, go test -race).

---

## 🌍 Deployment

Vercel hosts the Next.js web adapter, but cannot host the Temporal Worker or Go consumer. A full deployment needs:

| Component | Where |
|---|---|
| Next.js | Vercel |
| Temporal Worker | Container service |
| Go Telemetry | Container service |
| PostgreSQL | Managed service |
| Redis | Managed service |
| Kafka | Managed service |
| Temporal | Temporal Cloud or self-hosted |

See [docs/architecture.md](docs/architecture.md) and [docs/deployment.md](docs/deployment.md) for full deployment guides.

---

## 🤝 Contributing

Bug reports and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the local setup and CI checks. Vulnerabilities go through [SECURITY.md](SECURITY.md), privately, rather than a public issue.

---

## 📄 License

MIT. See [LICENSE](LICENSE).

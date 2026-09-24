# Loom Learning Progress

## Session 3 startup
- Read `sessions.md`, `progress.md`, `README.md`, and `package.json`.
- Scanned project file list with `rg --files`.
- Read streaming/UI path files:
  - `src/lib/swarm/types.ts`
  - `src/lib/swarm/bus.ts`
  - `src/app/api/swarm/route.ts`
  - `src/lib/store.ts`
  - `src/lib/useRunSwarm.ts`
  - `src/components/SwarmGraph.tsx`
  - `src/components/SidePanel.tsx`
  - `src/app/page.tsx`
- Selected Session 3 topic: SSE event pipeline from backend swarm events to live graph UI.

## Interview revision request
- User asked to explain project mapping files, important code blocks, senior-interview concepts, medium/hard questions with answers, Next.js/TypeScript fundamentals, and production/token tradeoffs.
- Read:
  - `src/lib/swarm/planner.ts`
  - `src/lib/swarm/orchestrator.ts`
  - `src/lib/swarm/worker.ts`
  - `src/lib/swarm/validator.ts`

## Teaching continuation
- Continued from build-from-zero roadmap.
- Focus: first commands, first folders/files, Next.js/TypeScript basics, and explaining why the swarm backend should be built before UI.

## Stored API/SSE/live-streaming notes
- Created `imp notes.md`.
- Stored the user-requested live streaming explanation and full flowchart:
  - `GoalBar` click
  - `useRunSwarm()`
  - `fetch("/api/swarm")`
  - `src/app/api/swarm/route.ts`
  - `runSwarm(goal, bus)`
  - `EventBus`
  - `ReadableStream`
  - SSE `data: ...\n\n`
  - `TextEncoder` / `TextDecoder`
  - browser buffer handling
  - `Zustand apply(event)`
  - React rerender path

## Stored Kafka and Redis production skills
- Updated `imp notes.md` with a dedicated production skills section for Kafka, Redis sessions, and rate limiting.
- Read and referenced:
  - `src/lib/swarm/kafka.ts`
  - `src/lib/swarm/rateLimit.ts`
  - `src/lib/swarm/session.ts`
  - `src/lib/swarm/bus.ts`
  - `src/lib/swarm/redis.ts`
  - `src/app/api/swarm/route.ts`
  - `src/app/api/swarm/[runId]/route.ts`
- Added Session 7 to `sessions.md`.
- Skills captured:
  - Kafka topic/key/event publishing
  - Redis shared rate limiting
  - Redis run session projection
  - Redis Stream event replay
  - event envelope versioning
  - strict vs non-strict delivery tradeoffs

## Session 4 Zod explanation
- User asked to explain Zod using the tutor skill.
- Read `tech-learning-tutor` skill instructions.
- Scanned repo for Zod usage with `rg`.
- Read:
  - `src/lib/swarm/planner.ts`
  - `src/lib/swarm/validator.ts`
  - `src/lib/swarm/run.ts`
  - `src/lib/swarm/types.ts`
  - `src/lib/swarm/orchestrator.ts`
- Finding: Zod is used as the runtime contract for structured LLM outputs in planner and validator flows.

## Production upgrade: Kafka and Redis
- User requested production-level upgrades and a PR.
- Read:
  - `package.json`
  - `src/lib/swarm/bus.ts`
  - `src/app/api/swarm/route.ts`
  - `src/lib/swarm/run.ts`
  - `src/lib/swarm/models.ts`
  - `README.md`
- Added dependencies: `kafkajs`, `ioredis`.
- Added optional Kafka publisher for swarm events.
- Added optional Redis fixed-window rate limiter for run starts and model attempts.
- Added `.env.example` documenting OpenRouter, Kafka, and Redis settings.

## Mandatory Kafka/Redis production hardening
- User clarified that Kafka and Redis must be deeply integrated and required, then requested a GitHub push after completion.
- Consulted current primary documentation for KafkaJS producer keys/idempotence, Apache Kafka 4.3.1 Docker/KRaft configuration, and ioredis connection behavior.
- Added/changed:
  - `src/lib/swarm/config.ts`: required environment validation, TLS/SASL options, and timeout settings.
  - `src/lib/swarm/infrastructure.ts`: cached concurrent Kafka/Redis readiness probes.
  - `src/app/api/health/route.ts`: HTTP 200/503 readiness endpoint.
  - `src/app/api/swarm/route.ts`: fail-closed readiness gate before model usage.
  - `src/lib/swarm/redis.ts`: required shared client, command/connect timeouts, reconnect behavior, PING, and disconnect helper.
  - `src/lib/swarm/kafka.ts`: required idempotent producer, explicit topic, `runId` key, headers/timestamp, admin topic check, and disconnect helper.
  - `src/lib/swarm/session.ts`: atomic Lua projection + Redis Stream write with deterministic sequence IDs.
  - `src/lib/swarm/bus.ts`: Redis-first delivery, required Kafka publish, terminal iterator errors on durable-delivery failure.
  - `src/app/api/swarm/[runId]/route.ts`: run ID validation and Redis 503 handling.
  - `docker-compose.yml`: pinned Kafka 4.3.1, Redis 8.8.0, health checks, volumes, topic provisioning, six partitions, seven-day retention.
  - `Dockerfile`, `.dockerignore`, standalone Next output, and pinned pnpm version.
  - `patches/kafkajs@2.2.4.patch`: prevents Node 24 negative-timer warnings when KafkaJS has no pending requests.
  - Removed build-time Google Fonts dependency for offline/restricted CI builds.
- Local configuration created in ignored `.env.local`; no secret was added.

### Commands and outcomes
- `pnpm lint`: passed.
- `pnpm exec tsc --noEmit`: passed.
- `docker-compose config`: passed.
- First `pnpm infra:up`: failed because Colima/Docker daemon was stopped.
- `colima start`: succeeded.
- Second `pnpm infra:up`: images downloaded; Kafka failed due named-volume ownership (`AccessDeniedException`).
- Added one-shot root volume initializer; broker itself remains UID 1000/non-root.
- Third `pnpm infra:up`: Kafka and Redis healthy; Kafka topic initializer completed.
- `pnpm infra:topic`: verified six partitions, leader/ISR metadata, replication factor 1 locally, and seven-day retention.
- Redis `PING`: returned `PONG`.
- First `pnpm dev`: sandbox denied port 3000; elevated host run succeeded.
- `/api/health`: returned HTTP 200 with Kafka and Redis healthy.
- Node 24 emitted a KafkaJS negative timeout warning; traced to empty request queue scheduling and added a pinned pnpm patch. Repeated health checks then exited cleanly without the warning.
- First patch install aborted due no TTY; offline retry failed because one tarball was uncached; normal lockfile install restored dependencies and applied the corrected patch.
- First production build failed because `next/font/google` could not reach Google Fonts; replaced with offline system font stacks.
- Second production build hit sandbox-only Turbopack port binding; host-permitted `pnpm build` passed.
- `docker build -t loom:local .`: first attempt exposed missing patch copy and unpinned pnpm; corrected Dockerfile/package metadata; final build passed.
- Production image smoke test on `loom_default`: `/api/health` returned HTTP 200 for Kafka and Redis; temporary app container removed.
- Removed the temporary project-local `.pnpm-store` cache.

### Revisit items
- Local Compose is intentionally single-node and not high availability. Production needs replicated managed Kafka/Redis, TLS/SASL, backups, alerts, and topic replication factor 3.
- Redis and Kafka cannot share a transaction. Current ordering preserves Redis as the recoverable source and fails visibly on Kafka error; strict no-gap asynchronous publication needs an outbox worker.

## Fresh learning roadmap and deployed-provider correction
- User supplied a screenshot of the deployed Vercel UI and clarified that they believe a Grok key is configured there.
- Verified source configuration in:
  - `src/lib/swarm/models.ts`
  - `src/lib/swarm/run.ts`
  - `src/app/api/swarm/route.ts`
  - `.env.example`
- Finding: current source reads `OPENROUTER_API_KEY` only. No `GROK_API_KEY`, `XAI_API_KEY`, `GROQ_API_KEY`, xAI provider, or Grok default model is present.
- Screenshot inference: an AI provider key exists in the deployed environment because planner/worker execution started. The screenshot alone does not identify which model generated each output.
- Screenshot failure pattern recorded: analyst completed; three workers failed; synthesizer continued with fallback subtask text. This maps to the worker catch path in `orchestrator.ts` and all-model fallback behavior in `run.ts`.
- Added a fresh Sessions 9–18 roadmap to `sessions.md` covering provider failures, TypeScript, Next.js, Kafka, Redis, testing, durable orchestration, observability/security/cost, DevOps/deployment, and senior interview preparation.
- Started Session 9 with provider-vs-model distinction and screenshot-led failure diagnosis.
- No key values or secrets were read or stored.

## Vercel production readiness incident
- Reproduced the deployed failure at `GET /api/health`: HTTP 503, with Kafka and Redis both down at zero-millisecond probe latency.
- Linked the local checkout to the existing Vercel `loom` project and inspected environment-variable names only; no secret values were read.
- Confirmed production currently contains `OPENROUTER_API_KEY` but no required Kafka or Redis configuration.
- Confirmed the latest GitHub commit built and deployed successfully. The failure is runtime dependency configuration, not compilation or deployment.
- Vercel Marketplace currently exposes Redis products but no Kafka product. Finishing the live fix requires a managed Kafka provider plus a managed Redis resource and their production connection settings.
- Preserved the fail-closed production design: no optional or in-memory Kafka/Redis fallback was introduced.
- Learning captured: build success vs runtime readiness, local Compose DNS vs public production endpoints, managed services, and why infrastructure credentials belong in the deployment environment rather than Git.

## Session 9 close / Session 10 start
- Searched current web status: Upstash Kafka discontinued March 11, 2025 (corrected prior assumption it was still viable). Redis Cloud confirmed live on Vercel Marketplace.
- User chose Redpanda Cloud (Kafka) + Redis Cloud via Vercel Marketplace (Redis) for the production fix; signups not yet completed by user.
- Re-read `src/lib/swarm/run.ts` and `src/lib/swarm/models.ts`; identified that `shouldFallback(e)` in `runText()` does not actually gate the retry loop (no `else { throw }`), so non-retryable errors still walk the full model chain before `AllModelsFailed`. `runObject`/`genObject` don't call `shouldFallback` at all.
- Started Session 10 (TypeScript through Loom): read `src/lib/swarm/types.ts` and `src/lib/swarm/orchestrator.ts` line by line.

## Session 11 — SSE review + Redis + Docker deep dives
- Learner requested out-of-roadmap-order teaching: SSE/EventBus review, then Redis, then Docker/Compose; Next.js session explicitly pushed to the very end.
- Re-read `src/lib/swarm/bus.ts` and `src/app/api/swarm/route.ts` for the SSE deep dive.
- Read `src/lib/swarm/redis.ts`, `src/lib/swarm/session.ts`, `src/lib/swarm/rateLimit.ts` for the Redis deep dive (both Lua scripts explained line by line).
- Read `docker-compose.yml` and `Dockerfile` for the Docker deep dive.
- No code changes made this session — teaching only.

## Session 12 — Full backend scan + master deep dive
- Scanned every remaining backend file: `src/lib/swarm/config.ts`, `src/lib/swarm/infrastructure.ts`, `src/app/api/health/route.ts`, `src/app/api/swarm/[runId]/route.ts`, `src/lib/store.ts` (plus re-verified all previously read swarm files and `useRunSwarm.ts`).
- Wrote the "MASTER DEEP DIVE — Full Backend Scan" section into `imp notes.md`: 10-layer walkthrough (config → readiness → connections → Lua scripts → AI executors → agents → EventBus → API gates/stream → replay → browser reducer), master flowchart, failure-mode table, and master interview answers.
- Wrote "THE CANDIDATE HANDBOOK" section into `imp notes.md`: stack-at-a-glance table, full annotated end-to-end flowchart + 12-step narrative, routes reference, Redis data structures + all five rate-limiting algorithms compared, Kafka vocabulary + Loom's exact producer/topic choices, per-tech senior interview Q&A (Next.js, TypeScript, AI SDK/Zod, SSE, EventBus, Redis, Kafka, system design), and a rapid-fire glossary.
- No code changes — documentation and teaching only.

## Session 14 — Testing: DAG wave scheduling + Redis integration tests
- User requested: skip Kafka for now, focus rate-limiter question follow-up (what is Lua), then testing — specifically Redis integration tests, plus whatever else is left in the project (DAG waves, etc).
- Checked local infra: `loom-redis-1` container already running/healthy.
- Installed `vitest` as a dev dependency (`pnpm add -D vitest`), added `"test": "vitest run"` to `package.json` scripts.
- Extracted the orchestrator's inline `ready()` closure into `src/lib/swarm/dagSchedule.ts` (`nextWave`, `planWaves`) — pure, dependency-free functions — and updated `src/lib/swarm/orchestrator.ts` to import `nextWave` instead of the local closure. Behavior unchanged; confirmed via `pnpm exec tsc --noEmit` (clean).
- Added `src/lib/swarm/dagSchedule.test.ts`: 7 unit tests covering parallel waves, sequential chains, fan-in, direct cycle detection, and missing-dependency detection.
- Added `src/lib/swarm/redis.integration.test.ts`: 8 integration tests against the REAL local Redis container — rate limiter boundary/TTL-guard behavior (directly verifying the count===1 checkpoint answered earlier), and `persistRunEvent` idempotency/ordering (replay no-op, stale-sequence rejection).
- `pnpm test`: 2 files, 15/15 passed. `pnpm lint`: clean.
- No Kafka work this session per explicit user request.

## Placement handbook and professional PDF
- Loaded the technical tutoring instructions and adapted the artifact to the learner's fast, architecture-first Basic-to-Interview route.
- Audited source behavior across the frontend, all API routes, EventBus, orchestration, AI/Zod, Redis Lua/session store, Kafka producer/readiness, Dockerfile, Compose, and package versions.
- Researched current primary documentation for every technology and recurring interview themes from LeetCode Discuss, Naukri Code360, and GeeksforGeeks. Firecrawl authentication existed but its credit balance was zero; direct web research was used instead.
- Created `Loom_Placement_Handbook.md` with 18 modules and 16,500+ words:
  - four frontend modules;
  - six backend modules;
  - three infrastructure/production modules;
  - three interview/revision modules plus opening/system-map modules.
- Added six custom SVG flowcharts:
  - end-to-end browser/API/orchestrator/durability flow;
  - EventBus live versus durable branches;
  - DAG waves and validation;
  - Redis rate limiter and atomic session persistence;
  - Kafka producer/partitions/future consumer groups;
  - local Compose versus production deployment.
- Added a canonical correction ledger to `imp notes.md` to supersede earlier overstatements about durable-before-visible delivery, automatic replay, cancellation, Kafka consumers, exactly-once semantics, and local HA.
- Created dense black-and-white print CSS with color reserved for diagrams.
- Rendered `Loom_Placement_Handbook.html` with Pandoc and `Loom_Placement_Handbook.pdf` with headless Chrome.
- Final PDF verification: A4, 35 pages, 1.8 MB, tagged, unencrypted; TOC fits one page; sampled diagrams/tables/code/glossary/source pages render without clipping.

## Session 16 — Production-readiness fixes (real code changes)
- User asked for the correct fault list plus actual fixes to make orchestration reliable, and to distinguish "fixed now" from "legitimate future upgrade, not required."
- Verified two suspected faults against source before fixing: `models.ts:38-44` (`hasPaidAccess` caches ANY probe outcome, including network failures, forever per process) and `run.ts:53-55` (`shouldFallback` check had no `else { throw }`, so it never actually gated the retry loop).
- Implemented fixes:
  - `src/lib/swarm/models.ts`: `hasPaidAccess()` no longer caches a failed probe — only a successful result (true/false) is cached; a fetch failure resets `paidProbe` to null so the next call retries instead of permanently pinning the process to the free-tier chain.
  - `src/lib/swarm/run.ts`: rewrote `runText`/`runObject`/`genObject`. Added `checkModelRateLimit()` helper that distinguishes a genuine `RateLimitError` (skip to next model) from any other error out of `enforceRateLimit` — e.g. Redis unreachable — which now rethrows immediately instead of being silently treated as "this model failed." `shouldFallback(e)` now actually gates: a non-retryable error throws `AllModelsFailed` immediately instead of wasting the rest of the chain. Added `"empty completion"` as an explicitly retryable condition (previously implicit via the dead gate) since a model succeeding with empty output is legitimately worth retrying on a different model. Added `attemptSignal()` combining the existing per-attempt `AbortSignal.timeout` with an optional caller-provided `signal` via `AbortSignal.any`. Exported `AllModelsFailed` (was module-private).
  - `src/lib/swarm/planner.ts` / `src/lib/swarm/validator.ts`: catch blocks now only degrade (fallback plan / auto-approve) when the caught error is `instanceof AllModelsFailed` — any other error (infra failure surfaced through `run.ts`) rethrows, so a Redis outage mid-run now produces a visible failed task/run instead of a silently degraded result.
  - `src/lib/swarm/rateLimit.ts`: removed the dead try/catch in `enforceRateLimit` that rethrew unconditionally on both branches — no behavior change, cleanup only.
  - Cancellation propagation: `src/app/api/swarm/route.ts` now passes `req.signal` into `runSwarm`; `orchestrator.ts` accepts `signal?: AbortSignal`, checks `signal?.aborted` at the top of each DAG wave and before synthesis (emits an error + `bus.close("failed")` and returns if aborted), and threads `signal` through `runWorker` (`worker.ts`), `validate` (`validator.ts`), `plan` (`planner.ts`), and the synthesis `runText` call. A client disconnecting mid-run now stops further model calls at the next checkpoint instead of continuing invisibly.
- Verified: `pnpm exec tsc --noEmit` clean, `pnpm test` 15/15 passed (no test changes needed — behavior covered was orthogonal to the DAG/Redis integration tests), `pnpm lint` clean.
- Did NOT implement (documented as legitimate future upgrades, not required for current scope): transactional outbox for Redis→Kafka, durable/resumable workflow state (BullMQ/Temporal/Inngest), EventBus backpressure bounding, dead-letter queue for repeatedly-failing tasks, real auth/multi-tenancy, observability (structured logs/metrics/traces), provider-reported token usage instead of length/4 estimate.

## Session 17 — Reliable orchestration interview gauntlet (chat-only, no code)
- User asked for a chat-only (no file edits) list of what a senior interviewer would challenge about Loom's orchestration reliability specifically, with a counter-argument and named upgrade per point.
- Produced a 10-item attack/counter/upgrade list covering: in-request orchestration crash resumption, durable-history-vs-durable-workflow distinction, cancellation propagation (verified as already fixed in Session 16, commits 885eee0/872cd1e), Redis/Kafka outbox gap, lateral-vs-vertical retry policy, dead-letter handling for repeatedly-failing tasks, EventBus backpressure, multi-instance SSE scaling, per-IP-only rate limiting/auth, and missing observability.
- Framed the meta-strategy: name your own system's gaps unprompted with a prioritized roadmap, and cite the already-fixed items as proof of a working audit-and-fix loop.
- No code changes this session — content was requested and delivered purely in chat, then logged to sessions.md/progress.md per user's explicit follow-up request.

## Session 18 — API key / OpenRouter / AI SDK lesson stored
- User asked for the next lesson and explicitly requested the full Loom request path plus API-key/model-client/AI-SDK explanation to be stored in `imp notes.md` and reflected in `sessions.md`/`progress.md`.
- Re-read tutor skill instructions for this teaching/tracking turn.
- Re-checked current source behavior in:
  - `src/lib/swarm/models.ts`
  - `src/lib/swarm/run.ts`
  - `src/app/api/swarm/route.ts`
- Stored in `imp notes.md`:
  - numbered full Loom request path from browser `POST /api/swarm` to React Flow graph update;
  - distinction that planner/worker/validator/synthesizer are backend code roles, not separate servers;
  - mental model: TypeScript = traffic controller, AI model = reasoning brain, Zod = strict checker, Redis/Kafka = production infrastructure, SSE = live UI pipe;
  - `createOpenRouter({ apiKey })` provider-client explanation;
  - `model(id)` model-reference explanation;
  - API key vs model ID vs system prompt vs user prompt vs AI SDK;
  - conceptual raw OpenRouter HTTP request hidden by the SDK;
  - why planner/validator use structured object generation while workers/synthesizer use streaming text;
  - interview-ready answer and current checkpoint.
- Updated `sessions.md` with Session 18 learning state, concepts taught, small terms, doubts/answers, learner gap, and next-session focus.
- No source code or dependency changes were made; documentation/learning notes only.

## Session 19 — Checkpoint + Next.js App Router boundary
- User chose to do both pending lessons: API-key/model/prompt/SDK checkpoint and Next.js App Router/client-server boundary.
- Re-read tutor skill instructions for the teaching turn.
- Re-checked current files used in the lesson:
  - `src/lib/useRunSwarm.ts`
  - `src/app/page.tsx`
  - `src/app/api/swarm/route.ts`
  - `src/app/api/health/route.ts`
- Lesson focus:
  - API key = permission, model ID = selected AI brain, system prompt = role rules, user prompt = task, AI SDK = helper that sends/parses model requests.
  - `src/app/page.tsx` renders the page shell and components.
  - `src/lib/useRunSwarm.ts` is client-side because of `"use client"` and uses browser `fetch`.
  - `src/app/api/swarm/route.ts` is server-side and safely reads `process.env.OPENROUTER_API_KEY`, checks Kafka/Redis, rate-limits, starts `runSwarm`, and returns SSE.
  - `src/app/api/health/route.ts` is a server route for runtime readiness checks.
- No source code/dependency changes; learning logs only.

## Session 20 — SSE and JSON/Zod networking lesson
- User requested an SSE deep dive with code and interview aspects, then clarification of what JSON parsing does compared with Zod validation for strict LLM schema replies and JSON over HTTP requests.
- Re-read tutor skill instructions for the teaching turn.
- Re-checked current files:
  - `src/app/api/swarm/route.ts`
  - `src/lib/useRunSwarm.ts`
  - `src/lib/swarm/bus.ts`
  - `src/lib/swarm/planner.ts`
- Lesson focus:
  - Server converts events to SSE text frames using `JSON.stringify(event)` and `TextEncoder`.
  - Client reads byte chunks using `response.body.getReader()`, converts bytes to text with `TextDecoder`, buffers partial frames, splits on `\n\n`, strips the `data:` prefix, and uses `JSON.parse` to recover the event object.
  - `req.json()` parses incoming HTTP JSON body from the browser; it does not validate business shape by itself.
  - Zod validates structured LLM replies against runtime schemas, e.g. planner `planSchema`.
  - Parsing answers "is this syntactically JSON?"; validation answers "does this object have the shape/rules my app needs?"
- No source code/dependency changes; learning logs only.

## Session 21 — Remaining learning roadmap documented
- User asked to stop and clarify what is left in the project to learn, then update `sessions.md`, `progress.md`, and `imp notes.md`.
- Added a new `imp notes.md` section: "What is left to learn in Loom".
- Covered remaining areas:
  - HTTP/networking fundamentals through all three route handlers;
  - Next.js App Router and client/server boundary;
  - TypeScript line-by-line confidence;
  - Kafka consumer/offset/lag gap;
  - Redis advanced revision;
  - reliable orchestration architecture and durable workflow gaps;
  - observability, cost, and security;
  - production deployment;
  - frontend/UI internals;
  - senior interview delivery and mock practice.
- Updated `sessions.md` with Session 21 learning state and next focus.
- No source code/dependency changes; documentation/learning notes only.

## 18 July 2026 — Auth, Pro billing, Temporal, Compose, and Go telemetry
- Added Better Auth email/password authentication backed by PostgreSQL. Protected the main page and all swarm routes; persisted `ownerId` and enforced replay ownership.
- Added Stripe Pro billing with authenticated Checkout/Portal routes, raw-body webhook signature verification, subscription projection migration, and active/trialing entitlement checks.
- Replaced one global run allowance with per-user plan limits: Free 10/hour and Pro 100/hour, atomically enforced in Redis.
- Added a Temporal client, deterministic Workflow, Worker, and swarm Activity. Temporal mode persists events to Redis so SSE can bridge Worker output to the browser.
- Added PostgreSQL, Temporal, and Go telemetry to Docker Compose. Added idempotent auth/billing migrations and documented the always-on Worker deployment requirement.
- Added an independent Go Kafka consumer with manual commits, graceful shutdown, `/healthz`, Prometheus `/metrics`, unit tests, and a non-root multi-stage container.
- Refactored the run launch into an application boundary so HTTP routes do not own Temporal/direct execution details.
- Added UI account controls, live infrastructure mode, Free/Pro badge, Upgrade action, and Manage billing action.
- Rewrote the README and added architecture/deployment docs with honest limits and production checklist.
- Remaining learning is now narrower: Stripe lifecycle/security, Temporal determinism and phase-level Activities, production observability/cost, deployment operations, and interview rehearsal.

## Session 23 — Auth + Stripe webhook lesson (30 July 2026)
- Re-read tutor skill instructions and re-audited the repository before teaching.
- Commands run: `git log --oneline`, `git status --short`, `git log --stat`, `find src services -type f`.
- Working tree clean at `1aba9ed`. No source, dependency, or config changes in this session.
- Files re-read for accuracy: `src/lib/auth.ts`, `src/app/api/auth/[...all]/route.ts`, `src/lib/auth-client.ts`, `src/lib/database.ts`, `src/lib/http/request.ts`, `src/app/api/swarm/route.ts`, `src/app/api/billing/webhook/route.ts`, `src/lib/billing/service.ts`, `src/lib/billing/repository.ts`.
- **Documentation gap found:** commits `ee1e090`, `a371e5d`, `dda711d`, `91116d1`, `65bd5d1`, `a4dc9da`, `44c0e75`, `957f26c`, `1aba9ed` (19–20 July) are shipped but absent from both learning logs. Offered a backfill entry; not yet written.
- Learning logs only; three recall checkpoints left open for the learner (signature-before-parse, monotonic event guard, 500-vs-200 webhook response).

## Session 24 — Revision + Temporal/Kafka-consumer/Go lesson (30 July 2026)
- Files re-read for accuracy before teaching: `src/temporal/{workflows,activities,worker,constants}.ts`, `src/lib/temporal/client.ts`, `src/lib/swarm/{launch,executionMode,kafka,sse,tokenBudget}.ts`, `src/app/api/swarm/route.ts` (full gate order), `src/lib/research/firecrawl.ts`, `src/lib/mcp/server.ts`, `services/telemetry/main.go`, and `sessions.md` sessions 9–14.
- Verified by inspection: `Loom_Placement_Handbook.{md,html,pdf}` no longer exist in the repo (deleted at `957f26c`); `docs/placement-handbook/` retains only `handbook.css` and six SVG assets.
- Verified the current `/api/swarm` gate order and the per-user quota path (`getUserPlan` → `runAllowance` → `enforceRunRateLimit` with separate `runs` and `runs:max` keys).
- No source, dependency, or config changes. Learning logs only. Four checkpoints left open.

## Session 25 — PostgreSQL lesson (30 July 2026)
- Files read for accuracy: `scripts/migrate-auth.ts`, `scripts/migrate-billing.ts`, `scripts/migrate-mcp.ts`, `scripts/vercel-build.ts`, `src/lib/mcp/repository.ts`, `src/lib/database.ts`, `docker-compose.yml` (postgres service), `package.json` scripts.
- Confirmed: no `.sql` files — schema lives inline in three `tsx` migration scripts run via `pnpm db:migrate`; Better Auth generates its own tables through `getMigrations(auth.options)`.
- Confirmed: all three scripts serialise on the same advisory lock key `loom:release-migrations`; `vercel-build.ts` runs `pnpm db:migrate` only when `VERCEL_ENV === "production"` and after validating 15 required env vars plus HTTPS/redis-scheme/Kafka-SSL checks.
- No source, dependency, or config changes. Learning logs only.

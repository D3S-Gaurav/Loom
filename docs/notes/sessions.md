# Loom Learning Sessions

## Session 1
- **Route:** Basic to Interview
- **Prerequisite Check:** Corrected to Loom - Agent Swarm Orchestrator. Grasp speed: FAST.
- **Concepts Taught:** Mental model of Planner/Workers/Validator/Synthesizer, DAG, SSE. EventBus (AsyncIterator). Planner (Zod), Orchestrator (DAG execution).
- **Learner Gaps:** (None yet)

## Session 2
- **Route:** Basic to Interview
- **Prerequisite Check:** Handled in Session 1.
- **Concepts Taught:** Worker/Validator loop, Shared Blackboard (upstream results), Zod schema (quality gate), Failure fallback (rate limits).
- **Learner Gaps:** (Pending)

## Session 3
- **Route:** Basic to Interview
- **Prerequisite Check:** Continuing from Session 2. Current target: live streaming/UI data path.
- **Concepts Taught:** In progress — SSE route, EventBus AsyncIterator, client stream reader, Zustand reducer, React Flow rendering.
- **Learner Gaps:** Pending checkpoint response.
- **Next Session Focus:** TBD after Session 3 checkpoint.

## Session 4
- **Route:** Basic to Interview
- **Prerequisite Check:** Continuing prior route; user asked specifically for Zod in this project.
- **Concepts Taught:** Zod as runtime schema for AI structured outputs; planner schema; validator schema; `genObject` type contract; difference between TypeScript interfaces and runtime validation.
- **Learner Gaps:** Pending checkpoint response.
- **Next Session Focus:** Trace one real planner output through `plan()` into `runSwarm()`.

## Session 5
- **Route:** Basic to Interview
- **Prerequisite Check:** User requested production upgrade: Kafka for distributed event streaming and Redis for rate limit management.
- **Concepts Taught:** In progress — in-memory event bus vs distributed event stream; Kafka event publishing; Redis shared counters for rate limits; optional infrastructure via env vars.
- **Learner Gaps:** Pending review after PR.
- **Next Session Focus:** Explain Kafka topic/message key design and Redis fixed-window tradeoffs.

## Session 6
- **Route:** Basic to Interview
- **Prerequisite Check:** User asked to store the current API/SSE/live-streaming explanation and flowchart.
- **Concepts Taught:** API call from `useRunSwarm.ts` to `/api/swarm`; Next.js route mapping; request JSON validation; backend-only API key check; normal API vs streaming API; SSE `data: ...\n\n` format; `ReadableStream`; `TextEncoder`; browser `TextDecoder`; buffer handling; Zustand `apply(event)` update path.
- **Examples Used:** User prompt `"Generate research on AI agents in healthcare"` and click `Swarm`.
- **Small Terms Explained:** `fetch`, `POST`, `headers`, `content-type`, `JSON.stringify`, `signal`, `ReadableStream`, `controller.enqueue`, `SSE`, `TextEncoder`, `TextDecoder`, `buffer`.
- **Learner Gaps:** User is clarifying streaming and SSE mechanics; next focus should be client-side stream reading.
- **Next Session Focus:** `useRunSwarm.ts` deep dive: `AbortController`, `response.body.getReader()`, decoding chunks, buffering partial SSE frames, `JSON.parse`, `apply(event)`, and common stream bugs.

## Session 7
- **Route:** Basic to Interview
- **Prerequisite Check:** User asked to store Kafka/rate-limiting updates in the learning sessions and add the related skills.
- **Concepts Taught:** Production upgrade path from in-memory EventBus to durable/shared infrastructure; Kafka producer; Kafka topic/key/message headers; Redis shared connection; Redis fixed-window rate limiter; HTTP 429 + `retry-after`; Redis run session projection; Redis Stream event replay; `runId`; event envelope versioning and sequence numbers; strict vs non-strict event delivery.
- **Examples Used:** Current Loom production files: `src/lib/swarm/kafka.ts`, `src/lib/swarm/rateLimit.ts`, `src/lib/swarm/session.ts`, `src/lib/swarm/bus.ts`, `src/app/api/swarm/route.ts`, `src/app/api/swarm/[runId]/route.ts`.
- **Small Terms Explained:** Kafka, topic, producer, message key, `acks: -1`, idempotent producer, Redis, `INCR`, `EXPIRE`, `TTL`, fixed-window limit, Redis Stream, `runId`, sequence, replay, HTTP 429.
- **Learner Gaps:** Needs line-by-line reinforcement of Kafka topic/key partitioning and Redis rate-limit script.
- **Next Session Focus:** Kafka topic/message-key/partition ordering, then Redis fixed-window rate limiter line-by-line.

## Session 8
- **Route:** Basic to Interview
- **Prerequisite Check:** Learner already understood SSE as the browser-facing stream and asked to make Kafka/Redis deeply integrated rather than optional.
- **Concepts Taught:** Required infrastructure contract; fail-closed readiness gate; Kafka topic provisioning; `runId` partition key; all-replica acknowledgement; Redis `PING`; AOF persistence; atomic Lua persistence; deterministic Redis Stream IDs; idempotency; health/readiness endpoint; non-root Docker services; local single-node vs managed replicated production infrastructure; Redis-first durable delivery; transactional-outbox limitation.
- **Examples Used:** `POST /api/swarm → readiness → Redis rate limit → EventBus branches into immediate SSE plus ordered Redis→Kafka durability`; local `loom.swarm.events` topic with six partitions and seven-day retention; production container connected to `kafka:19092` and `redis:6379`.
- **Small Terms Explained:** readiness, fail closed, topic provisioning, partition, message key, ISR, AOF, append-only log, deterministic ID, idempotency, Lua atomicity, health check, named volume, non-root container, transactional outbox.
- **Implementation Work:** Added required validated config, Kafka/Redis readiness checks, `/api/health`, atomic Redis event persistence, visible durable-delivery errors, Docker Compose Kafka/Redis stack, topic initializer, production Dockerfile, KafkaJS Node 24 patch, and deployment documentation.
- **Doubts and Answers:** Kafka/Redis are no longer optional. Redis is the recoverable source record; Kafka is the required distributed event stream; SSE remains the live browser transport.
- **Learner Gaps:** Still needs line-by-line reinforcement of Kafka partition ordering and the Redis Lua persistence/rate-limit scripts.
- **Grasp-Speed Signal:** Fast, architecture-oriented requests; learner prefers implementation first with interview explanation attached.
- **Adaptation Used:** Implemented the full path, then mapped every operational failure to a production concept instead of teaching Kafka only in isolation.
- **Recurring Difficult Topics:** EventBus vs Kafka vs SSE responsibilities; Redis atomic commands and TTL behavior.
- **Next Session Focus:** Trace one `run.start` envelope through Redis and Kafka, then explain the two Lua scripts line by line and answer medium/hard production interview questions.

## Current learning position after Session 8
- **Completed foundation:** Swarm roles, DAG scheduling, shared blackboard, Zod validation, EventBus, SSE, browser stream decoding, Zustand updates, Kafka/Redis purpose, and production infrastructure setup.
- **Can explain with support:** Full request path from button click to live UI; why `runId` is the Kafka key; why Redis stores run history; why Kafka, SSE, and EventBus have different responsibilities.
- **Needs deeper mastery:** TypeScript syntax without copying; Next.js server/client boundaries; model-provider fallback behavior; Kafka consumers/offsets/lag; Redis Lua scripts; tests; observability; security; cancellation; job queues; transactional outbox; deployment architecture; concise interview delivery.
- **Route Decision:** Continue **Basic to Interview**, but enter Phase 2: project internals, failure diagnosis, production tradeoffs, and senior interview questions.

## Fresh roadmap: Sessions 9–18

### Session 9 — AI provider flow and screenshot failure diagnosis
- Trace `OPENROUTER_API_KEY → createOpenRouter() → chainFor() → runText()/runObject()`.
- Distinguish a provider key from a selected model. A key can authorize access without proving Grok is the model used.
- Diagnose 401, 402, 408, 429, 5xx, empty output, timeout, and all-models-failed behavior.
- Explain why the orchestrator continues with `"(this subtask failed)"` and why that produces a degraded final answer.

### Session 10 — TypeScript through Loom
- `type`, `interface`, unions, `Exclude`, generics, maps, type guards, `unknown`, assertions, and async return types.
- Read `types.ts`, `run.ts`, and `orchestrator.ts` line by line.
- Interview focus: compile-time types vs runtime Zod validation.

### Session 11 — Next.js App Router and client/server boundaries
- Route handlers, `Request`, `Response`, environment variables, server-only secrets, client components, hooks, and API mapping.
- Trace `GoalBar → useRunSwarm → POST /api/swarm → SSE response`.
- Explain why Kafka/Redis clients belong on the server.

### Session 12 — Kafka deeply
- Topic, partition, key hashing, per-partition ordering, producer acknowledgement, ISR, replication, consumer groups, offsets, replay, and lag.
- Follow one Loom envelope through partition selection and a future analytics consumer.
- Medium/hard interview drills on ordering and delivery guarantees.

### Session 13 — Redis deeply
- Strings, hashes, streams, TTL, `INCR`, `EXPIRE`, `XADD`, `XRANGE`, transactions, and Lua atomicity.
- Explain both Loom Lua scripts line by line: fixed-window rate limiting and idempotent event persistence.
- Tradeoffs: fixed window vs sliding window/token bucket; Redis Stream vs Kafka.

### Session 14 — Testing and failure injection
- Unit-test DAG waves, cycles, missing dependencies, worker failures, event order, rate limits, and replay.
- Integration-test Kafka/Redis and the SSE parser.
- Simulate broker loss, Redis loss, timeout, duplicate events, and reconnect.

### Session 15 — Reliable orchestration architecture
- Background job queue, durable workflow state, cancellation propagation, backpressure, retries with jitter, dead-letter handling, and idempotency.
- Design the transactional outbox worker that closes the Redis→Kafka consistency gap.
- Compare BullMQ, Temporal, Inngest, and a custom worker conceptually.

### Session 16 — Observability, cost, and security
- Structured logs, metrics, traces, Kafka lag, Redis memory, latency percentiles, token/cost accounting, and alerting.
- Auth, per-user limits, prompt-injection boundaries, secret rotation, input limits, and abuse protection.

### Session 17 — DevOps and deployment
- Docker stages, Compose networking, health/readiness probes, CI/CD, managed Kafka/Redis, TLS/SASL, backups, rollback, and scaling.
- Understand why `localhost` infrastructure works locally but not from Vercel.
- Decide between Vercel for UI/API and a container/background-worker platform for long swarm jobs.

### Session 18 — Senior interview and project presentation
- Two-minute architecture explanation, code walkthrough, system-design extension, failure scenarios, tradeoff answers, and mock interview.
- Prepare resume bullets and a production-readiness answer grounded in implemented code.

## Session 9 — Started
- **Route:** Basic to Interview, Phase 2
- **Prerequisite Check:** Screenshot shows the learner can operate the deployed swarm and recognize that a provider key is configured. The learner has not yet distinguished provider authentication from model selection.
- **Evidence From Screenshot:** Planner execution occurred; five agents were rendered; the analyst completed with 9/10; three worker subtasks failed; synthesis continued using fallback text. Therefore the request passed the missing-key guard, but some model attempts later failed.
- **Key Correction:** This repository reads only `OPENROUTER_API_KEY`. It currently has no `GROK_API_KEY`/`XAI_API_KEY` integration and no Grok model in its default chains. A Vercel key and local `.env.local` are separate configurations.
- **Concepts To Teach Next:** Provider vs model; role model chains; paid-access probe; fallback loop; timeout; provider status codes; degraded completion policy; how to inspect the exact worker error safely.
- **Learner Gaps:** Needs to connect UI statuses (`Done`, `Failed`, `Working`) to exact backend catch/fallback branches.
- **Adaptation:** Begin with the screenshot and trace one failed worker backward through the source before introducing more Kafka/Redis theory.
- **Checkpoint For Next Lesson:** Explain why a configured provider key does not guarantee every worker succeeds or prove that Grok handled the request.

### Session 9 production incident — Vercel readiness failure
- **Observed Symptom:** The deployed UI showed `Required Kafka/Redis infrastructure is unavailable.` before the swarm plan could run.
- **Evidence:** `GET /api/health` returned HTTP 503 with both Kafka and Redis marked down and `latencyMs: 0`. Vercel environment inspection showed only `OPENROUTER_API_KEY`; the required `KAFKA_BROKERS`, `KAFKA_SWARM_EVENTS_TOPIC`, and `REDIS_URL` variables were absent.
- **Root Cause:** Local Docker addresses such as `localhost:9092`, `kafka:19092`, and `redis:6379` exist only on the developer machine or its Compose network. A Vercel function cannot connect to them. Production needs publicly reachable, authenticated managed Kafka and Redis endpoints.
- **Important Terms:** A deployment environment is the isolated runtime where production code executes. An endpoint is the network address of a service. A managed service is infrastructure operated by a provider. Readiness answers whether dependencies are usable now; a successful build does not prove runtime readiness.
- **Architecture Decision:** Keep Kafka and Redis mandatory. Do not hide the incident with an in-memory fallback. Vercel Marketplace can supply Redis, but Kafka requires an external provider such as Confluent Cloud, Aiven, or Redpanda Cloud.
- **Next Required Action:** Provision/connect managed Redis and managed Kafka, add their production variables, redeploy, and require `/api/health` to return HTTP 200 before testing a swarm run.
- **Provider Decision (this session):** Upstash Kafka is discontinued (shut down March 11, 2025) — confirmed via web search, corrected in-session. User chose **Redpanda Cloud** for Kafka and **Redis Cloud via Vercel Marketplace** for Redis. Both require user-side signup (their own login); not yet completed as of end of Session 9.

## Session 9 — Closed
- **Concepts Taught:** Provider (OpenRouter key) vs. model selection; `chainFor(role)` ordered fallback chain; `hasPaidAccess()` one-time paid-tier probe; why workers stay on free models even on a paid key (cost control); `shouldFallback()` status-code triage (402/408/429/5xx); `AbortSignal.timeout`.
- **Small Terms Explained:** `createOpenRouter`, `model(id)`, `chainFor`, `hasPaidAccess`, `AbortSignal.timeout`, status codes 402/408/429.
- **Real Bug Found:** In `src/lib/swarm/run.ts` `runText()`, `if (!shouldFallback(e)) continue;` does not actually gate the loop — there is no `else { throw }`, so every error (including non-retryable ones) falls through to the next model. `runObject`/`genObject` don't call `shouldFallback` at all. Non-retryable failures burn through the entire chain before `AllModelsFailed` throws.
- **Checkpoint:** Asked but not yet answered by learner — left open, flagged as recurring topic feeding into Session 15 (retry/dead-letter correctness).
- **Learner Gaps:** Retry-loop correctness (shouldFallback dead branch) needs revisiting in Session 15.
- **Next Session Focus:** Session 10 — TypeScript through Loom.

## Session 10 — TypeScript through Loom
- **Route:** Basic to Interview, Phase 2
- **Concepts Taught:** String-literal unions (`AgentType`), `interface` vs `type` convention, `Exclude<A,B>` encoding a business rule at compile time, discriminated unions (`SwarmEvent` + `kind` narrowing), `Record<K,V>` exhaustiveness, custom type guards (`d is Done`), type assertions vs `unknown` in `catch`, async `Promise<T>` return types.
- **Small Terms Explained:** `type`, `interface`, `Exclude`, discriminated union, `Record`, `Map<K,V>` generics, type guard, type assertion (`as`), `Promise<T>`.
- **Checkpoint Asked:** What happens to `completed`'s value type and every reader of it if `Done.output` became `string | null` and the failure fallback used `null` instead of placeholder text? — **not yet answered**, left open.
- **Learner Gaps:** Same retry-loop issue from Session 9 remains open; TypeScript narrowing behavior on unions not yet confirmed understood.
- **Next Session Focus (per learner request, out of roadmap order):** SSE/EventBus deep-dive review, then Redis deep dive, then Docker/docker-compose deep dive. Next.js App Router session explicitly deferred to the very end.

## Session 11 — SSE/EventBus review + Redis deep dive + Docker/Compose deep dive
- **Route:** Basic to Interview, Phase 2 (learner-directed order, deviates from the Session 9-18 roadmap)
- **Part A — SSE + EventBus:** Re-explained end-to-end path (button click → route.ts → EventBus → ReadableStream → SSE frame). Taught the two-sided producer/consumer handoff (`emit()` resolves a waiting reader or buffers; `next()` drains the queue or suspends), the `this.delivery` reassigned-promise-chain acting as an async mutex for ordered Redis/Kafka writes from concurrent workers, and why `close()` blocks on that same chain before ending the stream.
- **Part B — Redis deep dive:** Fixed-window rate limiter Lua script (`INCR`+`EXPIRE` atomicity, race condition it prevents), the event-persistence Lua script (idempotency via sequence guard + deterministic Redis Stream ID `sequence-0`), hash-vs-stream dual data shape (current-state projection vs. full replay, a lightweight CQRS pattern), and `redis.ts` fail-fast connection settings (`maxRetriesPerRequest: 1`, `enableOfflineQueue: false`).
- **Part C — Docker/Compose deep dive:** 4-stage Dockerfile (base/dependencies/builder/runner) and why the final image excludes the build toolchain, non-root `USER nextjs`, `HEALTHCHECK` hitting the real `/api/health` readiness endpoint (not just process liveness), Compose `depends_on` with `service_completed_successfully` vs `service_healthy`, and `KAFKA_LISTENERS` vs `KAFKA_ADVERTISED_LISTENERS` (internal Docker DNS vs host-visible address — same class of problem as the Session 9 Vercel incident).
- **Learner Gaps:** Two prior checkpoints (Session 9 fallback-loop question, Session 10 nullable-`Done.output` question) remain unanswered — flagged as recurring/spaced-repetition items.
- **Next Session Focus:** Resume roadmap — remainder of Kafka deep dive (Session 12: partitions/consumer groups/offsets/lag), then Redis Lua-script drills already partially covered here, then Next.js App Router (explicitly deferred), then back to the outstanding Vercel Redpanda Cloud + Redis Cloud provisioning task.

## Session 12 — Full backend scan → master reference document
- **Route:** Basic to Interview, Phase 2 (learner-directed)
- **Request:** Scan the entire backend and produce one very detailed master explanation, in chat and stored in the notes file.
- **Concepts Taught:** Config fail-fast validation (`required`/`positiveInt`/`bool`/SASL pairing); readiness caching + in-flight probe dedup (thundering herd); singleton connection lifecycle for Redis/Kafka; `acks:-1` + idempotent producer + `allowAutoTopicCreation:false`; admin topic-existence probe vs TCP liveness; the five ordered API gates and why infra precedes rate limit; replay route input validation before key construction; Zustand reducer pattern (`apply` switch over the discriminated union); `force-dynamic`/`no-store` on the health route; full failure-mode table mapping every failure to what the user sees.
- **Artifacts:** "MASTER DEEP DIVE — Full Backend Scan (Session 12)" appended to `imp notes.md` — file map, 10 layers, master flowchart, failure table, interview answer set.
- **Learner Gaps:** Three checkpoints now open (S9 fallback-loop, S10 nullable-output, S11/12 Kafka-fail-mid-run walkthrough) — spaced repetition due.
- **Next Session Focus:** Learner to answer at least one open checkpoint; then Kafka consumer-side deep dive (partitions/consumer groups/offsets/lag) or Vercel Redpanda/Redis Cloud provisioning.

## Session 13 — Rate-limit algorithm deep dive + what is Lua
- **Route:** Basic to Interview, Phase 2
- **Prerequisite Check:** Learner asked "what are we rate limiting here," then "what algo is used," then genuinely didn't know what Lua was as a language — real gap, backed off to plain-English decomposition per the complexity-decomposition process.
- **Concepts Taught:** Two separate rate limits (`RUN_RATE_LIMIT` per-client-IP vs `MODEL_RATE_LIMIT` per-role-model, shared globally); fixed-window counter algorithm walked through with concrete numbers; boundary-burst weakness; why INCR+EXPIRE must be atomic (crash/race leaves a counter stuck with no TTL); what Lua actually is (embedded scripting language inside Redis, executed server-side as one atomic unit); `redis.call`, `KEYS`/`ARGV` convention; `client.eval(script, numKeys, ...args)` from ioredis.
- **Checkpoint Asked:** If `EXPIRE` ran after every `INCR` (not just count===1), what breaks? **Answered correctly** — learner identified the TTL-reset mechanism; corrected/extended to the sharper consequence: the client could become PERMANENTLY rate-limited since count never resets to 0 as long as they keep sending any requests.
- **Learner Gaps:** None new — Lua-as-a-language gap resolved this session.
- **Next Session Focus:** Learner asked "what's left to learn" — summarized full remaining roadmap.

## Session 14 — DAG wave scheduling + Redis integration testing
- **Route:** Basic to Interview, Phase 2
- **Prerequisite Check:** Learner explicitly chose: drop Kafka for now, focus on Redis, cover "rest of project's DAG waves etc whatever left." Confirmed local Redis container already running.
- **Concepts Taught:** Topological/wave-based DAG scheduling (`nextWave`/`planWaves`), why "tasks remain but none ready" doubles as cycle detection without a dedicated algorithm, why an LLM-produced plan specifically needs this runtime guard; unit test vs integration test distinction; Vitest syntax (`describe`/`it`/`expect`/`toBe`/`toEqual`/`.rejects.toThrow`/`beforeEach`/`afterAll`); why tests need unique per-test keys to avoid shared-mutable-state flakiness; how the Redis integration tests directly verify the count===1 TTL-guard checkpoint and the session.ts idempotency/stale-sequence guards against REAL Redis, not mocks.
- **Implementation Work:** Installed `vitest`; extracted `src/lib/swarm/dagSchedule.ts` (pure `nextWave`/`planWaves`) out of `orchestrator.ts`'s inline closure, behavior-preserving (typecheck clean); added `dagSchedule.test.ts` (7 tests) and `redis.integration.test.ts` (8 tests) — all 15 passing; added `pnpm test` script.
- **Checkpoint Asked:** If the session.ts Lua guard used `current > sequence` instead of `current >= sequence`, would the stale-sequence test still pass? Walk through `current`/`sequence` values at that moment. — not yet answered.
- **Learner Gaps:** Two older checkpoints (S9 fallback chain, S10 nullable output) still open; new S14 checkpoint added to the queue.
- **Next Session Focus:** Kafka intentionally deferred per learner request. Remaining: reliable orchestration architecture, observability/cost/security, DevOps/deployment (blocked on Vercel Redpanda+Redis Cloud signups), Next.js session (deferred to very end), senior interview prep (last).

## Session 16 — Production-readiness fixes implemented
- **Route:** Basic to Interview, Phase 2
- **Prerequisite Check:** Learner asked for the correct fault list AND actual fixes to make orchestration reliable, plus a clear split of "fixed now" vs "legitimate later, not currently required."
- **Concepts Reinforced:** Every fault discussed in the audit sessions was traced to a real, verified line of code before being fixed (not assumed from memory) — good practice modeled: verify, then fix.
- **Implementation Work:** Fixed `hasPaidAccess` permanent-poisoning bug, made `shouldFallback` actually gate the retry loop, distinguished infra errors (Redis down) from genuine model exhaustion across `run.ts`/`planner.ts`/`validator.ts` (only `AllModelsFailed` triggers graceful degradation now), removed dead try/catch in `rateLimit.ts`, wired real cancellation propagation from `route.ts`'s `req.signal` down through `orchestrator.ts` → `worker.ts`/`validator.ts`/`planner.ts`/synthesis `runText`. Full detail in `progress.md`.
- **Deliberately not implemented (given to learner as a "further upgrade, not urgently required" list):** transactional outbox, durable/resumable workflow engine (BullMQ/Temporal/Inngest), EventBus backpressure bounding, dead-letter queue, real auth/multi-tenancy, observability stack, real token-usage accounting.
- **Verification:** typecheck clean, 15/15 tests passed, lint clean.
- **Next Session Focus:** Commit/push this work; continue with reliable-orchestration-architecture theory (job queues, outbox pattern in more depth) once infra/testing topics are settled, or move to whichever topic the learner picks next.

## Session 17 — Reliable orchestration architecture: interview gauntlet
- **Route:** Basic to Interview, Phase 2 / Interview Prep crossover
- **Prerequisite Check:** Learner asked specifically for a chat-only list (no code) of what a senior interviewer would point out about Loom's orchestration reliability, paired with a counter-argument and the named upgrade for each — i.e. Session 18-style interview prep pulled forward and scoped to reliable orchestration specifically.
- **Concepts Taught (10-item attack/counter/upgrade list):**
  1. In-request orchestration dies with the invocation (no crash resumption) — counter: durable record via Redis vs. durable workflow are different things; upgrade: BullMQ job queue, or Temporal/Inngest for step-level replay.
  2. "Durable history" vs. "durable workflow" conflation — counter: draw the distinction proactively; upgrade: persist per-task status as data, add a staleness-sweep recovery process.
  3. Cancellation propagation — counter: THIS ONE IS ALREADY FIXED (Session 16) — `req.signal` → `runSwarm` → wave-boundary checks → threaded into every model call via `AbortSignal.any`; honest residue: checkpoint-based, not instantaneous; upgrade: check signal inside the validator retry loop too, add a distinct `cancelled` terminal state.
  4. Redis/Kafka no shared transaction — counter: Redis-first ordering already prevents event loss, Kafka failure is visible not silent; upgrade: transactional outbox relay (idempotent producer makes retries safe).
  5. Retry policy / backoff — counter: retries are lateral (next model) not vertical (same model with backoff), `maxRetries:0` is deliberate; upgrade: exponential backoff + jitter for same-resource retries (the future outbox relay).
  6. Repeatedly-failing tasks — counter: one feedback revision then graceful placeholder degradation, visible in UI/event log; upgrade: dead-letter queue after N failures, explicit "degraded" marker on final output.
  7. EventBus queue is unbounded — counter: bounded in practice (one browser/run), durable path is serialized; upgrade: high-water-mark cap, or Kafka-based fan-out for real backpressure.
  8. Horizontal scaling / multi-instance SSE — counter: live SSE is instance-pinned, but replay works from any instance via Redis; upgrade: Redis Pub/Sub or Kafka-based fan-out so any instance can serve any run's live stream.
  9. Per-IP rate limiting with no auth — counter: honestly demo-scale trust model, stated as such; upgrade: real per-user auth, quotas by user ID, token bucket, provider-reported cost accounting.
  10. No observability — counter: readiness endpoint exists, nothing else does; upgrade: structured logs with `runId` correlation, RED metrics, Kafka lag/Redis memory monitoring, alerting on 503-rate and `AllModelsFailed`-rate.
- **Meta-framing taught:** the strongest interview move is naming your own system's gaps unprompted with a prioritized fix list, and pointing to the ALREADY-FIXED items (commits `885eee0`, `872cd1e`) as proof of a working audit-and-fix loop rather than theoretical awareness.
- **Offered but not yet taken:** a live mock-interview drill (tutor attacks each point, learner counters from memory).
- **Next Session Focus:** Learner's choice — mock interview drill on this list, or continue into observability/cost/security (Session 16 on the original roadmap numbering) or DevOps/Vercel provisioning (still blocked on Redpanda/Redis Cloud signups).

## Session 17 addendum — item 5 implemented for real
- Learner asked to actually implement the backoff+jitter retry policy from gauntlet item 5, not just describe it. Identified the one legitimate SAME-resource retry site in the codebase: Redis reconnection in `src/lib/swarm/redis.ts`'s `retryStrategy` (previously linear: `attempt * 100` capped at 2000ms).
- Changed to real exponential backoff with jitter: `base = min(2^attempt * 50, 2000)`, `jitter = random() * base * 0.5`, returns `round(base + jitter)`. Prevents concurrent server instances reconnecting after a Redis outage from retrying in lockstep.
- Verified: typecheck clean, 15/15 tests passed, lint clean.
- Learner then asked for an expanded, deep version of the interview attack/counter/upgrade list covering as much of the project as possible — delivered in chat, same format, continuing the numbering from the original 10.

## Checkpoint resolution (before Session 15)
- **S9 (fallback chain):** Tutor walked the answer — `throw new Error("empty completion")` in `runText` is a non-network condition that still triggers the `continue` (harmless here since retrying is actually correct for empty output, but demonstrates `shouldFallback`'s check doesn't gate anything real).
- **S10 (nullable output):** Tutor walked the answer — `estTokens(d.output)` calling `.length` on `null` would throw at runtime; TypeScript narrowing would force `?? ""` guards everywhere `output` is read, converting a latent runtime bug into a compile-time one.
- **S14 (Lua guard strictness):** Tutor walked the answer — `current > sequence` vs `current >= sequence` behave IDENTICALLY on the out-of-order/stale-sequence case tested; they diverge only on the EXACT-REPLAY case (`current === sequence`), where `>` would incorrectly let a duplicate through. Learner's instinct to ask about stale-sequence was reasonable but the real bug surface is the replay-idempotency test, not the ordering test.
- All three checkpoints closed by tutor explanation (learner did not independently answer before requesting a move to the next session).

## Session 15 — Reliable orchestration architecture (starting)
- **Route:** Basic to Interview, Phase 2
- **Prerequisite Check:** Learner requested checkpoints closed first, then this topic; Kafka still explicitly deferred.
- **Planned Concepts:** Background job queues vs. in-request orchestration; durable workflow state surviving process restarts; cancellation propagation; backpressure; retries with jitter; dead-letter handling; idempotency at the workflow level; the transactional outbox pattern (closing the Redis→Kafka gap flagged since Session 8); BullMQ/Temporal/Inngest vs. custom worker comparison.

## Session 13 — Placement handbook and interview mastery artifact
- **Route:** Basic to Interview, architecture-first, fast pacing.
- **Request:** Convert the full project and learning history into one professional placement PDF with separate frontend/backend modules, detailed flowcharts, hard code in easy words, production reasoning, cliché questions, and researched interview themes.
- **Repository Audit:** Re-verified the current client, API routes, EventBus, DAG orchestrator, AI wrappers, Zod schemas, Redis clients/Lua, Kafka producer/readiness, Dockerfile, Compose topology, package versions, and existing notes before writing.
- **Frontend Modules:** React/Next client boundaries; Fetch/Web Streams/SSE/AbortController; Zustand event projection; React Flow layout and performance.
- **Backend Modules:** Route gates/readiness; EventBus ordering/dual delivery; DAG waves/blackboard/validation; AI SDK/OpenRouter/Zod/TypeScript; Redis algorithms/session Lua; Kafka semantics/topology/consumer boundary.
- **Production Modules:** Docker/Compose; failure matrix/outbox/cancellation; security/testing/observability/performance/100× design.
- **Interview Modules:** Project introductions, 100+ embedded and cliché Q&A prompts, twelve senior scenarios, mock interview, glossary, seven-day route, last-day sheet, and 95+ self-rating rubric.
- **Research:** Used official Next.js, MDN, TypeScript, React, Zod, AI SDK, OpenRouter, Redis, Kafka/KafkaJS, and Docker documentation. Used LeetCode Discuss, Naukri Code360, and GeeksforGeeks only for recurring interview themes. Firecrawl was unavailable because the configured account had zero remaining credits, so direct web research was used as explicitly requested.
- **Accuracy Corrections:** Live events are not durable-before-visible; browser replay and backend cancellation are not implemented; Kafka has no consumer; no end-to-end exactly-once; local RF1/single Redis are not HA; validator/retry degradation and the ineffective `shouldFallback` condition are documented.
- **Artifacts:** `Loom_Placement_Handbook.md`, print HTML, 35-page A4 PDF, CSS, and six custom SVG flowcharts under `docs/placement-handbook/assets/`.
- **Verification:** Headless Chrome PDF render; visual inspection of opening/TOC, sampled frontend/backend/Redis/Kafka/production pages, glossary, source list, and final rubric; no sampled clipping or blank page.
- **Open Recall Checkpoints:** S9 fallback policy, S10 runtime nullable/invalid output, S12 Kafka event 7/20. These are included in Module 18 for spaced repetition.
- **Next Session Focus:** Learner delivers the 30-second introduction and answers one open checkpoint aloud before moving to Kafka consumer implementation or managed Redpanda/Redis provisioning.

## Session 18 — API key, OpenRouter client, AI SDK, and agent-call flow
- **Route:** Basic to Interview, Phase 2.
- **Prerequisite Check:** Learner asked to continue the next lesson and specifically wanted the full Loom request path stored, plus a deeper explanation of how the backend creates the OpenRouter model client, what an SDK is, why planner/worker/validator call the model, and how the AI SDK sends requests.
- **Concepts Taught:** Full browser-to-backend-to-agent-to-model-to-SSE path; `OPENROUTER_API_KEY` as provider permission; model ID as the selected AI brain; system prompt as role instruction; user prompt as task content; `createOpenRouter({ apiKey })` as provider-client creation; `model(id)` as model reference creation; `chainFor(role)` as dynamic model fallback selection; AI SDK as a helper layer over raw HTTP requests; planner/validator structured object calls vs worker/synthesizer streaming text calls.
- **Examples Used:** `POST /api/swarm` with `{ goal: "..." }`; planner creating a task graph; worker streaming text deltas; validator returning score/approval/feedback; synthesizer combining worker outputs.
- **Small Terms Explained:** SDK, OpenRouter, API key, model client, model ID, prompt, system prompt, user prompt, structured object, stream, SSE.
- **Doubts and Answers:** API key does not itself generate replies; it authorizes the backend to call OpenRouter. The actual reply comes from whichever model ID the backend selects through the role's fallback chain. Planner/worker/validator are not separate servers; they are backend code roles made agent-like by prompts, jobs, input/output contracts, and orchestration rules.
- **Artifacts:** Added "API key, OpenRouter client, AI SDK, and Loom agent-call flow" to `imp notes.md`.
- **Learner Gaps:** Needs to answer the checkpoint from memory: API key vs model ID vs system prompt vs user prompt vs AI SDK.
- **Grasp-Speed Signal:** Learner is moving fast but still needs very explicit request-path and provider/model vocabulary repetition.
- **Adaptation Used:** Reused the full numbered Loom path and mapped each abstract AI term directly to current project code.
- **Next Session Focus:** Continue with Next.js App Router/client-server boundary OR drill the current checkpoint first, then trace `src/app/api/swarm/route.ts` line by line.

## Session 19 — Checkpoint drill + Next.js App Router client/server boundary
- **Route:** Basic to Interview, Phase 2.
- **Prerequisite Check:** Learner chose to do both pending items: drill API key/model/prompt/SDK vocabulary and then learn Next.js App Router plus client/server boundary.
- **Concepts Taught:** Checkpoint answer for API key vs model ID vs system prompt vs user prompt vs AI SDK; Next.js file-based route mapping; page component vs route handler; server component default; `"use client"` client component marker; browser-side `fetch("/api/swarm")`; backend-only `process.env.OPENROUTER_API_KEY`; `POST(req: Request)` route handler; `Response` and streaming `ReadableStream`; why Redis/Kafka/OpenRouter calls belong on the server.
- **Examples Used:** `src/app/page.tsx`, `src/lib/useRunSwarm.ts`, `src/app/api/swarm/route.ts`, and `src/app/api/health/route.ts`.
- **Small Terms Explained:** App Router, route handler, client component, server component, `Request`, `Response`, `process.env`, `fetch`, `AbortController`, `ReadableStream`, `TextEncoder`, route boundary.
- **Learner Gaps:** Needs to explain from memory why moving `OPENROUTER_API_KEY` or Kafka/Redis clients into a client component would be a security/design bug.
- **Next Session Focus:** Trace `src/app/api/swarm/route.ts` line by line, then frontend `useRunSwarm.ts` stream parsing line by line.

## Session 20 — SSE deep dive + JSON parsing vs Zod validation
- **Route:** Basic to Interview, Phase 2.
- **Prerequisite Check:** Learner asked for a deeper SSE lesson with code and interview aspects, and specifically asked what `parse JSON` does compared with Zod schema validation for LLM replies and JSON over HTTP networking.
- **Concepts Taught:** SSE as a long-lived one-way HTTP response; server `ReadableStream`; `TextEncoder`; SSE frame format `data: ...\n\n`; client `response.body.getReader()`; `TextDecoder`; chunk buffering; frame splitting by blank line; `JSON.stringify` to turn objects into network text; `JSON.parse` to turn received network text back into objects; HTTP JSON parsing via `req.json()`; difference between parsing and validation; Zod as runtime shape validation for LLM structured output.
- **Examples Used:** `src/app/api/swarm/route.ts` SSE producer, `src/lib/useRunSwarm.ts` SSE consumer, `src/lib/swarm/bus.ts` AsyncIterable event queue, and `src/lib/swarm/planner.ts` Zod planner schema.
- **Small Terms Explained:** SSE, frame, chunk, buffer, encoder, decoder, JSON, parse, stringify, validation, schema, `req.json()`, `res.body.getReader()`, `controller.enqueue`.
- **Doubts and Answers:** `JSON.parse` only converts a JSON string into a JavaScript value; it does not prove the value has the expected shape. Zod validates shape/types/rules. Loom uses JSON parsing for HTTP/SSE transport and Zod for strict LLM-generated structured replies.
- **Learner Gaps:** Needs to repeat the difference between "valid JSON syntax" and "valid business/schema shape" from memory.
- **Next Session Focus:** Continue networking foundation: HTTP request/response anatomy, headers, body, status codes, streaming vs normal response, then trace `route.ts` line by line.

## Session 21 — Remaining project learning roadmap refresh
- **Route:** Basic to Interview, Phase 2.
- **Prerequisite Check:** Learner paused the SSE/networking lesson and asked specifically for what is left in the project to learn, and to update `sessions.md`, `progress.md`, and `imp notes.md`.
- **Concepts Covered:** Current completed areas vs remaining areas; remaining HTTP/networking fundamentals; Next.js App Router route mapping; TypeScript line-by-line confidence; Kafka consumer/offset/lag gap; Redis advanced revision; reliable orchestration architecture; observability/cost/security; production deployment; frontend internals; senior interview delivery.
- **Artifacts:** Added "What is left to learn in Loom" to `imp notes.md`.
- **Learner Gaps:** Needs a clean ordered path through remaining topics instead of jumping between concepts; still needs recall practice on JSON parse vs Zod, SSE purpose, and `/api/swarm/[runId]` purpose.
- **Grasp-Speed Signal:** Learner is moving quickly and tends to request broad roadmap resets; keep lessons tightly sequenced and project-file-based.
- **Next Session Focus:** HTTP anatomy through all three `route.ts` files, starting with why `/api/swarm`, `/api/swarm/[runId]`, and `/api/health` exist.

## Session 22 — Platform hardening: auth, billing, Temporal, and Go
- **Date:** 18 July 2026.
- **Route:** Project engineering + interview readiness; implementation session, not a tutor-skill lesson.
- **Implemented:** Better Auth with PostgreSQL sessions and per-run ownership; Free/Pro Stripe subscriptions; per-user Redis quotas; Temporal Workflow/Worker boundary; Docker Compose services for PostgreSQL/Temporal/Go; isolated Go Kafka telemetry consumer; health/status UI; clean application/infrastructure boundaries; deployment documentation.
- **Go mental model:** Go does not replace Next.js. It independently consumes Kafka events, commits valid messages, and exposes `/healthz` plus Prometheus `/metrics`. The swarm still works if telemetry is removed.
- **Payments mental model:** Stripe owns money/subscription truth. A signed webhook updates Loom's PostgreSQL entitlement projection. Free users receive 10 runs/hour; active/trialing Pro users receive 100 runs/hour; Customer Portal manages billing.
- **Temporal honesty:** A run is durably dispatched outside the HTTP process, but the swarm is currently one coarse Activity with retries disabled. Phase-level idempotent Activities/checkpoints remain the next reliability lesson.
- **Next Session Focus:** Trace auth cookies and the Stripe webhook request line by line, then learn Temporal Workflow determinism versus Activity side effects.

## Session 23 — Auth session cookies + Stripe webhook, line by line
- **Date:** 30 July 2026.
- **Route:** Basic to Interview, Phase 2 (continuing the Session 22 "Next Session Focus").
- **Prerequisite Check:** Learner resumed after a 10-day gap. Repo re-audited before teaching: HEAD is `1aba9ed` (Azure Event Hubs via Kafka protocol, 20 Jul). Commits from 19–20 Jul (`ee1e090` focused swarm workspace, `91116d1` bounded agent context/token budget, `a4dc9da` home chat + readable deliverables, `44c0e75` sourced researcher via Firecrawl, `1aba9ed` Event Hubs) were shipped but never logged in `sessions.md`/`progress.md` — flagged to the learner as a documentation gap.
- **Concepts Taught:** Stateless HTTP and why a cookie exists; signed session cookie vs session row in PostgreSQL; `BETTER_AUTH_SECRET` as the HMAC signing key; absolute expiry (`expiresIn`) vs sliding refresh (`updateAge`) and the write-amplification tradeoff; `Secure`/`HttpOnly`/`SameSite` cookie flags and why `useSecureCookies` is env-gated; auth endpoint rate limits as credential-stuffing and signup-spam defence; the Better Auth catch-all route handler; why `getRequestSession(req)` takes `req.headers`; CSRF and the `hasTrustedOrigin` Origin/Referer check as defence-in-depth alongside `SameSite`.
- **Concepts Taught (billing):** Why the Stripe webhook must read RAW bytes before parsing (signature covers exact payload bytes); `constructEvent` HMAC verification with `STRIPE_WEBHOOK_SECRET`; at-least-once webhook delivery and event-ID deduplication via a `stripe_webhook_event` insert with `on conflict do nothing` inside a transaction; out-of-order delivery and the `last_stripe_event_created` monotonic guard in the upsert `where` clause; reconcile-from-Stripe (`currentSubscription`) instead of trusting the event's embedded object; the local `billing_subscription` table as an entitlement PROJECTION, not the source of truth; `select ... for update` row locking; ownership cross-checks preventing a Stripe customer being rebound to another Loom user; idempotency keys on customer/checkout creation; returning 500 to make Stripe retry vs 200 to stop retries.
- **Small Terms Explained:** cookie, `HttpOnly`, `Secure`, `SameSite`, HMAC, signing secret, session row, sliding expiry, write amplification, catch-all route `[...all]`, `toNextJsHandler`, CSRF, Origin header, Referer header, raw body, `TextDecoder(..., { fatal: true })`, webhook, at-least-once delivery, idempotency, deduplication, projection, source of truth, `on conflict do nothing`, `on conflict do update ... where`, `for update`, transaction, `begin`/`commit`/`rollback`, idempotency key, epoch seconds.
- **Examples Used:** `src/lib/auth.ts`, `src/app/api/auth/[...all]/route.ts`, `src/lib/auth-client.ts`, `src/lib/database.ts`, `src/app/api/swarm/route.ts:27-33` (auth + origin gate), `src/lib/http/request.ts` (`readBodyBytes`, `hasTrustedOrigin`), `src/app/api/billing/webhook/route.ts`, `src/lib/billing/service.ts`, `src/lib/billing/repository.ts:96-179`.
- **Learner Gaps:** Checkpoints issued and pending — (1) why parsing the webhook JSON before verifying the signature destroys the security guarantee; (2) what breaks if the `where billing_subscription.last_stripe_event_created < excluded...` clause is deleted; (3) why the webhook returns 500 on processing failure instead of 200.
- **Next Session Focus:** Temporal — Workflow determinism vs Activity side effects, why the current single coarse Activity is a reliability gap, and phase-level idempotent Activities with checkpoints (`src/temporal/workflows.ts`, `src/temporal/activities.ts`, `src/lib/swarm/launch.ts`).

## Session 24 — Full revision (S1–S22), code-drift correction, and Temporal/Kafka-consumer/Go
- **Date:** 30 July 2026.
- **Route:** Basic to Interview, Phase 2 + Interview Prep crossover (learner asked for buzzword banks).
- **Learner Request:** Revise sessions 1–22, surface any changes to previously-taught material, then teach the genuinely new areas: Temporal, Go, Kafka consumer side, Stripe buzzwords. Azure Event Hubs explicitly excluded for now.
- **Part A — Revision:** One-line recap of every session 1–22, regrouped into eight knowledge themes (event pipeline, DAG orchestration, AI/Zod contracts, Redis, Kafka producer, TypeScript, Docker/infra, reliability audit).
- **Part B — Code drift corrections (previously-taught material that is now WRONG):** rate limiting moved from per-IP fixed window to per-user plan quota keyed by `authSession.user.id` with a separate `runs:max` counter; the API gate order changed (auth 401 → trusted origin 403 → parse/validate → API key → infra readiness → plan quota/rate limit → attachments → launch); `EventBus` now takes `(runId, ownerId, { localDelivery })`; SSE now has TWO sources (live bus in direct mode, `readDurableEvents` Redis polling in Temporal mode); `runSwarm` now takes a `SwarmMode` and is governed by `executionPolicy` (low/auto/max task bounds, revisions, approval score, directives); context is now bounded by `tokenBudget.ts`; route handlers no longer own execution (`launchSwarm` boundary); Kafka HAS a consumer now (Go telemetry) so the old "no consumer" line is stale; observability is partially fixed (Prometheus metrics); Session 17 gauntlet items 9 (no auth / per-IP limits) and 10 (no observability) are now partly closed; the Placement Handbook `.md/.html/.pdf` were DELETED from the repo at commit `957f26c` (only `docs/placement-handbook/handbook.css` and six SVGs remain).
- **Part C — Temporal:** durable execution; event-history replay; Workflow determinism vs Activity side effects; banned non-determinism inside Workflows; `proxyActivities`; `startToCloseTimeout` vs `heartbeatTimeout` and the 10s-pulse/30s-timeout ratio; `retry: { maximumAttempts: 1 }` as a deliberate non-idempotency decision; `workflowId: swarm-<runId>` as free workflow-level dedup; task queue and worker long-polling; V8 sandbox and `workflowsPath`; `cancellationSignal()` bridged into the existing `AbortSignal` path; `localDelivery: false` + `readDurableEvents` 150ms Redis polling as the cross-process SSE bridge; the honest gap — one coarse Activity means durable dispatch but no step-level resumption.
- **Part D — Kafka consumer side:** consumer group, partition assignment, offsets, committed vs log-end offset, consumer lag, rebalance, at-most-once vs at-least-once vs exactly-once, manual commit after processing, poison message and head-of-line blocking, dead-letter topic, group-ID versioning (`loom-telemetry-v1`) as a replay switch, `AtStart` offset reset for backfill, runId partition key giving per-run ordering only.
- **Part E — Go:** why a separate Go daemon; goroutines; `context.Context` as Go's AbortSignal; `signal.NotifyContext` graceful shutdown; `defer`; explicit `if err != nil`; `%w` wrapping and `errors.Is`; `atomic.Int64`/`atomic.Bool` lock-free counters across goroutines; struct tags; Go 1.22 method-aware mux patterns; `ReadHeaderTimeout` slowloris guard; Prometheus exposition format and counter-vs-gauge semantics.
- **Part F — Buzzword banks:** delivered for Temporal, Kafka, Go, and Stripe.
- **Learner Gaps:** New checkpoints open — (1) why a `Math.random()` call inside `loomSwarmWorkflow` is a bug but is fine inside `executeSwarm`; (2) what concretely breaks if `DisableAutoCommit()` is removed from the Go consumer; (3) why per-run ordering holds but cross-run ordering does not; (4) the three Session-23 Stripe checkpoints remain unanswered.
- **Next Session Focus:** Learner's choice — implement phase-level idempotent Temporal Activities (closing the real reliability gap), expose Kafka consumer lag as a metric, or run a mock-interview drill over the refreshed gauntlet.

## Session 25 — PostgreSQL in Loom (the untaught third data store)
- **Date:** 30 July 2026.
- **Route:** Basic to Interview, Phase 2 + buzzword bank.
- **Prerequisite Check:** Learner noticed PostgreSQL is in the stack but was never taught. Correct — it arrived in Session 22's implementation work and has no lesson in Sessions 1–22.
- **Concepts Taught:** Why three stores (Redis = hot/ephemeral/atomic counters, Kafka = immutable log/fan-out, Postgres = relational truth needing constraints and transactions); polyglot persistence; `text primary key` as a structural one-row-per-user guarantee; `references "user" (id) on delete cascade` and why `"user"` is quoted; `unique` on `stripe_customer_id` as DB-level defence backing the app-level ownership check; `timestamptz` vs `timestamp`; `bigint default 0` making the first webhook always win the monotonic comparison; `create index if not exists`; idempotent additive migrations (`if not exists` everywhere) and the expand-contract implication; `stripe_webhook_event` as the dedup table with unbounded-growth gap; `char(64)` + regex `CHECK` constraint enforcing sha-256 hex shape; storing token hashes not tokens; soft revocation via nullable `revoked_at`; the atomic update-with-predicate-in-WHERE-returning pattern (`consumeMcpToken`, `revokeStoredMcpToken`) and `rowCount` as the race-free guard; `pg_advisory_lock(hashtext(...))` serialising concurrent Vercel release migrations; ACID; READ COMMITTED default; `SELECT ... FOR UPDATE` row locking; connection pooling (`max`, `idleTimeoutMillis`, `connectionTimeoutMillis`); `globalThis` pool caching to survive Next.js HMR; the serverless connection-explosion problem and transaction-mode poolers (PgBouncer/Neon/Supabase/RDS Proxy) plus their incompatibility with session-scoped advisory locks and prepared statements; build-time migrations gated by production env validation in `vercel-build.ts`.
- **Examples Used:** `src/lib/database.ts`, `scripts/migrate-auth.ts`, `scripts/migrate-billing.ts`, `scripts/migrate-mcp.ts`, `scripts/vercel-build.ts`, `src/lib/mcp/repository.ts`, `src/lib/billing/repository.ts`, `docker-compose.yml` postgres service.
- **Small Terms Explained:** relation, primary key, foreign key, cascade, unique constraint, check constraint, index, `timestamptz`, epoch seconds, upsert, `on conflict`, `returning`, `rowCount`, advisory lock, transaction, ACID, isolation level, READ COMMITTED, row lock, connection pool, pooler, HMR, idempotent migration, expand-contract, soft delete.
- **Honest Gaps Named:** nothing prunes `stripe_webhook_event`; migrations are additive-only with no version table or down-path; no pooler configured for serverless scale-out; `pg_isready` in Compose checks liveness not schema readiness.
- **Learner Gaps:** Three new checkpoints open (update-with-predicate race safety, pool-per-instance math, cascade semantics on account deletion), plus the four still open from Sessions 23–24.
- **Next Session Focus:** Learner's choice from the Session 24 menu (phase-level Temporal Activities, Kafka consumer-lag metric, mock interview, handbook regeneration) — or a Postgres hands-on: add `stripe_webhook_event` pruning and a pooler-safe migration path.

## Session 26 — The new stack in request order: what, upgrade-from, alternatives, why
- **Date:** 30 July 2026.
- **Route:** Basic to Interview, Phase 2 — conceptual/vocabulary session, minimal code by learner request.
- **Learner Request:** Teach the post-Session-22 stack in order, each item framed as "what it is / what it upgraded / what it does here / alternatives considered / why this one", with keywords and no long code walkthroughs.
- **Order Used:** request lifecycle — Better Auth → PostgreSQL → Stripe → execution mode + token budget → Temporal → Redis bridge → Kafka producer → franz-go/Go telemetry → Prometheus → Firecrawl → Cloudinary → MCP.
- **Concepts Taught:** For each layer, the before→after upgrade, the alternatives rejected and the reason, and the vocabulary to use in interviews. Plus the "why so many moving parts" defence, the polyglot-persistence justification, and a single end-to-end stack diagram.
- **Alternatives Covered:** NextAuth/Clerk/Auth0/roll-your-own vs Better Auth; MySQL/MongoDB/SQLite/Redis-only vs PostgreSQL; Paddle/LemonSqueezy/Razorpay vs Stripe; BullMQ/Inngest/Trigger.dev/AWS Step Functions/custom vs Temporal; RabbitMQ/SQS/NATS/Redis Streams vs Kafka; Node/Rust/Python vs Go for the consumer; OpenTelemetry/Datadog vs raw Prometheus exposition; Tavily/SerpAPI/Exa/raw scraping vs Firecrawl; S3+CloudFront/UploadThing vs Cloudinary; REST/plugin APIs vs MCP.
- **Learner Gaps:** No new checkpoints issued; seven remain open from Sessions 23–25.
- **Next Session Focus:** Unchanged menu — phase-level Temporal Activities, Kafka consumer-lag metric, mock interview, handbook regeneration, or Postgres pruning/pooler work.

## Session 27 — Stack curriculum, Module 1: Temporal (deep)
- **Date:** 30 July 2026.
- **Route:** Basic to Interview, Phase 2. Learner clarified they want one deep module per technology in sequence (Temporal → Stripe → …), conceptual, minimal code.
- **Curriculum Fixed:** 1 Temporal, 2 Stripe, 3 PostgreSQL, 4 Better Auth, 5 Kafka consumer + Go, 6 observability/Prometheus, 7 Firecrawl + Cloudinary, 8 MCP, 9 cost layer (execution modes + token budget).
- **Concepts Taught (Temporal):** the three failure stories durable execution solves; record-decisions-not-memory vs memory snapshotting; cluster architecture (frontend/history/matching/worker services + persistence) and the rule that the server never executes user code; worker long-polling and why that makes workers firewall-friendly; the event history as the durable artifact; replay mechanics and how completed Activities are served from history; determinism rules and the banned API list; the V8 sandbox; workflow versioning with `patched()` and worker build-ID versioning; Activities as the side-effect boundary; at-least-once Activity execution and why idempotency keys matter; the four Activity timeouts (schedule-to-start, start-to-close, schedule-to-close, heartbeat) and what each one detects; heartbeating and cancellation delivery; retry policy fields and non-retryable error types; signals, queries, and updates; child workflows; history-size limits and continue-as-new; the saga/compensation pattern; Temporal's operational cost.
- **Loom Mapping:** current single coarse Activity = durable dispatch without step-level resume; `workflowId: swarm-<runId>` as free dedup; `maximumAttempts: 1` as a deliberate non-idempotency decision; `cancellationSignal()` bridging into the Session-16 AbortSignal plumbing; `localDelivery:false` + Redis polling as the cross-process SSE bridge; the concrete phase-level Activity redesign that would unlock retries.
- **Alternatives Covered:** BullMQ, Inngest, Trigger.dev, AWS Step Functions, Restate, custom Redis worker — with the decision rule for each.
- **Learner Gaps:** New checkpoints on determinism, timeout selection, and the idempotency-key redesign. Seven earlier checkpoints still open.
- **Next Session Focus:** Module 2 — Stripe (deep).

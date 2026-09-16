# Loom architecture

## Boundaries

| Layer | Owns | Must not own |
| --- | --- | --- |
| Next.js adapters | HTTP parsing, auth checks, status codes, SSE framing, durable replay | LLM workflow rules |
| Application services | launching a run, plan entitlements, orchestration use cases | browser rendering |
| Swarm domain | plans, DAG waves, worker/validator/synthesis rules | Stripe or HTTP |
| Infrastructure adapters | PostgreSQL, Redis, Kafka, Temporal, OpenRouter | product policy |
| UI | user intent and event projection | secrets or subscription authority |
| Go telemetry | Kafka consumption, metrics, the live browser socket | core run execution |

## Data ownership

- PostgreSQL owns users, sessions, Stripe customer/subscription projections.
- Stripe owns the actual payment and subscription lifecycle.
- Redis owns live run projections, replay streams, and quota counters.
- Kafka owns the scalable downstream event log.
- Temporal owns workflow execution history.
- Zustand owns only the current browser projection.
- The durable Redis stream, never Kafka, owns event completeness: Kafka is a best-effort mirror.

## Research and MCP boundaries

- Researcher tasks call Firecrawl only from the server through a fixed HTTPS endpoint; the browser never receives the provider key.
- Search results are URL-validated, count-bounded, excerpt-bounded, and framed as untrusted reference data before entering a worker prompt.
- Source links remain in the final Markdown, so downstream CLI agents can inspect the evidence instead of receiving an opaque summary.
- `/api/mcp` exposes only `list_runs` and `get_final_deliverable`. Both are read-only, owner-scoped, and operate inside the existing run-retention window.
- MCP bearer tokens are shown once and persisted only as SHA-256 hashes. The MCP boundary cannot launch, mutate, or delete swarms.

## Live event transport

The browser has two lanes for one run and a single reducer behind them.

| Lane | Path | Role |
| --- | --- | --- |
| WebSocket | Kafka → Go hub → `wss://.../ws?runId=` | primary when `NEXT_PUBLIC_TELEMETRY_WS_URL` is set |
| SSE | `POST /api/swarm` response | fallback, and the run's lifeline in `direct` mode |
| Replay | `GET /api/swarm/[runId]?after=<sequence>` | durable Redis stream, paginated from the client's cursor; reconciles the other two |

Selection is by configuration, not by negotiation: a configured socket URL means
WebSocket-first, an empty one means SSE only. The POST response is held open and
drained for the whole run either way, because in `direct` execution mode
cancelling it aborts the swarm, and because a warm lane makes falling back a
switch rather than a new request.

Correctness does not depend on either live lane being complete. Every frame
carries the run `sequence`, the client tracks the last one applied, and a gap, a
lane handover, or a freshly opened socket all trigger the same durable replay,
de-duplicated by sequence. This matters because the Kafka publish is
best-effort by design (`src/lib/swarm/bus.ts`): a run can succeed with an event
that never reached Kafka, and therefore never reached the socket.

## Failure behavior

- Missing session: HTTP 401 before infrastructure or model work.
- Invalid goal: HTTP 400.
- Kafka/Redis unavailable: HTTP 503 before model spend.
- Quota exceeded: HTTP 429 with `Retry-After`.
- Temporal start failure: HTTP 503; run is marked failed.
- Browser disconnect: Temporal mode continues independently; reconnect can read persisted events.
- Telemetry socket unreachable or dropped: the UI falls back to SSE and replays the durable stream; no run is affected.
- Kafka mirror drops an event: the socket has a sequence gap, which triggers the same durable replay.
- Stripe webhook signature failure: HTTP 400 and no entitlement mutation.
- Go consumer failure: swarm remains available; monitoring becomes unhealthy.

## Scaling notes

Run IDs key Kafka records, preserving per-run partition order. Redis writes are idempotent by run sequence. Redis and Kafka still do not share one transaction; a production-hardening step is a transactional outbox relay. The current Temporal boundary is coarse-grained and should become phase-level Activities before claiming exact mid-run recovery.

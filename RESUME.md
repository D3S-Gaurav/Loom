# Loom — Resume Description (verified 2026-08-19)

**Repo:** https://github.com/D3S-Gaurav/Loom

## Resume bullets (current, verified against source)

**LOOM — Event-Driven AI Agent-Swarm Orchestrator**
*Go · gRPC · WebSockets · Kafka · PostgreSQL · Redis · Stripe · Next.js*

- Engineered a distributed orchestrator where a planner decomposes one goal into a concurrent **task DAG**; parallel workers execute, validators request revisions, and a synthesizer merges results, streamed live to a React Flow graph over a **WebSocket with automatic SSE fallback**.
- Guaranteed replay-safety with a single **atomic Redis Lua script** that updates the run projection and appends to an XADD stream under a deterministic `sequence-0` id, so a replayed event is a no-op; **Kafka** mirrors those events to an isolated **Go** consumer exporting Prometheus metrics.
- Exposed the Go telemetry service over **gRPC and WebSockets**: a server-streaming `StreamRunEvents` RPC (with gRPC health + reflection) and a `/ws` socket push the same live event feed to services and browsers, with an origin allowlist and ping/pong keepalive. The product UI consumes that socket as its primary live transport.
- Made a best-effort mirror safe to render from: because a failed Kafka publish is deliberately swallowed (Redis is the source of truth), the client tracks each run's monotonic `sequence` and answers a gap, a transport handover, or a late-joining socket with the **same durable replay** from the Redis-backed endpoint, de-duplicated by sequence so a replayed event is a no-op.
- Fanned **one Kafka consumer out to N concurrent subscribers** through a mutex-guarded registry of per-subscriber buffered channels; `publish` never blocks, and a subscriber that fills its buffer is evicted rather than allowed to stall offset commits and force a consumer-group rebalance. Verified with `-race` tests over gRPC bufconn and a real WebSocket handshake.
- Shipped production concerns end to end: PostgreSQL-backed auth and per-run ownership, Stripe billing with signed webhooks, schema-validated LLM output and Docker Compose deployment.

## Facts these bullets rest on

| Claim | Source in repo |
|---|---|
| Planner → DAG → workers → validator → synthesizer | `README.md` request path; Temporal `swarm` activity |
| WebSocket-primary browser transport, SSE fallback, one reducer | `src/lib/swarm/runStream.ts`, `src/lib/swarm/wsTransport.ts`, `src/lib/useRunSwarm.ts` |
| Sequence-gap → durable replay → de-duplication | `src/lib/swarm/runStream.ts` (`createRunEventGate`), `src/app/api/swarm/[runId]/route.ts` |
| Capped exponential backoff with jitter on reconnect | `src/lib/swarm/wsTransport.ts` (`retryDelayMs`) |
| Live transport shown in the UI | `src/components/SwarmGraph.tsx` |
| Client transport tests (parity, gap → one backfill, duplicates, fallback) | `src/lib/swarm/runStream.test.ts`, `src/lib/swarm/wsTransport.test.ts` |
| Public `wss://` deployment for the telemetry service | `render.yaml`, `docs/deployment.md` |
| Temporal durable workflows | `Dockerfile.temporal`, `services/`, `docker-compose.yml` |
| Kafka events → Go consumer → `/metrics` (Prometheus text format) | `src/lib/swarm/kafka.ts`, `services/telemetry/main.go:236,243` |
| gRPC contract: unary `GetRunMetrics` + **server-streaming** `StreamRunEvents` | `proto/telemetry/v1/telemetry.proto:14,19` |
| gRPC stream handler, health service, reflection | `services/telemetry/grpc.go:43,101,104` |
| WebSocket endpoint mounted on the telemetry HTTP server | `services/telemetry/main.go:228`, `services/telemetry/ws.go:44` |
| WebSocket origin allowlist + server-side ping/pong keepalive | `services/telemetry/ws.go:46,97,148` |
| Non-blocking fan-out; slow subscriber evicted, not waited on | `services/telemetry/hub.go:15,77,87` |
| Kafka poll loop publishes into the hub | `services/telemetry/main.go:175` |
| gRPC bufconn + WebSocket + fan-out tests, all under `-race` | `services/telemetry/grpc_test.go`, `ws_test.go`, `hub_test.go` |
| CI: pnpm lint/typecheck/test (real Redis service) + `go vet`/`build`/`test -race` | `.github/workflows/ci.yml` |
| Redis run state, replayable events, atomic per-user rate limits | `README.md` (Free 3 runs/hr, Pro 100/hr) |
| Better Auth + PostgreSQL sessions, run ownership | `README.md` |
| Stripe Checkout, signed webhooks, entitlement projection | `README.md` |
| Zod-validated planner/validator structured output | `README.md` |
| Read-only account-scoped MCP server (`list_runs`, `get_final_deliverable`) | `README.md` |

## Interview caveats to volunteer

- The browser is **WebSocket-primary with an SSE fallback**, selected by whether
  `NEXT_PUBLIC_TELEMETRY_WS_URL` is set — so with no telemetry service deployed,
  the app runs entirely over SSE. The socket has to live in the Go container
  because a Vercel serverless function cannot hold one open, which is exactly
  why the fallback is required rather than optional: the browser dials that
  container directly, so anything between them (no deployment, a proxy that
  refuses `Upgrade`, an `https://` page and a `ws://` URL) has to degrade to
  something. Volunteer this before being asked.
- The `POST /api/swarm` response stays open even while the socket is rendering.
  In `direct` execution mode that response *is* the run's lifeline — cancelling
  it aborts the swarm — and keeping it drained makes the fallback a switch
  rather than a new request. It is not a second copy of the UI's event path;
  its frames are dropped while the socket is live.
- WebSocket-first is a real latency win only in `temporal` mode, where the SSE
  lane is a 150 ms Redis poll (`src/lib/swarm/sse.ts`) and the socket is a push.
  In `direct` mode the in-process SSE lane is the faster of the two; the socket
  is preferred there for one behaviour, not for speed.
- gRPC is **service-to-service**; browsers cannot speak gRPC over HTTP/2 without
  a grpc-web proxy, which is exactly why the same hub also exposes `/ws`.
- The event body crosses the gRPC boundary as `payload_json`, not as typed
  protobuf variants, because the union is owned by the TypeScript orchestrator
  (`src/lib/swarm/types.ts`). That is a deliberate coupling trade-off, not an
  oversight.

## Claims deliberately NOT made
- No user/traffic numbers (no production telemetry to cite).
- No latency or throughput figures (none benchmarked).

## Claims removed from the resume (2026-08-19, revised)

- **Temporal** — REMOVED from every resume variant. `src/temporal/workflows.ts:11` sets `retry: { maximumAttempts: 1 }` (automatic Activity replay is disabled until each phase has an idempotency key) and `getExecutionMode()` defaults to `direct`, so Temporal is not on the live path at all. Any "retries safely after a crash" wording is contradicted by the source. Do not reintroduce.
- **Kafka — KEPT** (reversed 2026-08-19 on Anshu's call). The code is real (`src/lib/swarm/kafka.ts:29-49` — idempotent producer, `acks:-1`, `allowAutoTopicCreation:false`; franz-go consumer in `services/telemetry/main.go`). Interview caveat to volunteer: it is a **best-effort telemetry mirror** — publish failures are swallowed in `src/lib/swarm/bus.ts:109-114` and Redis is the source of truth. If asked "why not Prometheus directly": Prometheus scrapes, it cannot ingest application events; the Go consumer IS the Prometheus exporter, and Kafka decouples it from the web tier.

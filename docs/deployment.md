# Deployment checklist

## Web adapter (Vercel)

- Set `OPENROUTER_API_KEY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `APP_URL`.
- Set managed `DATABASE_URL`, `REDIS_URL`, and Kafka TLS/SASL variables. Kafka is
  required: readiness fails and new runs are rejected when the broker or topic is
  unavailable.
- Use `LOOM_EXECUTION_MODE=direct` only for a constrained Vercel showcase. For durable
  production execution, set it to `temporal` and configure the reachable Temporal
  address/namespace/task queue plus the always-on Worker below.
- Set `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, and `STRIPE_WEBHOOK_SECRET`.
- Production builds validate required URLs/secrets, then run the idempotent
  `pnpm db:migrate` release step under a PostgreSQL advisory lock before
  `next build`. Preview builds skip Production migrations.

### Free hosted Kafka (Aiven)

1. Create an Aiven for Apache Kafka free-tier service in a region near `iad1`.
2. Enable SASL authentication and `letsencrypt_sasl`, then create
   `loom.swarm.events` with two partitions.
3. Add the service URI values to Vercel Production as `KAFKA_BROKERS` (use only
   `host:port`, without a URL scheme), `KAFKA_USERNAME`, and `KAFKA_PASSWORD`.
4. Set `KAFKA_SSL=1`, `KAFKA_SASL_MECHANISM=scram-sha-256`, and
   `KAFKA_SWARM_EVENTS_TOPIC=loom.swarm.events`.

If the SASL endpoint uses Aiven's project CA instead of a public Let's Encrypt
certificate, add the complete PEM value as encrypted `KAFKA_CA_CERT`.

Aiven may power off an inactive free service. A required Kafka dependency means
Loom will reject runs until that service is active again.

## Background services

Deploy `Dockerfile.temporal` to an always-on container platform. Deploy `services/telemetry/Dockerfile` separately. Both must use managed endpoints, not Compose service names.

## Live event transport

The browser prefers the telemetry WebSocket and falls back to the SSE response
from `POST /api/swarm`. Two variables decide what actually happens in a given
environment, and they must agree.

| Variable | Set on | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_TELEMETRY_WS_URL` | the web app (Vercel) | Where the **browser** dials. Set = WebSocket-first; empty = SSE only. |
| `TELEMETRY_WS_ALLOWED_ORIGINS` | the Go service (Render) | Exact origins allowed to complete the handshake. |

1. Deploy `services/telemetry` from the root `render.yaml` blueprint. Render
   publishes it on `https://<service>.onrender.com`, so the socket address is
   `wss://<service>.onrender.com/ws`.
2. Set `TELEMETRY_WS_ALLOWED_ORIGINS` on the telemetry service to the exact web
   origins, including scheme and no trailing slash — the production domain plus
   any preview domain that should be able to open the socket, e.g.
   `https://loom.vercel.app,https://loom-git-main-<scope>.vercel.app`.
   A WebSocket handshake is a plain `GET`, so a CORS preflight never protects
   this endpoint; the allowlist is the only check.
3. Set `NEXT_PUBLIC_TELEMETRY_WS_URL=wss://<service>.onrender.com/ws` on Vercel
   and redeploy. `NEXT_PUBLIC_*` values are inlined at build time, so editing the
   variable alone changes nothing until the app is rebuilt.

Constraints worth knowing before wiring this up:

- The URL is dialled by the user's browser, not by the server. A deployed Vercel
  app cannot reach a telemetry container running in local Compose, and a page
  served over `https://` cannot open a `ws://` socket — browsers block the mixed
  content. Production must be a public `wss://` address or the browser silently
  stays on SSE.
- Leaving `NEXT_PUBLIC_TELEMETRY_WS_URL` empty is a supported configuration, not
  a broken one: the app runs entirely over SSE and the run stream indicator says
  so.
- The telemetry `/healthz` probe reports the Kafka consumer, not just the
  process, so the service will not go live until its broker credentials work.

## Stripe

- Create a recurring Pro Price.
- Register `/api/billing/webhook` and select Checkout + subscription lifecycle events.
- Enable Customer Portal cancellation and payment-method updates.
- Test success, cancellation, failed renewal, deletion, and repeated webhook delivery.

## Production controls still recommended

- phase-level Temporal Activities and idempotency keys;
- Redis-to-Kafka transactional outbox;
- OpenTelemetry traces and structured logs keyed by `runId`;
- dashboards/alerts for latency, errors, Temporal failures, Kafka lag, Redis pressure, and LLM cost;
- verified email, password-reset flow, and stronger abuse controls;
- managed backups, secret rotation, and a tested rollback procedure.

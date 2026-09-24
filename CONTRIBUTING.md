# Contributing

Thanks for taking a look. Issues, bug reports, and pull requests are all
welcome, including small ones.

## Getting it running

Requirements: Node.js 20+, pnpm 11, Docker, and an OpenRouter API key. A
Firecrawl key is optional and only needed for live Researcher search.

```bash
pnpm install
cp .env.example .env.local
# Fill OPENROUTER_API_KEY and BETTER_AUTH_SECRET (openssl rand -base64 32).

pnpm infra:up        # Postgres, Redis, Kafka, Temporal
pnpm db:migrate
pnpm temporal:worker # second terminal
pnpm dev             # http://localhost:3000
```

`README.md` has the full service table and the deployment notes.

## Before you open a pull request

Run what CI runs, so the review is about the change and not the pipeline:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

`src/lib/swarm/redis.integration.test.ts` talks to a real Redis rather than a
mock, because the run projection is a Lua script. `pnpm infra:up` gives you
one. If you touch the Go telemetry service:

```bash
cd services/telemetry
go vet ./... && go build ./... && go test -race ./...
```

CI runs both halves on every pull request.

## What makes a change easy to merge

- One concern per pull request. Two unrelated fixes are two pull requests.
- A test that fails before the change and passes after it. For a bug fix this
  is the most useful thing in the diff.
- Commit subjects in the imperative mood, prefixed by area, matching what is
  already in `git log` (`fix(ui): ...`, `feat(api): ...`, `docs: ...`).
- Say what you tested and what you did not. Honest gaps are fine; silent ones
  cost a review round.

## Reporting bugs

Open an issue with the steps, what you expected, and what happened. If a run
misbehaved, the run ID and the mode it ran in (Low, Auto, Max) narrow it down
fast.

Security issues go through [SECURITY.md](SECURITY.md) instead, not a public
issue.

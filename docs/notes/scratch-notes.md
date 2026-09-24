# Important Notes: Loom API Call, SSE, and Live Streaming Flow

> Current production correction: Kafka and Redis are now required, not optional. Older snippets later in this learning file that show optional infrastructure describe the earlier implementation.

## Example used in this lesson

```text
User prompt: "Generate research on AI agents in healthcare"
User clicks: Swarm
```

## Full high-level flowchart

```text
GoalBar button click
  ↓
useRunSwarm()
  ↓
fetch("/api/swarm")
  ↓
Next.js route.ts
  ↓
runSwarm(goal, bus)
  ↓
EventBus emits events
  ↓
ReadableStream sends SSE chunks
  ↓
browser reads chunks
  ↓
Zustand store updates
  ↓
React UI rerenders live
```

## Full file-level flowchart

```text
src/components/GoalBar.tsx
  User enters goal and clicks Swarm.
  Calls the run function returned by useRunSwarm().
  ↓

src/lib/useRunSwarm.ts
  reset(goal)
  fetch("/api/swarm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ goal }),
    signal: ctrl.signal,
  })
  Then reads the response stream with:
    res.body.getReader()
    TextDecoder()
    buffer.split("\n\n")
    JSON.parse(...)
    apply(event)
  ↓

src/app/api/swarm/route.ts
  export async function POST(req: Request)
  Reads request JSON:
    const { goal } = await req.json().catch(() => ({ goal: "" }));
  Validates goal.
  Checks OPENROUTER_API_KEY.
  Creates:
    const bus = new EventBus();
    const encoder = new TextEncoder();
  Starts:
    runSwarm(goal.trim(), bus)
  Returns:
    new Response(stream, { headers: { "content-type": "text/event-stream" } })
  ↓

src/lib/swarm/orchestrator.ts
  runSwarm(goal, bus)
  Emits:
    run.start
  Calls planner.
  Runs worker DAG waves.
  Calls validator.
  Runs synthesizer.
  Emits:
    agent.spawn
    agent.status
    agent.token
    validate.result
    run.done
  ↓

src/lib/swarm/bus.ts
  EventBus receives emitted events.
  Stores early events in queue.
  Resolves waiting stream readers when events arrive.
  Lets route.ts consume events with:
    for await (const event of bus)
  ↓

src/app/api/swarm/route.ts
  Converts each event:
    JS object
      → JSON.stringify(event)
      → `data: ${JSON.stringify(event)}\n\n`
      → encoder.encode(...)
      → controller.enqueue(...)
  Sends each event as an SSE chunk.
  ↓

Browser network layer
  Receives byte chunks over one open HTTP connection.
  ↓

src/lib/useRunSwarm.ts
  reader.read()
  decoder.decode(value, { stream: true })
  buffer += decoded text
  chunks = buffer.split("\n\n")
  line.slice(5).trim()
  JSON.parse(...)
  apply(event)
  ↓

src/lib/store.ts
  Zustand apply(event) updates state:
    agents
    edges
    statuses
    streamed output
    validator score/feedback
    final answer
  ↓

React components rerender:
  src/components/SwarmGraph.tsx
  src/components/AgentFlowNode.tsx
  src/components/SidePanel.tsx
```

## Mandatory Kafka + Redis production flow

```text
POST /api/swarm
  ↓
assertInfrastructureReady()
  ├─ Kafka admin checks that loom.swarm.events exists
  └─ Redis returns PONG
  ↓
Redis distributed run-rate limit
  ↓
runSwarm() emits SwarmEvent
  ↓
EventBus creates versioned envelope
  {
    version,
    id,
    runId,
    sequence,
    occurredAt,
    event
  }
  ├─ Fast local branch:
  │    EventBus queue → SSE → browser immediately
  │
  └─ Ordered durable branch:
       Redis Lua script atomically stores:
         ├─ current run projection (hash)
         └─ append-only event history (Redis Stream)
       ↓
       Kafka publishes the same envelope
         key = runId
         acks = -1
       ↓
       run completion waits for all durable deliveries
```

Why Redis comes before Kafka:

```text
If Redis succeeds and Kafka fails:
  the canonical event still exists and the run fails visibly.

If Kafka ran first and Redis failed:
  downstream Kafka consumers could see an event that the application's
  recoverable run history does not contain.
```

Important tradeoff: Redis and Kafka cannot participate in one shared transaction. For strict no-gap publication at larger scale, a dedicated outbox worker should read unpublished durable Redis events, publish them to Kafka, and mark them delivered.

Local infrastructure commands:

```bash
pnpm infra:up
pnpm infra:ps
pnpm infra:topic
pnpm infra:logs
pnpm infra:down
```

Interview answer:

> "Kafka and Redis are required infrastructure in the hardened Loom flow. Before accepting a run, the API verifies the Kafka topic and Redis connectivity. Every swarm event is wrapped in a versioned envelope with a run ID and sequence. EventBus sends a local branch to SSE immediately for low-latency UI, while an ordered durable branch runs in the background. A Redis Lua script atomically updates the run projection and append-only stream using a deterministic sequence ID, then the idempotent Kafka producer publishes that envelope keyed by run ID with all in-sync replica acknowledgement. The key preserves per-run partition order, while separate runs can scale across partitions. The run cannot complete until durable delivery catches up; if it fails, the client receives a terminal error."

## 1. How the API is called

In the browser, code calls:

```ts
fetch("/api/swarm", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ goal }),
  signal: ctrl.signal,
});
```

Cheatsheet:

```text
┌──────────────────────┬──────────────────────────────────────┐
│ Term                 │ Meaning                              │
├──────────────────────┼──────────────────────────────────────┤
│ fetch                │ Browser function for HTTP requests    │
├──────────────────────┼──────────────────────────────────────┤
│ "/api/swarm"          │ Backend endpoint inside Next.js       │
├──────────────────────┼──────────────────────────────────────┤
│ POST                 │ HTTP method for sending data          │
├──────────────────────┼──────────────────────────────────────┤
│ headers              │ Metadata about request body           │
├──────────────────────┼──────────────────────────────────────┤
│ content-type         │ Tells server body format is JSON      │
├──────────────────────┼──────────────────────────────────────┤
│ JSON.stringify       │ Converts JS object to JSON string     │
├──────────────────────┼──────────────────────────────────────┤
│ signal               │ Lets browser cancel the request       │
└──────────────────────┴──────────────────────────────────────┘
```

If `goal` is:

```text
"Generate research on AI agents in healthcare"
```

Then:

```ts
JSON.stringify({ goal })
```

becomes:

```json
{"goal":"Generate research on AI agents in healthcare"}
```

So the browser sends:

```http
POST /api/swarm
content-type: application/json

{"goal":"Generate research on AI agents in healthcare"}
```

## 2. Where `/api/swarm` goes

In Next.js App Router:

```text
src/app/api/swarm/route.ts
```

maps to:

```text
/api/swarm
```

This function handles the request:

```ts
export async function POST(req: Request) {
```

So:

```ts
fetch("/api/swarm", { method: "POST" })
```

calls:

```ts
POST(req)
```

inside `route.ts`.

## 3. What the route does first

It reads the body:

```ts
const { goal } = await req.json().catch(() => ({ goal: "" }));
```

Meaning:

```text
Take JSON sent by browser.
Extract goal.
If JSON is broken, use empty goal.
```

Then validates:

```ts
if (!goal || typeof goal !== "string" || goal.trim().length < 4) {
  return new Response(JSON.stringify({ error: "Provide a goal (min 4 chars)." }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}
```

Meaning:

```text
If goal is missing or invalid, return error immediately.
Do not waste AI tokens.
```

Then checks API key:

```ts
if (!process.env.OPENROUTER_API_KEY) {
  return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY is not set on the server." }), {
    status: 500,
    headers: { "content-type": "application/json" },
  });
}
```

Important:

```text
API key is checked on backend, not frontend.
```

Why:

```text
Frontend code is visible to users.
Backend environment variables are private.
```

## 4. What streaming is

Normal API:

```text
Browser asks question.
Server does all work.
Server returns final answer only.
```

Timeline:

```text
0s request sent
5s planner running
15s workers running
25s final ready
25s browser receives response
```

User sees nothing until 25s.

Streaming API:

```text
Browser asks question.
Server starts work.
Server sends updates while work is happening.
```

Timeline:

```text
0s request sent
1s browser receives run.start
2s browser receives plan.start
4s browser receives agent.spawn
5s browser receives agent.token
6s browser receives agent.token
12s browser receives validate.result
25s browser receives run.done
```

User sees progress live.

## 5. What SSE does

SSE means Server-Sent Events.

It is a simple format for server-to-browser live updates over one HTTP connection.

SSE is one-way:

```text
server → browser
```

In Loom, that is enough because:

```text
browser sends goal once
server sends many updates back
```

SSE message format:

```text
data: {"kind":"agent.token","delta":"AI agents"}

```

Important:

```text
data:
```

means:

```text
this line contains event data
```

```text
\n\n
```

means:

```text
blank line; this event is finished
```

## 6. How Loom creates SSE

In `route.ts`:

```ts
controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
```

Break it into 4 conversions:

### Step A: backend event object

```ts
const event = {
  kind: "agent.token",
  id: "agent-t1",
  delta: "AI agents"
};
```

### Step B: JSON.stringify

```ts
JSON.stringify(event)
```

becomes:

```json
{"kind":"agent.token","id":"agent-t1","delta":"AI agents"}
```

### Step C: wrap as SSE

```ts
`data: ${JSON.stringify(event)}\n\n`
```

becomes:

```text
data: {"kind":"agent.token","id":"agent-t1","delta":"AI agents"}

```

### Step D: encode to bytes

```ts
encoder.encode(...)
```

becomes bytes that can travel over HTTP.

Why encoding exists:

```text
Network streams send bytes.
JavaScript strings must be converted into bytes before sending.
```

## 7. What `ReadableStream` does

Code:

```ts
const stream = new ReadableStream({
  async start(controller) {
    try {
      for await (const event of bus) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
    } finally {
      controller.close();
    }
  },
});
```

Plain English:

```text
Create a response body that stays open.
Whenever EventBus gives an event:
  convert event to SSE bytes
  push it to browser immediately.
When EventBus closes:
  close the response.
```

`controller.enqueue(...)` means:

```text
send this chunk now
```

So each event becomes one live chunk.

## 8. Why EventBus is needed here

Because `runSwarm` and the API stream are separate.

`runSwarm` emits events:

```ts
bus.emit({ kind: "plan.start" });
bus.emit({ kind: "agent.spawn", ... });
bus.emit({ kind: "agent.token", ... });
```

The API route reads events:

```ts
for await (const event of bus) {
  controller.enqueue(...);
}
```

So the bus connects them:

```text
runSwarm emits → EventBus stores/delivers → route streams
```

## 9. What the browser receives

The browser receives text chunks like:

```text
data: {"kind":"run.start","goal":"Generate research...","at":123}

data: {"kind":"plan.start"}

data: {"kind":"agent.spawn","id":"agent-t1","agentType":"researcher"}

data: {"kind":"agent.token","id":"agent-t1","delta":"AI agents"}

data: {"kind":"agent.token","id":"agent-t1","delta":" in healthcare"}

data: {"kind":"validate.result","id":"agent-t1","score":8}

data: {"kind":"run.done","final":"...","tokensIn":1200,"tokensOut":2300,"ms":18000}

```

It does not receive one final JSON blob. It receives many small events.

## 10. How the browser reads the stream

In `useRunSwarm.ts`:

```ts
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
```

Meaning:

```text
reader = reads byte chunks from response
decoder = converts bytes back to text
buffer = holds incomplete event text
```

Loop:

```ts
while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const chunks = buffer.split("\n\n");
  buffer = chunks.pop() ?? "";

  for (const chunk of chunks) {
    const line = chunk.trim();
    if (!line.startsWith("data:")) continue;
    apply(JSON.parse(line.slice(5).trim()) as SwarmEvent);
  }
}
```

Plain English:

```text
1. Read bytes from response.
2. Convert bytes to text.
3. Add text to buffer.
4. Split complete SSE events by blank line.
5. Keep unfinished leftover.
6. For each complete event:
   - remove "data:"
   - parse JSON
   - call apply(event)
```

## 11. Why buffer is needed

Network chunks can split randomly.

Server sends:

```text
data: {"kind":"agent.token","delta":"AI agents"}\n\n
```

Browser might receive it as two pieces:

Chunk 1:

```text
data: {"kind":"agent.tok
```

Chunk 2:

```text
en","delta":"AI agents"}\n\n
```

If we parse chunk 1 immediately, it crashes.

So we use `buffer`:

```text
store incomplete text
wait for \n\n
then parse complete event
```

This is a key interview detail.

## 12. After parsing, what happens

Client gets JS object:

```ts
{
  kind: "agent.token",
  id: "agent-t1",
  delta: "AI agents"
}
```

Then:

```ts
apply(event)
```

goes to Zustand store.

In `store.ts`:

```ts
case "agent.token": {
  const a = s.agents[e.id];
  if (!a) return {};
  return { agents: { ...s.agents, [e.id]: { ...a, output: a.output + e.delta } } };
}
```

Meaning:

```text
Find that agent.
Append token text to its output.
Update state.
React rerenders UI.
```

That is why text appears live.

## Full live streaming pipeline

```text
Worker creates token
  ↓
bus.emit({ kind: "agent.token", delta })
  ↓
EventBus gives event to route
  ↓
route JSON.stringify(event)
  ↓
route wraps as SSE: data: ...\n\n
  ↓
TextEncoder converts text to bytes
  ↓
controller.enqueue sends chunk
  ↓
browser reader.read receives bytes
  ↓
TextDecoder converts bytes to text
  ↓
client splits by \n\n
  ↓
JSON.parse gives event object
  ↓
Zustand apply(event)
  ↓
React UI rerenders
```

## Interview answer: how API is called

> The frontend calls `/api/swarm` using `fetch` with method `POST` and a JSON body containing the user goal. In Next.js App Router, that maps to `src/app/api/swarm/route.ts`, specifically the exported `POST(req)` function. The route validates the input, creates an EventBus, starts the swarm, and returns an SSE stream.

## Interview answer: how streaming works

> Streaming works by returning a `ReadableStream` instead of a normal JSON response. The route keeps the response open. Every time the EventBus yields a swarm event, the route encodes that event as an SSE frame and pushes it into the stream with `controller.enqueue`. The browser reads the response body chunk by chunk and updates the UI as each event arrives.

## Interview answer: what SSE does

> SSE is the wire format and protocol style for server-to-client events. Each event is sent as text beginning with `data:` and ending with a blank line. In Loom, SSE lets the backend send live planner, worker, validator, and final-output events over one HTTP connection without needing WebSockets.

## Common misconception

Wrong:

```text
SSE is the AI model streaming.
```

Correct:

```text
The AI model streams tokens to backend.
Backend converts those tokens into Loom events.
Loom sends those events to browser using SSE.
```

So there are two streaming layers:

```text
Model provider → backend
backend → browser
```

Loom controls the second one.

## Next session

Next session should be `useRunSwarm.ts` deep dive.

It should cover:

```text
1. AbortController
2. fetch POST request
3. response.body.getReader()
4. TextDecoder
5. buffer handling
6. splitting SSE frames
7. JSON.parse
8. apply(event)
9. common stream bugs
10. interview questions
```

## Checkpoint

Answer in your own words:

```text
Why do we need both TextEncoder on the server and TextDecoder on the browser?
```

---

# Production Skills: Kafka, Redis Sessions, and Rate Limiting

## Why this upgrade exists

The original EventBus was only in memory:

```text
runSwarm emits event
  ↓
EventBus queue in server RAM
  ↓
SSE stream to current browser
```

That is good for a demo, but weak for production.

Production problems:

```text
1. Server crash loses events.
2. Browser reconnect cannot replay old events.
3. Multiple app servers do not share memory.
4. No distributed rate limit across servers.
5. No audit trail for swarm runs.
```

Kafka and Redis improve this:

```text
Kafka = distributed event publishing for observability/audit/downstream consumers
Redis = shared state for rate limits, run sessions, and event replay
```

## Production flowchart

```text
Browser POST /api/swarm
  ↓
route.ts validates goal + API key
  ↓
route.ts computes clientId from headers
  ↓
Redis rate limiter checks:
  loom:rate:runs:<clientId>
  ↓
If over limit:
  return 429 + retry-after
  ↓
If allowed:
  create runId = crypto.randomUUID()
  ↓
create EventBus(runId)
  ↓
runSwarm(goal, bus)
  ↓
bus.emit(event)
  ↓
EventBus wraps event in envelope:
  { version, id, runId, sequence, occurredAt, event }
  ↓
EventBus sends event to 3 places:
  1. local SSE queue for current browser
  2. Redis stream/session storage
  3. Kafka topic
  ↓
route.ts streams raw SwarmEvent to browser as SSE
  ↓
browser updates UI live
```

## Skill vocabulary

```text
┌──────────────────────────┬──────────────────────────────────────┐
│ Term                     │ Meaning                              │
├──────────────────────────┼──────────────────────────────────────┤
│ Kafka                    │ Distributed event log / message bus   │
├──────────────────────────┼──────────────────────────────────────┤
│ topic                    │ Named stream of Kafka messages        │
├──────────────────────────┼──────────────────────────────────────┤
│ producer                 │ Code that writes messages to Kafka    │
├──────────────────────────┼──────────────────────────────────────┤
│ message key              │ Value Kafka uses for partition/order  │
├──────────────────────────┼──────────────────────────────────────┤
│ acks: -1                 │ Wait for all in-sync replicas         │
├──────────────────────────┼──────────────────────────────────────┤
│ idempotent producer      │ Reduces duplicate/ordering risks      │
├──────────────────────────┼──────────────────────────────────────┤
│ Redis                    │ Fast shared in-memory data store      │
├──────────────────────────┼──────────────────────────────────────┤
│ INCR                     │ Atomically increment a Redis counter  │
├──────────────────────────┼──────────────────────────────────────┤
│ EXPIRE                   │ Set automatic key deletion time       │
├──────────────────────────┼──────────────────────────────────────┤
│ TTL                      │ Time left before key expires          │
├──────────────────────────┼──────────────────────────────────────┤
│ fixed window limit       │ Count requests inside time window     │
├──────────────────────────┼──────────────────────────────────────┤
│ Redis Stream             │ Append-only event list in Redis       │
├──────────────────────────┼──────────────────────────────────────┤
│ runId                    │ Unique id for one swarm run           │
├──────────────────────────┼──────────────────────────────────────┤
│ sequence                 │ Increasing event number per run       │
└──────────────────────────┴──────────────────────────────────────┘
```

## Kafka in this project

File:

```text
src/lib/swarm/kafka.ts
```

Important code:

```ts
const brokers = process.env.KAFKA_BROKERS?.split(",")
  .map((b) => b.trim())
  .filter(Boolean);
```

Meaning:

```text
Read comma-separated Kafka broker addresses from env.
If no brokers are configured, Kafka is disabled.
```

Producer setup:

```ts
const producer = kafka.producer({
  allowAutoTopicCreation: process.env.KAFKA_ALLOW_AUTO_TOPIC_CREATION === "1",
  idempotent: true,
  maxInFlightRequests: 5,
});
```

Meaning:

```text
Create a Kafka producer.
idempotent: true improves reliable delivery semantics.
maxInFlightRequests limits simultaneous sends.
```

Publishing:

```ts
await producer.send({
  topic,
  acks: -1,
  messages: [
    {
      key: envelope.runId,
      value: JSON.stringify(envelope),
      headers: {
        eventKind: envelope.event.kind,
        eventVersion: String(envelope.version),
      },
    },
  ],
});
```

Meaning:

```text
Send every swarm event to Kafka.
Use runId as the message key.
Store the full event envelope as JSON.
Add headers for event type and version.
acks: -1 waits for all in-sync replicas.
```

Why `runId` as key matters:

```text
Kafka keeps messages with the same key in the same partition.
That helps preserve event order within one swarm run.
```

Interview answer:

> Kafka is used to mirror swarm events into a distributed event log. The local SSE stream updates the current browser, while Kafka enables audit trails, observability, replay pipelines, analytics, and downstream consumers. Events are keyed by `runId`, so all events for one run stay ordered within a Kafka partition.

## Redis rate limiting in this project

File:

```text
src/lib/swarm/rateLimit.ts
```

Limits:

```ts
export const RUN_RATE_LIMIT = {
  limit: intEnv("LOOM_RUNS_PER_WINDOW", 20),
  windowSeconds: intEnv("LOOM_RUN_WINDOW_SECONDS", 3600),
};

export const MODEL_RATE_LIMIT = {
  limit: intEnv("LOOM_MODEL_CALLS_PER_WINDOW", 120),
  windowSeconds: intEnv("LOOM_MODEL_WINDOW_SECONDS", 3600),
};
```

Meaning:

```text
RUN_RATE_LIMIT limits new swarm runs.
MODEL_RATE_LIMIT limits model calls.
Defaults:
  20 runs per hour
  120 model calls per hour
```

Atomic Redis script:

```lua
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return { count, redis.call("TTL", KEYS[1]) }
```

Meaning:

```text
Increment request counter.
If this is the first request in the window, set expiry.
Return current count and remaining TTL.
```

Why Lua script:

```text
INCR and EXPIRE need to behave atomically.
If they were separate commands and the server crashed between them,
the counter might never expire.
```

Route usage:

```ts
await enforceRateLimit({
  key: rateLimitKey("runs", clientId),
  ...RUN_RATE_LIMIT,
});
```

If over limit:

```ts
return new Response(JSON.stringify({ error: e.message, retryAfterSeconds: e.retryAfterSeconds }), {
  status: 429,
  headers: {
    "content-type": "application/json",
    "retry-after": String(e.retryAfterSeconds),
  },
});
```

Meaning:

```text
Reject request with HTTP 429.
Tell client how many seconds to wait before retrying.
```

Interview answer:

> Redis is used for shared distributed rate limits. Because every app instance talks to the same Redis, limits work even when the app is horizontally scaled. The implementation uses an atomic `INCR` + `EXPIRE` Lua script to implement a fixed-window counter and returns HTTP 429 with `retry-after` when the limit is exceeded.

## Redis run sessions and replay

File:

```text
src/lib/swarm/session.ts
```

Event envelope:

```ts
export interface SwarmEventEnvelope {
  version: 1;
  id: string;
  runId: string;
  sequence: number;
  occurredAt: number;
  event: SwarmEvent;
}
```

Meaning:

```text
Raw event gets wrapped with production metadata:
version      protocol version
id           unique event id
runId        which swarm run this belongs to
sequence     event number inside this run
occurredAt   timestamp
event        original SwarmEvent
```

Persist event:

```ts
await redis
  .multi()
  .hset(session, ...fields)
  .expire(session, SESSION_TTL_SECONDS)
  .xadd(eventStream, "MAXLEN", "~", EVENT_STREAM_MAX_LENGTH, "*", "envelope", JSON.stringify(envelope))
  .expire(eventStream, SESSION_TTL_SECONDS)
  .exec();
```

Meaning:

```text
Update current run projection in Redis hash.
Append full event envelope to Redis Stream.
Expire both session and event stream after TTL.
```

Replay endpoint:

```text
src/app/api/swarm/[runId]/route.ts
```

GET flow:

```ts
const session = await getRunSession(runId);
return Response.json({ session, events: await getRunEvents(runId) });
```

Meaning:

```text
Client can retrieve stored session and past events for a runId.
This is the base for reconnect/replay.
```

Interview answer:

> Redis stores two things: a current run projection and an append-only event stream. The projection gives quick status/final/error lookup, while the event stream preserves the event history for replay. The route `GET /api/swarm/:runId` can return both, which is the foundation for reconnect and debugging.

## Updated EventBus responsibility

Old responsibility:

```text
local queue for SSE only
```

New responsibility:

```text
local queue for SSE
+ Redis persistence
+ Kafka publishing
+ sequence numbers
+ run lifecycle finish
```

Code idea:

```ts
const envelope: SwarmEventEnvelope = {
  version: 1,
  id: `${this.runId}:${++this.sequence}`,
  runId: this.runId,
  sequence: this.sequence,
  occurredAt: Date.now(),
  event,
};
```

Then:

```ts
this.delivery = this.delivery
  .catch(() => undefined)
  .then(() => this.deliver(envelope));
```

Meaning:

```text
Serialize durable delivery so Redis/Kafka see events in local emission order.
```

Delivery:

```ts
await Promise.all([persistRunEvent(envelope), publishSwarmEvent(envelope)]);
```

Meaning:

```text
Write the event to Redis and Kafka.
Do both as part of event delivery.
```

Tradeoff:

```text
Good: more production-ready, replayable, observable.
Cost: more infrastructure, more latency risk, more failure modes.
```

## Strict vs non-strict delivery

Environment:

```text
LOOM_STRICT_EVENT_DELIVERY=1
```

If strict:

```text
Kafka/Redis delivery failure can fail the run contract.
```

If not strict:

```text
App logs delivery failure but keeps the live run working.
```

Interview answer:

> I made event delivery configurable. In local/demo mode, Kafka or Redis can be absent and the app still works. In production strict mode, failed durable delivery can fail the run because auditability and replay may be part of the product contract.

## Fixed-window rate limit tradeoff

Current approach:

```text
20 runs per 3600 seconds
```

Pros:

```text
Simple.
Fast.
Atomic with Redis.
Works across many app servers.
```

Cons:

```text
Boundary burst problem.
A user can send 20 requests at 10:59 and 20 more at 11:00.
```

More advanced options:

```text
sliding window log
sliding window counter
token bucket
leaky bucket
```

Interview answer:

> Fixed window is a pragmatic first production rate limiter. It is simple, cheap, and distributed through Redis, but it allows bursts at window boundaries. For stricter abuse control, I would move to token bucket or sliding window.

## Production upgrade interview answer

> The app now keeps the original SSE path for live browser updates, but adds Kafka and Redis for production concerns. Kafka receives versioned swarm event envelopes keyed by `runId`, which supports audit trails, ordered per-run event consumption, and downstream analytics. Redis handles distributed rate limiting and stores run sessions plus append-only event streams for replay. This separates live UX from durable infrastructure: SSE is for the active browser, Redis is for state/replay, Kafka is for distributed event consumers.

## Next production skill sessions

```text
1. Kafka topic/message key/partition ordering
2. Redis fixed-window rate limiter line-by-line
3. Redis Streams vs Kafka: when to use which
4. Reconnect/replay design with runId and sequence
5. Strict delivery tradeoffs and failure handling
```

---

# MASTER DEEP DIVE — Full Backend Scan (Session 12, 2026-07-16)

Every backend file scanned and explained, layer by layer, bottom-up. This is the
single reference document for the whole Loom backend.

## Layer 0 — File map: what each file owns

```text
src/lib/swarm/
  config.ts          reads + validates every env var (fail-fast)
  infrastructure.ts  cached Kafka+Redis health probes (5s cache + in-flight dedup)
  redis.ts           the ONE shared Redis connection (singleton)
  kafka.ts           the ONE shared Kafka producer + admin topic check (singleton)
  rateLimit.ts       Redis Lua fixed-window rate limiter
  session.ts         Redis run projection (hash) + append-only event stream
  bus.ts             EventBus: live handoff to SSE + ordered durable delivery
  types.ts           domain + event types (discriminated union SwarmEvent)
  models.ts          OpenRouter client + per-role model fallback chains
  run.ts             runText/runObject/genObject executors with chain fallback
  planner.ts         goal -> Zod-validated DAG plan (with fallback plan)
  worker.ts          one task execution, blackboard context, revision retry
  validator.ts       quality gate with code-level score guardrail
  orchestrator.ts    wave scheduler, validator retry loop, synthesis
src/app/api/
  health/route.ts        GET readiness probe (200/503)
  swarm/route.ts         POST start run + SSE stream out
  swarm/[runId]/route.ts GET replay a finished/ongoing run from Redis
src/lib/
  useRunSwarm.ts     browser: fetch POST, parse SSE frames, apply() each event
  store.ts           Zustand reducer: SwarmEvent -> graph/UI state
```

## Layer 1 — config.ts: validated configuration (fail-fast)

- `required(name)` — throws `InfrastructureConfigError` if an env var is missing/blank.
  Fail-fast: a missing `KAFKA_BROKERS` fails at first use with a NAMED error instead
  of a confusing network timeout later.
- `positiveInt(name, fallback)` — optional numeric envs; garbage like `"abc"` or `-5`
  throws instead of silently becoming `NaN`.
- `bool(name)` — accepts 1/0, true/false, yes/no; anything else throws.
- `kafkaSasl()` — username+password must be configured TOGETHER (half a credential is
  a config bug); mechanism must be plain / scram-sha-256 / scram-sha-512. Managed
  Kafka (Redpanda/Confluent) requires SASL; local Compose runs PLAINTEXT with no SASL.
- `getKafkaConfig()` — splits `KAFKA_BROKERS` on commas (multi-broker support),
  regex-validates the topic name (`^[a-zA-Z0-9._-]+$`).
- `getRedisConfig()` — parses `REDIS_URL` with `new URL()` and requires the protocol
  to be `redis:` or `rediss:` (the extra `s` = TLS, needed for managed Redis).
- Key idea: config errors are a DIFFERENT CLASS from network errors. A config error
  means "the operator misconfigured the deployment"; a network error means "the
  dependency is down." infrastructure.ts preserves that distinction in health output.

## Layer 2 — infrastructure.ts + /api/health: readiness

- `checkDependency(fn)` wraps a probe, returning `{ ok, latencyMs, error? }` —
  latency is measured even on failure (a 5000ms failure means timeout;
  0ms failure means instant refusal e.g. DNS/config — that's how we diagnosed the
  Vercel incident: latencyMs 0 = nothing reachable at all).
- `getInfrastructureHealth()`:
  - Result cached for `LOOM_INFRA_HEALTH_CACHE_MS` (default 5s) so a burst of
    requests doesn't hammer Kafka admin + Redis PING every time.
  - `inFlight` dedup: if a probe is ALREADY running, new callers await THAT promise
    instead of launching parallel probes (thundering-herd protection).
  - `force: true` (used by /api/health) bypasses the cached RESULT but still shares
    an in-flight probe.
  - Kafka + Redis probed CONCURRENTLY via `Promise.all` — total wait is max(kafka,
    redis), not sum.
- `assertInfrastructureReady()` throws `InfrastructureUnavailableError` carrying the
  full health object, so the API route can tell the client WHICH dependency is down.
- `/api/health/route.ts`:
  - `export const dynamic = "force-dynamic"` — Next.js must never cache/pre-render
    this; a cached "ready" would defeat the whole point.
  - `cache-control: no-store` — tells CDNs/browsers the same thing.
  - Returns HTTP 200 with `status: "ready"` or HTTP 503 with per-dependency detail.
    Both Docker's HEALTHCHECK and load balancers key off the status code alone.

## Layer 3 — redis.ts / kafka.ts: singleton connections

redis.ts:
- Module-level `redisClient` / `redisPromise` = one connection per server process,
  shared by rate limiting AND session persistence.
- `lazyConnect: true` — constructing does not connect; `.connect()` does. Failure is
  surfaced where you can handle it, not in a constructor.
- `maxRetriesPerRequest: 1`, `enableOfflineQueue: false` — FAIL FAST + VISIBLY. If
  Redis is down, commands throw instead of silently queueing in memory.
- `client.on("end", ...)` resets the singletons to null so the NEXT `getRedis()`
  builds a fresh connection instead of returning a dead one forever.
- `retryStrategy: attempt * 100 capped at 2000ms` — linear backoff for reconnects.

kafka.ts:
- Producer config: `idempotent: true` (broker de-duplicates producer retries — same
  spirit as the Redis sequence guard), `maxInFlightRequests: 5` (safe upper bound for
  idempotent ordering), `allowAutoTopicCreation: false` (topics are provisioned by
  infrastructure — compose's kafka-init — never implicitly by app traffic; an
  auto-created topic would get default partitions/retention, wrong for production).
- `publishSwarmEvent(envelope)`:
  - `key: envelope.runId` — Kafka hashes the key to pick a partition; SAME key =
    SAME partition = strict ordering guarantee PER RUN (not across runs).
  - `acks: -1` — wait for ALL in-sync replicas before confirming. Slowest, safest.
  - `headers: { eventKind, eventVersion, eventId }` — consumers can filter/route
    without parsing the JSON value; version supports future schema evolution.
  - `timestamp: envelope.occurredAt` — event time, not broker-arrival time.
- `pingKafka()` — connects an ADMIN client and verifies the topic actually EXISTS
  (`fetchTopicMetadata`), not just that the broker answers TCP. "Broker up but topic
  missing" is a real failure mode this catches.

## Layer 4 — rateLimit.ts + session.ts: the two Lua scripts

Rate limiter (fixed window):
```lua
local count = redis.call("INCR", KEYS[1])
if count == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
return { count, redis.call("TTL", KEYS[1]) }
```
- INCR+EXPIRE must be atomic: two separate round-trips would race (both requests see
  count==1) or crash between calls leaving a counter with NO expiry (stuck limited
  forever). Lua = one atomic server-side unit.
- JS side throws `RateLimitError` with `retryAfterSeconds = max(TTL, 1)`; API maps it
  to HTTP 429 + `retry-after` header.
- Keys: `loom:rate:runs:<clientIP>` and `loom:rate:model:<role>:<modelId>`.
- Tradeoff: fixed window allows a 2x burst across a window boundary; sliding
  window/token bucket fix that at higher cost.

Event persistence (session.ts PERSIST_EVENT):
```lua
local current = tonumber(redis.call("HGET", KEYS[1], "eventCount") or "0")
if current >= sequence then return 0 end          -- idempotency guard
for i = 6, #ARGV, 2 do redis.call("HSET", KEYS[1], ARGV[i], ARGV[i+1]) end
redis.call("EXPIRE", KEYS[1], ARGV[2])
redis.call("XADD", KEYS[2], "MAXLEN", "~", ARGV[3], ARGV[4], "envelope", ARGV[5])
redis.call("EXPIRE", KEYS[2], ARGV[2])
return 1
```
- Two keys, one atomic script: hash `loom:run:<runId>` (current-state projection)
  and stream `loom:run:<runId>:events` (append-only history). Lightweight CQRS:
  one write path, two read shapes.
- Idempotency twice over: the sequence guard (replayed event = no-op) AND the
  deterministic stream ID `<sequence>-0` (XADD rejects duplicate/lower IDs at the
  data-structure level).
- `MAXLEN ~ 10000` — stream trimmed approximately (~ is cheaper than exact).
- JS side promotes event fields into hash fields: run.start -> goal/startedAt;
  run.done -> status=completed/final; top-level error -> lastError.
- `finishRunSession` uses MULTI/EXEC (transaction) — lighter than Lua when you just
  need commands batched without conditional logic.
- TTL 86400s (1 day) on both keys — runs auto-expire; Redis is not unbounded storage.

## Layer 5 — models.ts + run.ts: the AI execution layer

- ONE provider key (`OPENROUTER_API_KEY`) unlocks MANY models. Key = authentication;
  `chainFor(role)` = model selection. A working key never guarantees a specific model
  succeeds.
- `hasPaidAccess()` — one probe of openrouter.ai/api/v1/key per process, cached in a
  module promise. Paid key => Claude heads the chain for planner/validator/
  synthesizer. WORKERS ALWAYS STAY FREE (cost control: workers are many + parallel).
- run.ts executors (`runText` streaming text, `runObject` streaming structured,
  `genObject` non-streaming structured) all share the same skeleton:
  chain -> for each model: rate-limit gate -> attempt with
  `AbortSignal.timeout(40s)` + `maxRetries: 0` -> success returns, failure falls
  through to next model -> chain exhausted throws `AllModelsFailed`.
- `maxRetries: 0` because retry policy lives in the CHAIN (try a different model),
  not in the SDK (retry the same model).
- KNOWN ISSUE (found Session 9): `shouldFallback(e)` in runText does not actually
  gate anything — `if (!shouldFallback(e)) continue;` has no else-throw, so EVERY
  error walks the whole chain; runObject/genObject never call it at all. A
  non-retryable bug (e.g. bad schema) wastes attempts on 4 models before failing.

## Layer 6 — the agents

planner.ts:
- `planSchema` (Zod): 2-4 tasks, each `{id, type: researcher|analyst|writer|coder,
  title, brief, dependsOn}` + synthesisBrief. `.describe()` strings are sent to the
  model as field-level instructions.
- System prompt is the CONTROL POLICY: small DAG, STRONGLY maximize parallelism,
  dependencies only when genuinely needed.
- On total planner failure: `fallbackPlan(goal)` — generic 2-task parallel
  research+analysis plan. Run degrades, never dies at planning.

worker.ts:
- `SYSTEM: Record<SwarmTask["type"], string>` — Record forces a prompt for EVERY
  worker type; add a new type and TS errors until you write its prompt.
- Blackboard injection: upstream outputs are pasted into the prompt under
  "## Upstream results you must build on".
- `feedback` param non-empty = validator-rejected revision; feedback appended under
  "## Validator feedback to fix on this revision".
- First streamed delta flips status thinking->streaming (exact moment UI shows the
  agent "typing"); every delta becomes an `agent.token` event.

validator.ts:
- Zod verdict `{score 0-10, approved boolean, feedback}`.
- CODE-LEVEL GUARDRAIL: `approved: object.approved && object.score >= 7` — the model
  cannot pass work with an inconsistent "approved but score 4" verdict.
- If ALL validator models fail: auto-approve with score 7 + note. Tradeoff: prefer
  completing the run over blocking on an unavailable judge. Production improvement:
  mark output "unvalidated" instead.

orchestrator.ts (runSwarm):
- `completed` map = shared blackboard; `remaining` map = worklist.
- `ready()` = tasks whose EVERY dependsOn id is in completed — topological scheduling.
- Wave loop: `Promise.all` over all currently-ready tasks (parallelism); empty wave
  with tasks remaining = cycle/missing dep -> error event + break.
- Per task: spawn event -> pull deps off blackboard (type guard `(d): d is Done`) ->
  worker -> validator loop (MAX_RETRIES=1 revision with feedback) -> task.done +
  blackboard write. Worker THROW -> status failed + error event + blackboard gets
  "(this subtask failed)" so dependents still proceed (degraded-completion policy).
- Synthesis: full corpus of all outputs -> runText("synthesizer") -> final answer
  streams token-by-token; on failure final = raw corpus (fallback).
- `estTokens = length/4` — demo-grade stats; production should use provider-reported
  usage.
- Ends with `run.done {final, tokensIn, tokensOut, ms}` + `bus.close("completed")`.

## Layer 7 — bus.ts: EventBus, the hub

TWO independent jobs in one class:

Job 1 — live handoff (emit <-> async iterator):
- `queue` = events produced but not yet read; `waiters` = readers waiting with
  nothing to read.
- emit(): waiter waiting? resolve it NOW : push to queue.
- next(): queue non-empty? shift it NOW : park a promise in waiters.
- Whichever side arrives first leaves something for the other. Zero polling. This is
  a hand-built async channel (Go channel / asyncio.Queue equivalent) in ~30 lines.

Job 2 — ordered durable delivery (the promise-chain mutex):
- Every emit wraps the event in an ENVELOPE: `{version: 1, id: runId:seq, runId,
  sequence: ++this.sequence, occurredAt, event}`.
- `this.delivery = this.delivery.catch(() => undefined).then(() => this.deliver(envelope))`
  — each emit APPENDS to one ever-growing promise chain, so deliver() calls execute
  strictly one-at-a-time in emission order even when parallel workers emit in the
  same tick. emit() itself is synchronous and never blocks on I/O.
- `.catch(() => undefined)` keeps the chain alive after a failure — without it, one
  rejected link would silently stop ALL future persistence (.then on a rejected
  promise never runs).
- deliver(): `await persistRunEvent` (Redis FIRST — canonical recoverable record)
  then `await publishSwarmEvent` (Kafka). Kafka fail after Redis success = event not
  lost, replayable. Redis fail = Kafka never attempted; `deliveryFailure ??= error`
  keeps only the FIRST failure.
- close(status): sets closing (late emits dropped), then finish(): `await
  this.delivery` (EVERY write from the whole run), then finishRunSession, then wake
  all parked waiters — resolve done:true normally, REJECT with terminalError on
  durable-delivery failure, which the route's catch turns into a visible SSE error
  frame. Guarantee: browser can never see run.done whose data isn't already in Redis.

## Layer 8 — /api/swarm route.ts: the gatekeeper + the stream

Five gates, cheapest first:
```text
1. parse JSON (bad JSON -> goal "")     -> 400 invalid goal
2. goal string >= 4 chars               -> 400
3. OPENROUTER_API_KEY present (server)  -> 500
4. assertInfrastructureReady()          -> 503 + retry-after: 5 + per-dep detail
5. enforceRateLimit(runs:<clientIP>)    -> 429 + retry-after: TTL
```
Order matters: infra before rate limit (if Redis is down, the rate limiter would
throw a MORE CONFUSING error). Client identity: first hop of x-forwarded-for.

Then the core move:
- `runSwarm(goal, bus)` is called WITHOUT await — fire-and-forget. Awaiting would
  hold the response until the entire swarm finished, killing live streaming. The
  attached `.catch` converts any orchestrator crash into an error event +
  close("failed"); without it: unhandled rejection + an SSE stream that hangs
  forever.
- `new ReadableStream({ start(controller) { for await (const event of bus) {
  controller.enqueue(encoder.encode("data: " + JSON.stringify(event) + "\n\n")) } } })`
  — the consumer side of the EventBus, framing each event as SSE. TextEncoder:
  streams carry bytes, not strings. `\n\n` = SSE frame terminator.
- Response headers: `text/event-stream` (SSE contract), `cache-control:
  no-cache, no-transform` (no buffering/compression by proxies),
  `x-loom-run-id` (client learns the runId for replay).
- `maxDuration = 300` — platform allows up to 300s of function runtime;
  `runtime = "nodejs"` — full Node (KafkaJS/ioredis need TCP, not edge).

## Layer 9 — /api/swarm/[runId]/route.ts: replay

- Validates runId shape (`^[0-9a-f-]{36}$`) BEFORE touching Redis — never let
  unvalidated input become part of a Redis key.
- `getRunSession` (HGETALL projection) -> 404 if missing/expired.
- `getRunEvents` (XRANGE - + COUNT 1000) -> full ordered envelope history.
- Redis down -> 503 + retry-after. Use case: page reload / second tab / post-hoc
  inspection of a finished run — the SSE stream is gone, Redis still has the story.

## Layer 10 — the browser side (useRunSwarm.ts + store.ts)

useRunSwarm:
- AbortController: clicking Swarm during a run aborts the previous fetch first —
  otherwise two streams would write into one store (interleaved chaos).
- Reads `res.body.getReader()`, TextDecoder with `{stream: true}` (a UTF-8 char can
  split across chunks), accumulates `buffer`, splits on `\n\n`, keeps the last
  (possibly incomplete) piece IN the buffer, parses each `data:` line, `apply()`s it.

store.ts (Zustand):
- `apply(event)` is a reducer: one switch over `event.kind`, each case returns a
  PARTIAL state update. Discriminated union = each case knows its exact fields.
- reset(): seeds static Planner + Validator nodes (they always exist in the graph).
- agent.spawn: creates node; edges — no deps -> planner "assign" edge; deps ->
  "depends" edges from each upstream agent. `ensureEdge` dedups by id
  `source->target`.
- agent.token: `output: a.output + e.delta` — string append per token; this is the
  live-typing effect.
- validate.result -> score/feedback onto the node. message events only draw
  validator edges (review/revise).
- run.done: builds a SavedRun and `saveRun()`s it (local history — RecentRuns.tsx
  reads these), sets runStatus done + final + stats.
- error: runStatus "error" + message (the red banner).

## Master flowchart (end to end)

```text
Click "Swarm" (GoalBar)
  -> useRunSwarm: abort old run, reset(goal), fetch POST /api/swarm
    -> GATES: parse -> validate(400) -> key(500) -> infra ready(503) -> rate limit(429)
    -> runId = randomUUID(); bus = new EventBus(runId)
    -> runSwarm(goal, bus)          [fire-and-forget, .catch -> error event + close]
    -> return Response(ReadableStream reading bus)   [immediately; SSE headers]

runSwarm (background, same process):
  emit run.start
  plan(): plan.start -> genObject(planner, Zod) -> plan.token -> plan.done
          [total failure -> fallbackPlan]
  wave loop while tasks remain:
    ready() = deps all completed; empty+remaining = cycle -> error
    Promise.all(wave):
      agent.spawn -> blackboard deps -> message edges
      runWorker: status thinking -> runText(worker chain) -> first delta: status
                 streaming -> agent.token per delta
      validate:  status validating -> genObject(validator) -> validate.result
                 rejected + attempt left -> message revise -> rerun worker w/feedback
      task.done -> blackboard write
      THROW -> status failed -> error event -> blackboard "(this subtask failed)"
  synthesis: agent.spawn synthesizer -> corpus of all outputs -> runText -> agent.token
             per delta -> run.done {final, stats}    [failure -> final = raw corpus]
  bus.close("completed")

EVERY emit, in parallel with the above:
  envelope {v1, runId:seq, sequence, occurredAt}
  -> delivery chain (strictly ordered): Redis Lua persist (hash+stream, idempotent)
     -> Kafka producer.send (key=runId, acks=-1, headers)
  -> live path: resolve waiting SSE reader OR buffer in queue
  -> route: "data: {...}\n\n" -> HTTP response chunk

close(): await ENTIRE delivery chain -> finishRunSession -> wake readers
         (reject on durable failure -> visible SSE error frame) -> stream ends

Browser: read chunk -> decode -> split \n\n -> JSON.parse -> apply(event)
         -> Zustand set -> React re-render (SwarmGraph nodes/edges, SidePanel,
         token-by-token typing) ; run.done -> saveRun -> RecentRuns
Replay anytime: GET /api/swarm/<runId> -> Redis projection + full event history
```

## Failure-mode table (what the user actually sees)

```text
Failure                        | Where caught              | User sees
-------------------------------+---------------------------+---------------------------
Bad/short goal                 | route gate 2              | 400 error banner
Missing OpenRouter key         | route gate 3              | 500 error banner
Kafka or Redis down at start   | route gate 4 (readiness)  | 503 "infrastructure
                               |                           | unavailable" + which dep
Too many runs per IP           | route gate 5 (Lua INCR)   | 429 + retry-after seconds
Planner: every model fails     | plan() catch              | run continues w/ generic
                               |                           | fallback plan
One worker model fails         | run.ts chain              | next model tried silently
Worker: every model fails      | orchestrator catch        | node "failed", run continues,
                               |                           | "(this subtask failed)" in final
Validator: every model fails   | validate() catch          | auto-approved, score 7 note
Synthesizer: every model fails | synthesis catch           | final = raw worker outputs
Redis dies mid-run             | deliver() -> close()      | run finishes streaming, then
                               |                           | terminal SSE error (durable
                               |                           | delivery failed)
Kafka dies mid-run             | deliver() (after Redis ok)| same terminal error; events
                               |                           | safe in Redis, replayable
orchestrator itself throws     | route .catch on promise   | error event + close("failed")
Impossible DAG (cycle)         | wave loop guard           | "unsatisfiable dependency
                               |                           | cycle" error event
Reload after run               | [runId] replay route      | session + full event history
                               |                           | from Redis (404 after TTL)
```

## Interview answers (master set)

> Architecture in two sentences: Loom is a Next.js agent-swarm orchestrator where a
> planner LLM emits a Zod-validated DAG, workers execute it in parallel waves over a
> shared blackboard with a validator gate and one feedback revision, and a
> synthesizer fuses outputs. Every lifecycle event flows through a hand-built async
> EventBus that simultaneously feeds a live SSE stream to the browser and an ordered,
> idempotent durability pipeline: Redis first (atomic Lua projection + capped stream,
> the canonical record), then Kafka (runId-keyed, acks=-1, idempotent producer) —
> with a fail-closed readiness gate so no tokens are spent when infrastructure is down.

> Why not await runSwarm: the route returns the SSE stream immediately and the
> orchestrator keeps emitting in the background of the same invocation; awaiting
> would buffer the whole run. The un-awaited promise carries a .catch that converts
> crashes into a visible error event + failed close — otherwise the stream would
> hang and Node would report an unhandled rejection.

> Ordering under concurrency: parallel workers emit into one reassigned promise
> chain (this.delivery), so durable writes execute strictly in emission order
> without blocking emitters; per-run Kafka ordering additionally comes from keying
> every message by runId so all of a run's events land on one partition.

> Idempotency, three layers: Redis Lua sequence guard (replay = no-op), deterministic
> stream IDs (XADD rejects duplicates), idempotent Kafka producer (broker dedups
> retries).

> Degradation policy: model failures degrade (fallback chains, fallback plan,
> auto-approve, raw-corpus synthesis, "(subtask failed)" placeholders) but
> infrastructure failures fail CLOSED (503 before start, terminal SSE error mid-run).
> Compute is best-effort; the record of what happened is not.

---

# THE CANDIDATE HANDBOOK — Loom Tech Stack (Session 12)

Read this top to bottom and you can explain the whole project, every technology in
it, and survive a senior interviewer drilling into any layer.

## 1. Stack at a glance — what we use each tech for

```text
Layer            | Tech                          | What Loom uses it for
-----------------+-------------------------------+------------------------------------------
Framework        | Next.js (App Router)          | One deployable: React UI + API route
                 |                               | handlers; server-only secrets; SSE
                 |                               | streaming responses from route handlers
Language         | TypeScript                    | Compile-time contracts: discriminated
                 |                               | union events, Exclude<> business rules,
                 |                               | Record<> exhaustiveness, type guards
UI state         | React + Zustand               | apply(event) reducer turns the SSE event
                 |                               | stream into live graph state
Graph UI         | React Flow (@xyflow)          | Renders agents as nodes, deps as edges
AI runtime       | Vercel AI SDK                 | streamText / streamObject /
                 |                               | generateObject with abort timeouts
AI provider      | OpenRouter                    | ONE key, MANY models; per-role fallback
                 |                               | chains; paid-tier probe
AI contracts     | Zod                           | Runtime schemas for planner plan and
                 |                               | validator verdict (structured outputs)
In-process events| Hand-built EventBus           | AsyncIterable queue: many producers
                 |                               | (parallel agents) -> one consumer (SSE)
Live transport   | SSE over Web Streams          | data: {...}\n\n frames on a
                 |                               | ReadableStream; browser parses live
Shared state     | Redis 8 (ioredis)             | Lua fixed-window rate limits, run
                 |                               | projection hash, append-only event
                 |                               | stream for replay (canonical record)
Event streaming  | Apache Kafka 4 (KafkaJS)      | Durable distributed event log; runId
                 |                               | key = per-run ordering; acks=-1
Infra (local)    | Docker + Compose              | Multi-stage image, non-root, KRaft
                 |                               | Kafka, Redis AOF, health-gated startup
```

## 2. The full end-to-end flow

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ BROWSER (client component)                                              │
│  GoalBar.tsx → user clicks "Swarm"                                      │
│  → useRunSwarm.ts: abort any previous run, reset() store, new AbortCtrl │
│  → fetch("/api/swarm", { method: POST, body: {goal}, signal })          │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │  HTTP POST, JSON body
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ SERVER — src/app/api/swarm/route.ts :: POST(req)                        │
│  1. Parse JSON body → { goal }. Bad JSON → goal = "" (defensive)        │
│  2. Validate: goal is a string, length >= 4        ──fail──▶ HTTP 400   │
│  3. Check OPENROUTER_API_KEY exists on server       ──fail──▶ HTTP 500  │
│  4. assertInfrastructureReady()                     ──fail──▶ HTTP 503  │
│       └─ pings Kafka admin + Redis PING concurrently, 5s cache          │
│  5. enforceRateLimit() — Redis Lua INCR+EXPIRE       ──fail──▶ HTTP 429 │
│  6. runId = crypto.randomUUID()                                         │
│  7. bus = new EventBus(runId)                                           │
│  8. runSwarm(goal, bus)  ◄── FIRE-AND-FORGET, NOT awaited               │
│  9. stream = new ReadableStream({ start(controller) {                   │
│        for await (const event of bus)                                   │
│          controller.enqueue(`data: ${JSON.stringify(event)}\n\n`) }})   │
│ 10. return new Response(stream, { content-type: text/event-stream })    │
│     ── RETURNS IMMEDIATELY, before runSwarm finishes ──                 │
└───────────┬───────────────────────────────────────────┬─────────────────┘
            │ (background, same process)                 │ (HTTP response streams out)
            ▼                                             │
┌───────────────────────────────────────┐                 │
│ runSwarm(goal, bus) — orchestrator.ts  │                 │
│  emit run.start ──────────────────────────────┐         │
│  plan(): plan.start → genObject(planner,      │         │
│    Zod planSchema) → plan.token → plan.done ──┤         │
│    [all models fail → fallbackPlan]           │  every  │
│  DAG WAVE LOOP while tasks remain:            │  emit() │
│    ready() = deps all in completed            │  goes   │
│    (empty wave + remaining = cycle → error)   │  into   │
│    Promise.all(wave):                         │  the    │
│      emit agent.spawn ────────────────────────┤  SAME   │
│      runWorker: thinking → runText(chain) →   │EventBus │
│        1st delta: streaming → agent.token ×N ─┤instance │
│      validate: genObject verdict →            │         │
│        validate.result ───────────────────────┤         │
│        rejected+retry left → revise w/feedback│         │
│      task.done → blackboard write ────────────┤         │
│      THROW → failed + "(subtask failed)" ─────┤         │
│  SYNTHESIS: full corpus → runText →           │         │
│    agent.token ×N → run.done {final,stats} ───┤         │
│  bus.close("completed")                       │         │
│    └─ waits for ALL Redis/Kafka writes,       │         │
│       THEN wakes/ends the SSE reader loop     │         │
└─────────────────────────────────────────┘     │         │
                                                 ▼         ▼
                                   ┌──────────────────────────┐
                                   │ Inside EventBus per emit: │
                                   │  envelope {v1, runId:seq, │
                                   │   sequence, occurredAt}   │
                                   │  → delivery promise chain │
                                   │    (strict order):        │
                                   │    1. persistRunEvent     │
                                   │       Redis Lua: hash +   │
                                   │       stream, idempotent  │
                                   │    2. publishSwarmEvent   │
                                   │       Kafka key=runId,    │
                                   │       acks=-1             │
                                   │  → live path: resolve     │
                                   │    waiting reader OR queue│
                                   └──────────────────────────┘
                                                 │
                                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ BROWSER — useRunSwarm.ts reads the response body                        │
│  reader = res.body.getReader()                                          │
│  loop: read() → TextDecoder(stream:true) → buffer → split "\n\n"        │
│        → keep last partial in buffer → parse "data: " → JSON.parse      │
│  apply(event) → Zustand reducer → React re-renders SwarmGraph/SidePanel │
│  run.done → saveRun() → RecentRuns history                              │
│  Anytime later: GET /api/swarm/<runId> replays session+events from Redis│
└─────────────────────────────────────────────────────────────────────────┘
```

Numbered narrative (memorize this as your walkthrough):
1. Click → `useRunSwarm` aborts any previous run (AbortController), resets the
   store, POSTs the goal.
2. Route runs five gates cheapest-first: parse → length → server key → infra
   readiness → rate limit. Nothing costs an AI token until all five pass.
3. `runId = randomUUID()`; one `EventBus` per run.
4. `runSwarm` starts WITHOUT await — the response (an SSE `ReadableStream`) returns
   immediately; orchestrator keeps emitting in the background of the invocation.
5. Planner produces a Zod-validated DAG (2–4 tasks) or a generic fallback plan.
6. Wave loop: all tasks whose dependencies are complete run concurrently
   (`Promise.all`); blackboard (`completed` map) feeds upstream outputs into
   downstream prompts.
7. Each worker streams tokens (every delta = one SSE frame), then faces the
   validator: approved needs model-approved AND score ≥ 7; one feedback revision.
8. Worker total failure → node marked failed, `"(this subtask failed)"` placed on
   the blackboard so dependents proceed (degraded completion).
9. Synthesizer fuses the full corpus into the final answer, streaming live.
10. EVERY emit also flows down the durability chain: Redis first (atomic Lua:
    projection hash + capped stream, idempotent), then Kafka (runId-keyed,
    acks=-1). One promise chain serializes writes in emission order.
11. `close()` waits for the entire delivery chain before ending the SSE stream — the
    browser can never see `run.done` that isn't already durable. Durable failure →
    terminal SSE error frame.
12. Browser parses frames, `apply()` reduces each event into graph state; reload or
    share → `GET /api/swarm/[runId]` replays everything from Redis.

## 3. Important routes reference

```text
Method | Path                  | Purpose             | Success            | Failures
-------+-----------------------+---------------------+--------------------+--------------------------
POST   | /api/swarm            | start run, stream   | 200 SSE stream +   | 400 bad goal, 500 no key,
       |                       | events live         | x-loom-run-id    | 503 infra, 429 rate+retry-after
GET    | /api/swarm/[runId]    | replay a run from   | 200 {session,      | 400 bad uuid, 404 expired/
       |                       | Redis               | events[]}          | unknown, 503 Redis down
GET    | /api/health           | readiness probe     | 200 ready +        | 503 not_ready + which dep,
       |                       | (force, uncached)   | per-dep latencyMs  | cache-control: no-store
```
Route-handler facts interviewers probe: `runtime = "nodejs"` (KafkaJS/ioredis need
raw TCP — Edge runtime is fetch-only), `maxDuration = 300` (long-lived SSE budget),
`dynamic = "force-dynamic"` on health (never pre-render/cache a readiness answer),
dynamic params are async in Next 15 (`context.params` is a Promise — must await).

## 4. Redis — everything a candidate must know here

Data structures Loom actually uses:
```text
Structure | Key                          | Used for
----------+------------------------------+----------------------------------
string    | loom:rate:runs:<ip>        | fixed-window run counter (INCR)
string    | loom:rate:model:<role>:<m> | fixed-window model-call counter
hash      | loom:run:<runId>           | run projection (status/goal/final)
stream    | loom:run:<runId>:events    | append-only envelope history
```

Why Lua is atomic: Redis executes commands on a SINGLE thread; an EVAL script runs
as one uninterruptible command — no other client's command can interleave. That's
the whole atomicity story (no locks involved).

Rate-limiting algorithms — know all five, know which we picked and why:
```text
Algorithm              | How it works                       | Cost      | Weakness
-----------------------+------------------------------------+-----------+------------------
Fixed window  (USED)   | INCR counter, EXPIRE at window     | O(1), 1   | 2x burst across
                       | start; reject when count > limit   | key       | window boundary
Sliding window log     | ZADD timestamp per request,        | O(log n)  | memory per request
                       | ZREMRANGEBYSCORE old, ZCARD count  | + big keys|
Sliding window counter | weighted blend of current+previous | O(1)      | approximation
                       | fixed windows                      |           |
Token bucket           | refill tokens at rate r up to      | O(1), Lua | needs timestamp
                       | burst b; take 1 per request        |           | math per call
Leaky bucket           | queue drains at constant rate      | O(1)      | adds latency,
                       |                                    |           | queue to manage
```
Loom uses fixed window: simplest correct distributed limiter, one key, one Lua
round trip. Known tradeoff: boundary burst (limit at 23:59:59 + limit at 00:00:01).
Upgrade path when abuse matters: token bucket in Lua.

Other Redis facts to be fluent in:
- TTL discipline: every Loom key expires (window TTL or 86400s run TTL) — Redis
  is not unbounded storage; at maxmemory Redis evicts per policy or rejects writes.
- Persistence: RDB = periodic snapshots (fast, can lose last minutes); AOF =
  append-only command log (our Compose uses appendfsync everysec — lose ≤1s).
- Redis Streams vs Kafka: Streams are great for one-app replay buffers (that's our
  use); Kafka wins for multi-consumer-group fan-out, huge retention, partitioned
  horizontal scale, ecosystem (Connect, ksqlDB).
- MULTI/EXEC vs Lua: MULTI batches commands atomically but cannot branch on a read;
  Lua can (our sequence guard needs the read-then-decide, so it must be Lua).

## 5. Kafka — everything a candidate must know here

Core vocabulary: broker (server), topic (named log), partition (ordered shard of a
topic), offset (position in a partition), producer/consumer, consumer group (set of
consumers sharing partitions — each partition is read by exactly ONE member),
ISR (in-sync replicas), retention (time/size the log is kept), lag (how far a
consumer is behind the head).

Loom's exact choices and the why:
- `key: runId` → Kafka hashes the key to pick a partition → ALL events of one run
  land on one partition → strict per-run ordering. Scope matters: ordering is per
  PARTITION, never per topic.
- 6 partitions → up to 6 consumers in one group can process runs in parallel.
- `acks: -1` → producer waits for all in-sync replicas; safest, slowest. With local
  replication-factor 1 it's just the leader; production wants RF=3 + min.insync.replicas=2.
- `idempotent: true` → broker deduplicates producer retries (sequence numbers per
  producer/partition) → no duplicates from network retries = at-least-once upgraded
  to effectively-once FOR THE PRODUCER SIDE.
- `allowAutoTopicCreation: false` → an auto-created topic would get default
  partitions/retention; topics are provisioned by infra (compose kafka-init:
  6 partitions, retention.ms=604800000 = 7 days).
- `pingKafka` uses an ADMIN client and checks the topic EXISTS — "broker reachable"
  is not "topic usable".
- Headers (eventKind/eventVersion/eventId) let consumers filter without parsing
  values; version field = schema evolution story.
- KRaft = Kafka's built-in Raft consensus (no ZooKeeper since Kafka 4).
- Known gap (say it before they ask): Redis write and Kafka publish are two systems
  with no shared transaction. We order Redis-first so the canonical record never
  lags, and fail visibly on Kafka error. The textbook fix is a TRANSACTIONAL
  OUTBOX: write the event into the same store as state, a relay publishes to Kafka
  with retries, guaranteeing no gaps.

## 6. Senior interview Q&A per tech

Next.js / API design:
- Q: Why Node runtime, not Edge? A: KafkaJS and ioredis speak raw TCP; Edge runtime
  exposes only fetch/web APIs. Also long-lived SSE + heavier CPU fits Node.
- Q: Why SSE and not WebSockets? A: The flow is strictly server→client, one
  direction. SSE rides plain HTTP (no upgrade), works through proxies/CDNs,
  auto-frames with data:...\n\n, and needs zero extra infra. WebSockets buy
  bidirectionality we don't need at the cost of connection-state management.
- Q: How do you keep the API key safe? A: It only exists in server env; the only
  code touching it is a route handler; the browser gets events, never credentials.
- Q: What limits streaming on serverless? A: Function wall-clock (maxDuration 300s),
  and the platform must support streamed responses; buffering proxies must be told
  no-transform.

TypeScript:
- Q: How do you make invalid states unrepresentable? A: String-literal unions for
  statuses, Exclude<> so a task can never be typed as planner/validator/synthesizer,
  Record<AgentType,...> so a missing agent config is a compile error, discriminated
  union events so each kind has exactly its fields.
- Q: TS vs Zod — why both? A: TS types vanish at runtime; LLM output arrives at
  runtime. Zod validates the actual data and INFERS the static type from the same
  schema — one source of truth for both worlds.

AI SDK / OpenRouter / Zod:
- Q: What happens when a model returns malformed JSON for a schema? A: generateObject
  throws, the executor catches, the chain falls through to the next model; if all
  fail, AllModelsFailed propagates to the role's degradation policy.
- Q: How do you control cost? A: Workers (many, parallel) are pinned to free models
  even on a paid key; Claude only heads planner/validator/synthesizer chains
  (run once or twice per swarm). Per-model rate limits cap spend; 40s abort per
  attempt stops runaway calls.
- Q: How do you trust a model's self-reported verdict? A: We don't — code enforces
  approved && score >= 7 so an inconsistent verdict can't pass work.

SSE / Streams:
- Q: Walk me through frame parsing client-side. A: Bytes → TextDecoder(stream:true)
  because a UTF-8 char can split across chunks → append to buffer → split on \n\n →
  the LAST piece may be incomplete so it stays in the buffer → each complete chunk's
  data: payload is JSON.parsed.
- Q: Client disconnects mid-run — what happens? A: The response stream is cancelled;
  the orchestrator keeps running server-side and every event still lands in
  Redis/Kafka; the client replays via GET /api/swarm/[runId].

EventBus / concurrency:
- Q: How do you serialize concurrent async writes without a mutex library? A:
  Reassign one promise chain: delivery = delivery.catch(noop).then(next). Appending
  is synchronous, execution is strictly ordered, emitters never block on I/O.
- Q: Why .catch in the middle of the chain? A: A rejected link would make every
  subsequent .then dead — one failure would silently stop ALL future persistence.
- Q: Backpressure? A: The in-memory queue is unbounded; a slow reader grows it. Fine
  for one browser per run; a production multi-consumer story belongs in Kafka, which
  has real backpressure via consumer pull.

Redis:
- Q: Why is your rate limiter a Lua script? A: INCR and EXPIRE must be atomic; two
  round trips race (double-EXPIRE or a crash strands a counter with no TTL —
  permanent rate-limit). Single-threaded Redis executes the script as one command.
- Q: Fixed-window weakness? A: 2x burst at the boundary; fix = token bucket/sliding
  window at higher cost.
- Q: How is replay idempotent? A: Lua sequence guard (replay = no-op) + deterministic
  stream ID sequence-0 (XADD rejects duplicate/lower IDs).

Kafka:
- Q: What ordering does Kafka give you? A: Per partition. We key by runId so a run's
  events share a partition; cross-run ordering doesn't exist and doesn't matter.
- Q: Delivery semantics? A: Producer side: acks=-1 + idempotence = no loss, no dupes
  from retries. End-to-end exactly-once needs transactions/outbox + idempotent
  consumers — we state that honestly as the roadmap.
- Q: What is consumer lag and why watch it? A: head offset minus committed offset;
  growing lag = consumers can't keep up = staleness/backpressure alarm.

Architecture / system design:
- Q: Two-minute pitch — see "Interview answers (master set)" above.
- Q: Scale this 100x? A: Move orchestration out of the request into a worker/queue
  (BullMQ/Temporal), SSE from a read path fed by Redis/Kafka instead of in-process
  bus, managed RF=3 Kafka, Redis cluster, outbox relay, per-user auth + quotas,
  observability (lag, p95, token spend).
- Q: Biggest honest weakness? A: Redis→Kafka has no shared transaction (outbox is
  the fix), orchestration dies with the serverless invocation (job queue is the
  fix), estTokens is length/4 (use provider usage), retry chain treats
  non-retryable errors as retryable (shouldFallback gap).

## 7. Rapid-fire glossary

```text
SSE            server-sent events: one-way HTTP stream, data:...\n\n frames
ReadableStream web API producing chunks for a streaming HTTP body
AsyncIterable  object usable with for await...of (has Symbol.asyncIterator)
envelope       event wrapper adding version/id/runId/sequence/occurredAt
blackboard     shared map of completed task outputs consumed by dependents
DAG            directed acyclic graph — tasks + dependsOn edges
wave           set of tasks whose dependencies are all complete, run concurrently
fail closed    refuse work when a required dependency is down
readiness      "can I serve NOW?" — deps checked, vs liveness "am I running?"
projection     current-state summary derived from an event history
idempotent     safe to apply twice; second application is a no-op
fixed window   rate limit algorithm: counter per time bucket
partition      ordered shard of a Kafka topic; unit of parallelism + ordering
consumer group consumers sharing a topic; each partition -> one member
offset / lag   position in a partition / how far behind a consumer is
acks=-1        producer waits for all in-sync replicas
KRaft          Kafka's ZooKeeper-free Raft consensus mode
AOF            Redis append-only-file persistence (fsync every second here)
outbox         pattern: stage events in the state store, relay to the log
multi-stage    Dockerfile with several FROMs; final image ships runtime only
```

---

# Placement handbook canonical pointer and accuracy corrections (2026-07-16)

The canonical, code-verified placement guide is `Loom_Placement_Handbook.md` and its rendered PDF. It supersedes conflicting statements in older learning notes. Keep the earlier sections as session history, but use these corrections in interviews:

1. **Live before durable:** `EventBus.emit()` sends the plain event to its local SSE queue immediately and schedules Redis→Kafka separately. The browser can see `run.done` before its remote delivery finishes. `close()` waits for the delivery chain before ending the stream; it does not make every visible event durable first.
2. **Replay is not wired into the UI:** `GET /api/swarm/[runId]` exists, but `useRunSwarm` does not call it on reload/reconnect. The route returns at most 1,000 events by default, not necessarily the full retained stream.
3. **Client abort is not job cancellation:** aborting the fetch stops the browser request/reader. Its signal is not propagated into the backend EventBus or model calls, so orchestration can continue.
4. **Kafka is producer-only here:** the repository publishes events and performs topic readiness checks. There is no Kafka consumer, consumer group implementation, lag metric, or Kafka-fed SSE path.
5. **No end-to-end exactly once:** `acks=-1` plus Kafka producer idempotence narrows broker retry risk. Redis and Kafka do not share a transaction, and no idempotent consumer side effect is implemented.
6. **Kafka event failure can leave a gap:** Redis is written first. If Kafka event 7 fails, later Kafka events are still attempted; Redis may contain the complete sequence while Kafka has 1–6 and 8 onward. The terminal stream reports durable-delivery failure.
7. **Validator is availability-biased:** total validator-model failure returns auto-approved score 7. After one rejected revision, the orchestrator exits the retry loop even if the second verdict is rejected.
8. **Planner degradation:** planner-model failure is caught inside `plan()` and replaced with a generic two-task plan.
9. **Retry classifier bug:** in `runText`, both outcomes of the `shouldFallback` check continue to the next model. Non-retryable failures are currently retried too.
10. **Local infrastructure is not HA:** Kafka is one combined KRaft broker/controller with replication factor 1; Redis is one node. Both are required for new runs, but Compose is a development/CI topology.
11. **Current dependency names:** the UI package is `reactflow` 11, not `@xyflow/react`. AI SDK 6 still runs the current object APIs but documents `generateObject`/`streamObject` as deprecated.
12. **Testing boundary:** no automated test suite or test script currently exists. Do not claim full production verification.

Interview wording to memorise:

> Loom deeply uses Redis for distributed quotas and recoverable run state. It publishes every run event to Kafka with per-run partition ordering, but the repository currently demonstrates only the producer side. The next correctness step is a transactional outbox, idempotent consumer, durable worker, and replay/cancellation UI.

---

# API key, OpenRouter client, AI SDK, and Loom agent-call flow

This is the current working mental model for how Loom gets actual AI replies.

## 1. Full Loom request path

```text
1. User types goal in browser.

2. Browser sends:
   POST /api/swarm
   body: { goal: "..." }

3. Next.js route receives it.

4. Route checks:
   - Is goal valid?
   - Is OPENROUTER_API_KEY set?
   - Are Kafka and Redis ready?
   - Is user rate-limited?

5. Backend creates runId and EventBus.

6. Backend starts runSwarm(goal, bus).

7. Planner runs first:
   - chooses model chain
   - calls OpenRouter through AI SDK
   - receives structured plan
   - Zod validates the plan

8. Orchestrator reads the plan:
   - builds DAG
   - finds ready tasks
   - runs workers in waves

9. Worker runs:
   - calls model through AI SDK
   - receives text stream
   - each chunk emits UI event

10. Validator runs:
    - calls model through AI SDK
    - receives structured score/feedback
    - accepts or asks worker to revise once

11. Synthesizer runs:
    - calls model through AI SDK
    - combines all outputs into final answer

12. EventBus sends events to browser as SSE.

13. Browser updates React Flow graph live.
```

## 2. Key distinction

The planner, worker, validator, and synthesizer are not separate servers. They are code roles inside the backend.

They become "agents" because each role has:

- its own system prompt;
- its own job;
- its own selected model chain;
- its own input/output shape;
- orchestration rules around when it runs.

Role meanings:

```text
Planner:
  "Turn goal into task graph."

Worker:
  "Solve one assigned task."

Validator:
  "Judge worker output."

Synthesizer:
  "Combine everything into final answer."
```

## 3. Why they call the AI model

Their intelligence comes from the LLM.

```text
TypeScript = manager / traffic controller
AI model = brain doing language reasoning
Zod = strict checker
Redis/Kafka = production infrastructure
SSE = live UI pipe
```

The TypeScript code controls when each role runs, what context it receives, what output shape is expected, and what happens if it fails. The model provides the reasoning/text/structured decision.

## 4. How the backend creates the OpenRouter model client

Current source:

```ts
const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
export const model = (id: string) => openrouter(id);
```

Meaning:

```text
createOpenRouter({ apiKey })
  = create an OpenRouter provider client using the server-side API key.

model(id)
  = create a model reference for one exact OpenRouter model id.
```

Important: this does not call the AI yet. It prepares a model object that the AI SDK can use later.

## 5. API key vs model ID vs system prompt

```text
API key = permission
model ID = which brain to use
system prompt = what role/instructions that brain should follow
user prompt = the task/context to solve
AI SDK = helper library that sends the request and returns the result
```

The API key itself does not generate a reply. It only proves the backend is allowed to call OpenRouter. The actual reply comes from the selected model.

## 6. Dynamic model selection

The backend creates the OpenRouter provider once, but chooses model IDs dynamically:

```ts
chainFor(role)
```

Current role-level idea:

```text
planner      -> paid Claude first if available, then free structured models
validator    -> paid Claude first if available, then free structured models
worker       -> free chat models for cost control
synthesizer  -> paid/free chain depending config
```

This means a configured `OPENROUTER_API_KEY` proves provider access, not that a specific model such as Grok handled the request. This repository currently uses OpenRouter via `OPENROUTER_API_KEY`; it does not use a direct `GROK_API_KEY`/`XAI_API_KEY` integration unless that is added later.

## 7. What the AI SDK does

An SDK is a helper library. Without the SDK, the backend would manually call OpenRouter with `fetch`, headers, JSON body, streaming parsing, schema parsing, and error handling.

Conceptual raw request:

```http
POST https://openrouter.ai/api/v1/chat/completions
Authorization: Bearer OPENROUTER_API_KEY
Content-Type: application/json
```

Conceptual body:

```json
{
  "model": "anthropic/claude-sonnet-4.5",
  "messages": [
    { "role": "system", "content": "You are a planner..." },
    { "role": "user", "content": "Break this goal into tasks..." }
  ]
}
```

With the AI SDK, Loom writes higher-level calls instead:

```ts
streamText({ model: model(id), system, prompt });
streamObject({ model: model(id), schema, system, prompt });
generateObject({ model: model(id), schema, system, prompt });
```

## 8. Why different roles use different AI SDK calls

```text
planner:
  needs a machine-readable task graph
  -> uses structured object generation
  -> Zod validates the object

worker:
  needs human-readable text
  -> uses streaming text
  -> every delta can be shown live in the UI

validator:
  needs a machine-readable score/approval/feedback object
  -> uses structured object generation
  -> Zod validates the judgment

synthesizer:
  needs final human-readable answer
  -> uses streaming text
```

## 9. Interview-ready answer

Loom uses OpenRouter through the Vercel AI SDK. The backend creates an OpenRouter provider client using `OPENROUTER_API_KEY`, then wraps model selection with a `model(id)` helper. Each role asks `chainFor(role)` for an ordered model fallback chain. Planner and validator use structured object generation with Zod schemas because their outputs must be machine-readable. Workers and synthesizer use streaming text because their output is human-readable and should appear live in the UI. The AI SDK converts those calls into authenticated OpenRouter requests, streams or parses the response, and returns it to the orchestration layer.

## 10. Current checkpoint

Explain in your own words:

```text
What is the difference between:
1. API key
2. model ID
3. system prompt
4. user prompt
5. AI SDK
```

---

# What is left to learn in Loom

Current status: the foundation is mostly complete. The remaining work is not "what is Loom?" anymore. It is understanding the remaining project internals, production gaps, deployment, and interview delivery.

## Already covered enough to revise, not restart

```text
Swarm roles              planner / workers / validator / synthesizer
DAG execution            dependencies, waves, parallel tasks
Shared blackboard        upstream task outputs passed downstream
AI provider flow         OPENROUTER_API_KEY, OpenRouter, model IDs, AI SDK
Zod basics               runtime schemas for LLM structured output
SSE basics/deep dive     ReadableStream, data: ...\n\n, buffering, JSON.parse
Frontend event flow      useRunSwarm -> Zustand apply -> React Flow rerender
Redis basics             rate limits, Lua, session projection, stream replay route
Docker/Compose basics    local Kafka/Redis services and health checks
Testing basics           Vitest DAG tests and Redis integration tests
Reliability audit        fallback fix, cancellation propagation, Redis retry backoff
Interview framing        attack/counter/upgrade structure
```

## Main topics still left

### 1. HTTP/networking fundamentals through Loom

Need to master:

```text
HTTP method        GET vs POST
URL                /api/swarm vs /api/swarm/[runId] vs /api/health
headers            content-type, retry-after, x-loom-run-id
body               JSON request/response payload
status codes       200, 400, 429, 500, 503
normal response    one JSON response and close
stream response    long-lived SSE response
```

Why it matters: this explains how browser and backend communicate, and why `req.json()`, `Response`, `fetch`, and SSE exist.

Next concrete lesson: trace all three route handlers:

```text
POST /api/swarm          start a live run
GET /api/swarm/[runId]   fetch persisted run/events
GET /api/health          check Kafka/Redis readiness
```

### 2. Next.js App Router and server/client boundary

Need to master:

```text
src/app/page.tsx              page route
src/app/api/.../route.ts      API route handlers
"use client"                  browser-side React code
server component default      safe place for server-rendered UI
route handler                 backend code inside Next.js
environment variables         server-only secrets/config
```

Key interview point: browser code must never receive `OPENROUTER_API_KEY`, `REDIS_URL`, or Kafka credentials.

### 3. TypeScript line-by-line confidence

Already covered concepts, but still needs repetition:

```text
type vs interface
union types
discriminated unions
Record<K,V>
Map<K,V>
async Promise<T>
unknown in catch
type assertions like "as SwarmEvent"
runtime validation vs compile-time types
```

Concrete files to revisit:

```text
src/lib/swarm/types.ts
src/lib/store.ts
src/lib/useRunSwarm.ts
src/lib/swarm/orchestrator.ts
```

### 4. Kafka deep side: consumer, offsets, lag

Producer side is mostly covered. Still left:

```text
consumer
consumer group
offset
lag
replay from Kafka
partition assignment
what an analytics/audit consumer would do
why Kafka currently has no consumer in this repo
```

Interview answer to learn: Loom currently publishes to Kafka for distributed event streaming/audit readiness, but does not yet consume from Kafka. Redis is the current replay/read path.

### 5. Redis advanced revision

Already covered Redis well, but still worth drilling:

```text
fixed window vs sliding window vs token bucket
Lua atomicity
INCR + EXPIRE TTL behavior
Redis hash vs Redis stream
idempotent event persistence
stale sequence vs exact replay
Redis outage behavior
```

Concrete files:

```text
src/lib/swarm/rateLimit.ts
src/lib/swarm/session.ts
src/lib/swarm/redis.ts
src/lib/swarm/redis.integration.test.ts
```

### 6. Reliable orchestration architecture

Partially started, still left to finish deeply:

```text
in-request orchestration limitation
durable workflow state
background job queue
BullMQ vs Temporal vs Inngest
transactional outbox
dead-letter queue
backpressure
idempotency at workflow level
crash recovery
resume/retry policy
```

Current honest project gap: Redis stores recoverable run history, but the workflow itself is not fully durable/resumable if the process dies mid-run.

### 7. Observability, cost, and security

Still mostly left:

```text
structured logs with runId
metrics: request count, error rate, duration
traces across planner/workers/validator/synthesizer
Kafka lag alerts
Redis memory/latency alerts
token/cost accounting
provider usage vs length/4 estimate
auth and per-user quota
prompt injection boundaries
secret rotation
input size limits
abuse protection
```

Interview angle: current project has readiness checks and tests, but not a full observability/security stack.

### 8. Production deployment

Still left / partially blocked:

```text
managed Kafka setup        Redpanda/Confluent/Aiven
managed Redis setup        Redis Cloud/Upstash/etc.
production env vars        KAFKA_BROKERS, REDIS_URL, SASL/TLS
Vercel runtime limits      long SSE request constraints
container deployment       safer for long-running swarm jobs
Docker image runtime       standalone Next server
health checks              /api/health 200 before traffic
rollback/backups           production operations
```

Important known blocker: production cannot use local Docker addresses like `localhost:9092`, `kafka:19092`, or `redis:6379` from Vercel.

### 9. Frontend/UI internals

Still worth revisiting:

```text
GoalBar submit path
useRunSwarm hook
Zustand store reducer
React Flow nodes/edges
SidePanel output display
RecentRuns and replay route usage
loading/error/degraded states
```

Concrete files:

```text
src/components/GoalBar.tsx
src/lib/useRunSwarm.ts
src/lib/store.ts
src/components/SwarmGraph.tsx
src/components/SidePanel.tsx
src/components/RecentRuns.tsx
```

### 10. Senior interview delivery

Still needs practice, not more notes:

```text
30-second project intro
2-minute architecture walkthrough
explain one request end-to-end
explain one failure end-to-end
defend Redis/Kafka/SSE choices
name current limitations honestly
give prioritized upgrades
mock interview under pressure
resume bullets
```

## Recommended next learning order

```text
1. HTTP anatomy through the three route.ts files
2. Full line-by-line trace of POST /api/swarm
3. Full line-by-line trace of GET /api/swarm/[runId]
4. Full line-by-line trace of useRunSwarm stream parsing
5. TypeScript event types + Zustand reducer
6. Kafka consumer/offset/lag lesson
7. Reliable workflow architecture: BullMQ/Temporal/Inngest/outbox
8. Observability/cost/security
9. Production deployment choices
10. Mock interview and resume polish
```

## Current checkpoint

Explain from memory:

```text
Why does JSON.parse only prove valid JSON syntax, while Zod proves runtime shape?

Why does Loom use SSE instead of waiting for one final JSON response?

Why does /api/swarm/[runId] exist if /api/swarm already starts the run?
```

## Architecture update — 18 July 2026

Earlier notes that call auth, a Kafka consumer, and a durable workflow engine "future gaps" are now superseded:

```text
Next.js           page/API adapter, auth boundary, SSE
Better Auth       sessions and identity
PostgreSQL        users + Stripe entitlement projection
Stripe            payment and subscription source of truth
Temporal          durable dispatch to an external Worker
Redis             run state, event replay, per-user quota
Kafka             versioned downstream event stream
Go                isolated telemetry consumer and Prometheus metrics
```

Free versus Pro:

```text
Free: 10 swarm runs per hour
Pro:  100 swarm runs per hour

Upgrade → backend creates Stripe Checkout Session
Stripe event → signed webhook verifies raw body
Webhook → PostgreSQL subscription upsert
Next request → backend reads plan → Redis enforces matching quota
Manage billing → authenticated backend creates Stripe Customer Portal Session
```

Important security distinction: the browser never receives the Stripe secret, OpenRouter key, Better Auth secret, or webhook secret. The browser receives only a short-lived Stripe-hosted URL.

Temporal correction: Loom now has durable workflow dispatch, but not full step-level recovery. `runSwarm` is one Activity and automatic retries are disabled because LLM side effects are not fully idempotent. Split planner, task waves, validation, and synthesis into checkpointed Activities before claiming exact mid-run resume.

## What is left to learn now

```text
1. Auth cookies, session lookup, CSRF/origin protection, password reset/email verification
2. Stripe Checkout vs Portal vs webhook; event retries and subscription states
3. Temporal Workflow determinism, Activity heartbeats, cancellation, retries, idempotency
4. Go consumer groups, offset commits, rebalance, lag, Prometheus scraping
5. Production deployment: Vercel web + managed data services + container Workers
6. Observability: structured logs, traces, dashboards, alerts, provider-reported LLM cost
7. Reliability upgrades: phase Activities, transactional outbox, backpressure/DLQ
8. Frontend revision: Zustand event projection and React Flow nodes/edges
9. Interview practice: 30-second pitch, two-minute architecture, failure walkthrough
```

Best next lesson: follow one Stripe webhook from raw HTTP bytes → signature verification → subscription upsert → Pro quota, then compare that normal network side effect with why a Temporal Workflow must remain deterministic.

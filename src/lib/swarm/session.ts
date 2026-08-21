import type { SwarmEvent } from "./types";
import { getRedis } from "./redis";

export type RunStatus = "running" | "completed" | "failed";

export interface SwarmEventEnvelope {
  version: 1;
  id: string;
  runId: string;
  sequence: number;
  occurredAt: number;
  ownerId: string;
  event: SwarmEvent;
}

export interface RunSession {
  runId: string;
  ownerId: string;
  status: RunStatus;
  goal?: string;
  startedAt?: number;
  completedAt?: number;
  eventCount: number;
  final?: string;
  lastError?: string;
}

const SESSION_TTL_SECONDS = intEnv("LOOM_RUN_SESSION_TTL_SECONDS", 86_400);
const EVENT_STREAM_MAX_LENGTH = intEnv("LOOM_RUN_EVENT_STREAM_MAX_LENGTH", 10_000);

// One atomic Redis script keeps the session projection and append-only stream in
// sync. sequence-0 is a deterministic stream ID, so a retried event is ignored
// instead of being appended twice.
const PERSIST_EVENT = `
  local sequence = tonumber(ARGV[1])
  local current = tonumber(redis.call("HGET", KEYS[1], "eventCount") or "0")
  if current >= sequence then
    return 0
  end

  if ARGV[6] ~= "" then
    redis.call("ZADD", KEYS[3], ARGV[6], ARGV[7])
    redis.call("EXPIRE", KEYS[3], ARGV[2])
  end

  for i = 8, #ARGV, 2 do
    redis.call("HSET", KEYS[1], ARGV[i], ARGV[i + 1])
  end
  redis.call("EXPIRE", KEYS[1], ARGV[2])
  redis.call("XADD", KEYS[2], "MAXLEN", "~", ARGV[3], ARGV[4], "envelope", ARGV[5])
  redis.call("EXPIRE", KEYS[2], ARGV[2])
  return 1
`;

function intEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function sessionKey(runId: string) {
  return `loom:run:${runId}`;
}

function eventStreamKey(runId: string) {
  return `loom:run:${runId}:events`;
}

function ownerRunsKey(ownerId: string) {
  return `loom:owner:${ownerId}:runs`;
}

/** Stores an append-only event stream and the current run projection in Redis. */
export async function persistRunEvent(envelope: SwarmEventEnvelope) {
  const redis = await getRedis();

  const session = sessionKey(envelope.runId);
  const eventStream = eventStreamKey(envelope.runId);
  const ownerRuns = ownerRunsKey(envelope.ownerId);
  const now = String(envelope.occurredAt);
  const ownerIndexScore = envelope.event.kind === "run.start" ? String(envelope.event.at) : "";
  const fields: string[] = [
    "runId",
    envelope.runId,
    "ownerId",
    envelope.ownerId,
    "status",
    "running",
    "eventCount",
    String(envelope.sequence),
    "updatedAt",
    now,
  ];

  if (envelope.event.kind === "run.start") {
    fields.push("goal", envelope.event.goal, "startedAt", String(envelope.event.at));
  }
  if (envelope.event.kind === "run.done") {
    fields.push("status", "completed", "completedAt", now, "final", envelope.event.final);
  }
  if (envelope.event.kind === "error" && !envelope.event.agentId) {
    fields.push("lastError", envelope.event.message);
  }

  const persisted = await redis.eval(
    PERSIST_EVENT,
    3,
    session,
    eventStream,
    ownerRuns,
    envelope.sequence,
    SESSION_TTL_SECONDS,
    EVENT_STREAM_MAX_LENGTH,
    `${envelope.sequence}-0`,
    JSON.stringify(envelope),
    ownerIndexScore,
    envelope.runId,
    ...fields,
  );
  return persisted === 1;
}

/** Creates the ownership record before a Temporal worker picks up the run. */
export async function createRunSession(runId: string, ownerId: string, goal: string) {
  const redis = await getRedis();
  const now = String(Date.now());
  await redis
    .multi()
    .hset(
      sessionKey(runId),
      "runId",
      runId,
      "ownerId",
      ownerId,
      "goal",
      goal,
      "status",
      "running",
      "eventCount",
      "0",
      "startedAt",
      now,
      "updatedAt",
      now,
    )
    .expire(sessionKey(runId), SESSION_TTL_SECONDS)
    .zadd(ownerRunsKey(ownerId), now, runId)
    .expire(ownerRunsKey(ownerId), SESSION_TTL_SECONDS)
    .exec();
}

export async function finishRunSession(runId: string, status: Exclude<RunStatus, "running">) {
  const redis = await getRedis();

  const now = Date.now();
  await redis
    .multi()
    .hset(sessionKey(runId), "status", status, "completedAt", String(now), "updatedAt", String(now))
    .expire(sessionKey(runId), SESSION_TTL_SECONDS)
    .expire(eventStreamKey(runId), SESSION_TTL_SECONDS)
    .exec();
}

export async function getRunSession(runId: string): Promise<RunSession | null> {
  const redis = await getRedis();

  const data = await redis.hgetall(sessionKey(runId));
  if (!data.runId) return null;
  return {
    runId: data.runId,
    ownerId: data.ownerId,
    status: (data.status as RunStatus) ?? "running",
    goal: data.goal,
    startedAt: numberOrUndefined(data.startedAt),
    completedAt: numberOrUndefined(data.completedAt),
    eventCount: Number(data.eventCount ?? 0),
    final: data.final,
    lastError: data.lastError,
  };
}

/** Lists the authenticated owner's most recent server-retained runs. */
export async function listRunSessions(ownerId: string, limit = 20): Promise<RunSession[]> {
  const redis = await getRedis();
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 50);
  const runIds = await redis.zrevrange(ownerRunsKey(ownerId), 0, safeLimit * 2 - 1);
  const sessions = await Promise.all(runIds.map((runId) => getRunSession(runId)));
  return sessions
    .filter((session): session is RunSession => session?.ownerId === ownerId)
    .slice(0, safeLimit);
}

export async function getRunEvents(runId: string, count = 1_000): Promise<SwarmEventEnvelope[]> {
  const redis = await getRedis();

  const entries = await redis.xrange(eventStreamKey(runId), "-", "+", "COUNT", count);
  return entries.flatMap(([, values]) => {
    const index = values.indexOf("envelope");
    if (index < 0) return [];
    const value = values[index + 1];
    if (!value) return [];
    try {
      return [JSON.parse(value) as SwarmEventEnvelope];
    } catch {
      return [];
    }
  });
}

export async function getRunEventsAfter(
  runId: string,
  sequence: number,
  count = 200,
): Promise<SwarmEventEnvelope[]> {
  const redis = await getRedis();
  const start = sequence > 0 ? `(${sequence}-0` : "-";
  const entries = await redis.xrange(eventStreamKey(runId), start, "+", "COUNT", count);
  return entries.flatMap(([, values]) => {
    const index = values.indexOf("envelope");
    const value = index >= 0 ? values[index + 1] : undefined;
    if (!value) return [];
    try {
      return [JSON.parse(value) as SwarmEventEnvelope];
    } catch {
      return [];
    }
  });
}

function numberOrUndefined(value: string | undefined) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

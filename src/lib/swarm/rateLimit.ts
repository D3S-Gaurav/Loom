import { getRedis } from "./redis";

export class RateLimitError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

interface LimitOptions {
  key: string;
  limit: number;
  windowSeconds: number;
}

interface RunLimitOptions {
  totalKey: string;
  totalLimit: number;
  maxKey: string;
  maxLimit: number;
  isMax: boolean;
  windowSeconds: number;
}

function intEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const MODEL_RATE_LIMIT = {
  limit: intEnv("LOOM_MODEL_CALLS_PER_WINDOW", 120),
  windowSeconds: intEnv("LOOM_MODEL_WINDOW_SECONDS", 3600),
};

const INCREMENT_WITH_EXPIRY = `
  local count = redis.call("INCR", KEYS[1])
  if count == 1 then
    redis.call("EXPIRE", KEYS[1], ARGV[1])
  end
  return { count, redis.call("TTL", KEYS[1]) }
`;

const CONSUME_RUN_ALLOWANCE = `
  local total = tonumber(redis.call("GET", KEYS[1]) or "0")
  if total >= tonumber(ARGV[1]) then
    return { 0, redis.call("TTL", KEYS[1]) }
  end

  if ARGV[4] == "1" then
    local maxRuns = tonumber(redis.call("GET", KEYS[2]) or "0")
    if maxRuns >= tonumber(ARGV[2]) then
      return { -1, redis.call("TTL", KEYS[2]) }
    end
  end

  total = redis.call("INCR", KEYS[1])
  if total == 1 then redis.call("EXPIRE", KEYS[1], ARGV[3]) end

  if ARGV[4] == "1" then
    local maxRuns = redis.call("INCR", KEYS[2])
    if maxRuns == 1 then redis.call("EXPIRE", KEYS[2], ARGV[3]) end
  end

  return { 1, redis.call("TTL", KEYS[1]) }
`;

export async function enforceRateLimit({ key, limit, windowSeconds }: LimitOptions) {
  const client = await getRedis();

  // No try/catch here: a Redis failure should propagate as-is (never silently
  // bypass a distributed cost limit), and a RateLimitError is thrown directly
  // below rather than caught and rethrown.
  const [count, ttl] = (await client.eval(INCREMENT_WITH_EXPIRY, 1, key, windowSeconds)) as [number, number];
  if (count > limit) {
    throw new RateLimitError("Rate limit exceeded.", Math.max(ttl, 1));
  }
}

/** Atomically consumes the total run budget and, for Max runs, its smaller budget. */
export async function enforceRunRateLimit({
  totalKey,
  totalLimit,
  maxKey,
  maxLimit,
  isMax,
  windowSeconds,
}: RunLimitOptions) {
  const client = await getRedis();
  const [result, ttl] = (await client.eval(
    CONSUME_RUN_ALLOWANCE,
    2,
    totalKey,
    maxKey,
    totalLimit,
    maxLimit,
    windowSeconds,
    isMax ? 1 : 0,
  )) as [number, number];

  if (result === 0) {
    throw new RateLimitError("Hourly run limit reached.", Math.max(ttl, 1));
  }
  if (result === -1) {
    throw new RateLimitError("Max mode hourly limit reached.", Math.max(ttl, 1));
  }
}

export function rateLimitKey(scope: string, id: string) {
  return `loom:rate:${scope}:${id}`;
}

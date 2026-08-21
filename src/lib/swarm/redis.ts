import Redis from "ioredis";
import { getRedisConfig } from "./config";

let redisClient: Redis | null = null;
let redisPromise: Promise<Redis> | null = null;

/** Shares one required connection across rate limits and durable run state. */
export function getRedis(): Promise<Redis> {
  if (!redisPromise) {
    const config = getRedisConfig();
    const client = new Redis(config.url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
      autoResendUnfulfilledCommands: false,
      connectTimeout: config.connectTimeoutMs,
      commandTimeout: config.commandTimeoutMs,
      keepAlive: 10_000,
      connectionName: "loom-web",
      // Reconnecting to Redis is a SAME-resource retry (unlike the model chain's
      // lateral fallback), so it uses real exponential backoff with jitter:
      // base doubles each attempt, capped at 2s, plus up to 50% random jitter so
      // many concurrent invocations reconnecting after an outage don't all retry
      // in lockstep and hammer Redis the instant it comes back.
      retryStrategy: (attempt) => {
        const base = Math.min(2 ** attempt * 50, 2_000);
        const jitter = Math.random() * base * 0.5;
        return Math.round(base + jitter);
      },
    });
    redisClient = client;
    client.on("error", (error) => console.error("Redis connection error", error.message));
    client.on("end", () => {
      if (redisClient === client) {
        redisClient = null;
        redisPromise = null;
      }
    });
    redisPromise = client.connect().then(
      () => client,
      (error) => {
        redisClient = null;
        redisPromise = null;
        client.disconnect();
        throw error;
      },
    );
  }
  return redisPromise;
}

export async function pingRedis() {
  const redis = await getRedis();
  const response = await redis.ping();
  if (response !== "PONG") throw new Error("Redis did not return PONG.");
}

export async function disconnectRedis() {
  const client = redisClient;
  redisClient = null;
  redisPromise = null;
  if (client && client.status !== "end") client.disconnect();
}

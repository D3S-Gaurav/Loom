import {
  getInfrastructureHealthCacheMs,
  getKafkaProbeTimeoutMs,
  InfrastructureConfigError,
} from "./config";
import { pingKafka } from "./kafka";
import { pingRedis } from "./redis";

export interface DependencyHealth {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface InfrastructureHealth {
  /** Whether a run may start. Redis is the only hard requirement. */
  ok: boolean;
  checkedAt: number;
  kafka: DependencyHealth;
  redis: DependencyHealth;
}

export class InfrastructureUnavailableError extends Error {
  constructor(readonly health: InfrastructureHealth) {
    super("Required swarm infrastructure is unavailable.");
    this.name = "InfrastructureUnavailableError";
  }
}

let cached: { expiresAt: number; value: InfrastructureHealth } | null = null;
let inFlight: Promise<InfrastructureHealth> | null = null;

async function checkDependency(
  check: () => Promise<void>,
  timeoutMs?: number,
): Promise<DependencyHealth> {
  const startedAt = Date.now();
  try {
    await (timeoutMs ? withTimeout(check(), timeoutMs) : check());
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    const message = error instanceof InfrastructureConfigError ? error.message : (error as Error).message;
    return { ok: false, latencyMs: Date.now() - startedAt, error: message };
  }
}

/**
 * Bound a probe so an unreachable dependency cannot stall the caller.
 *
 * kafkajs retries an unreachable broker (KAFKA_RETRY_COUNT, default 8) before
 * surfacing an error, which measured ~46s against a decommissioned cluster.
 * Redis is the only dependency a run truly needs, so the Kafka probe must never
 * make starting a run wait that long.
 */
function withTimeout(work: Promise<void>, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`probe timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export async function getInfrastructureHealth(options: { force?: boolean } = {}) {
  const now = Date.now();
  if (!options.force && cached && cached.expiresAt > now) return cached.value;
  // Share an active probe even when a caller asks to bypass the cached result.
  if (inFlight) return inFlight;

  inFlight = Promise.all([
    checkDependency(pingKafka, getKafkaProbeTimeoutMs()),
    checkDependency(pingRedis),
  ])
    .then(([kafka, redis]) => {
      const value: InfrastructureHealth = {
        // Redis is the canonical recoverable record for run events, so it alone
        // decides whether a run may start. Kafka is a downstream telemetry
        // mirror: its health is still reported, but a broker outage degrades
        // observability rather than taking the product down.
        ok: redis.ok,
        checkedAt: Date.now(),
        kafka,
        redis,
      };
      cached = { expiresAt: Date.now() + getInfrastructureHealthCacheMs(), value };
      return value;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export async function assertInfrastructureReady() {
  const health = await getInfrastructureHealth();
  if (!health.ok) throw new InfrastructureUnavailableError(health);
  return health;
}

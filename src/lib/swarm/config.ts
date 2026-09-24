import type { SASLOptions } from "kafkajs";
import type { ConnectionOptions } from "node:tls";

export class InfrastructureConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InfrastructureConfigError";
  }
}

export interface KafkaInfrastructureConfig {
  brokers: string[];
  clientId: string;
  topic: string;
  ssl: boolean | ConnectionOptions;
  sasl?: SASLOptions;
  connectionTimeoutMs: number;
  requestTimeoutMs: number;
  retryCount: number;
}

export interface RedisInfrastructureConfig {
  url: string;
  connectTimeoutMs: number;
  commandTimeoutMs: number;
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new InfrastructureConfigError(`${name} is required. Start the infrastructure stack and configure the server.`);
  }
  return value;
}

function positiveInt(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new InfrastructureConfigError(`${name} must be a positive integer.`);
  }
  return value;
}

function bool(name: string, fallback = false) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes"].includes(raw)) return true;
  if (["0", "false", "no"].includes(raw)) return false;
  throw new InfrastructureConfigError(`${name} must be 1/0, true/false, or yes/no.`);
}

function kafkaSasl(): SASLOptions | undefined {
  const username = process.env.KAFKA_USERNAME?.trim();
  const password = process.env.KAFKA_PASSWORD?.trim();
  if (!username && !password) return undefined;
  if (!username || !password) {
    throw new InfrastructureConfigError("KAFKA_USERNAME and KAFKA_PASSWORD must be configured together.");
  }

  const mechanism = process.env.KAFKA_SASL_MECHANISM?.trim() || "plain";
  if (mechanism === "plain" || mechanism === "scram-sha-256" || mechanism === "scram-sha-512") {
    return { mechanism, username, password };
  }
  throw new InfrastructureConfigError(
    "KAFKA_SASL_MECHANISM must be plain, scram-sha-256, or scram-sha-512.",
  );
}

function kafkaTls(): boolean | ConnectionOptions {
  if (!bool("KAFKA_SSL")) return false;
  const certificate = process.env.KAFKA_CA_CERT?.trim();
  if (!certificate) return true;
  return {
    ca: [certificate.replace(/\\n/g, "\n")],
    rejectUnauthorized: true,
  };
}

/**
 * Azure Event Hubs exposes a Kafka-protocol endpoint (SASL/PLAIN over TLS on port 9093),
 * so the same KafkaJS producer/consumer code runs unchanged against managed Azure.
 * When AZURE_EVENTHUBS_CONNECTION_STRING is set it takes precedence over a self-hosted broker.
 */
function azureEventHubsConfig(): KafkaInfrastructureConfig | null {
  const connectionString = process.env.AZURE_EVENTHUBS_CONNECTION_STRING?.trim();
  if (!connectionString) return null;

  const parts = Object.fromEntries(
    connectionString
      .split(";")
      .map((segment) => segment.trim())
      .filter(Boolean)
      .map((segment) => {
        const index = segment.indexOf("=");
        return index === -1
          ? [segment, ""]
          : [segment.slice(0, index).trim(), segment.slice(index + 1).trim()];
      }),
  ) as Record<string, string>;

  if (!parts.Endpoint) {
    throw new InfrastructureConfigError("AZURE_EVENTHUBS_CONNECTION_STRING must include an Endpoint=sb://... value.");
  }
  let host: string;
  try {
    host = new URL(parts.Endpoint).hostname; // <namespace>.servicebus.windows.net
  } catch {
    throw new InfrastructureConfigError("AZURE_EVENTHUBS_CONNECTION_STRING Endpoint must be a valid sb:// URL.");
  }
  if (!parts.SharedAccessKeyName || !parts.SharedAccessKey) {
    throw new InfrastructureConfigError(
      "AZURE_EVENTHUBS_CONNECTION_STRING must include SharedAccessKeyName and SharedAccessKey.",
    );
  }

  // The Kafka topic maps to the event hub name: EntityPath in the connection string, else the standard topic env.
  const topic = parts.EntityPath?.trim() || process.env.KAFKA_SWARM_EVENTS_TOPIC?.trim();
  if (!topic) {
    throw new InfrastructureConfigError(
      "Azure Event Hubs requires an event hub name via EntityPath or KAFKA_SWARM_EVENTS_TOPIC.",
    );
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(topic)) {
    throw new InfrastructureConfigError("Azure Event Hubs event hub name contains unsupported characters.");
  }

  return {
    brokers: [`${host}:9093`],
    clientId: process.env.KAFKA_CLIENT_ID?.trim() || "loom-web",
    topic,
    ssl: true,
    sasl: { mechanism: "plain", username: "$ConnectionString", password: connectionString },
    connectionTimeoutMs: positiveInt("KAFKA_CONNECTION_TIMEOUT_MS", 5_000),
    requestTimeoutMs: positiveInt("KAFKA_REQUEST_TIMEOUT_MS", 30_000),
    retryCount: positiveInt("KAFKA_RETRY_COUNT", 8),
  };
}

export function getKafkaConfig(): KafkaInfrastructureConfig {
  const azure = azureEventHubsConfig();
  if (azure) return azure;

  const brokers = required("KAFKA_BROKERS")
    .split(",")
    .map((broker) => broker.trim())
    .filter(Boolean);
  if (brokers.length === 0) throw new InfrastructureConfigError("KAFKA_BROKERS must contain at least one broker.");
  if (brokers.some((broker) => broker.includes("://") || /\s/.test(broker))) {
    throw new InfrastructureConfigError(
      "KAFKA_BROKERS must contain comma-separated host:port values without URL schemes.",
    );
  }

  const topic = required("KAFKA_SWARM_EVENTS_TOPIC");
  if (!/^[a-zA-Z0-9._-]+$/.test(topic)) {
    throw new InfrastructureConfigError("KAFKA_SWARM_EVENTS_TOPIC contains unsupported characters.");
  }

  return {
    brokers,
    clientId: process.env.KAFKA_CLIENT_ID?.trim() || "loom-web",
    topic,
    ssl: kafkaTls(),
    sasl: kafkaSasl(),
    connectionTimeoutMs: positiveInt("KAFKA_CONNECTION_TIMEOUT_MS", 5_000),
    requestTimeoutMs: positiveInt("KAFKA_REQUEST_TIMEOUT_MS", 30_000),
    retryCount: positiveInt("KAFKA_RETRY_COUNT", 8),
  };
}

export function getRedisConfig(): RedisInfrastructureConfig {
  const url = required("REDIS_URL");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InfrastructureConfigError("REDIS_URL must be a valid redis:// or rediss:// URL.");
  }
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    throw new InfrastructureConfigError("REDIS_URL must use redis:// or rediss://.");
  }

  return {
    url,
    connectTimeoutMs: positiveInt("REDIS_CONNECT_TIMEOUT_MS", 5_000),
    commandTimeoutMs: positiveInt("REDIS_COMMAND_TIMEOUT_MS", 3_000),
  };
}

export function getInfrastructureHealthCacheMs() {
  return positiveInt("LOOM_INFRA_HEALTH_CACHE_MS", 5_000);
}

/**
 * Upper bound on the Kafka readiness probe. Kafka is not required to start a
 * run, so an unreachable broker must fail fast instead of spending the kafkajs
 * retry budget while a request waits.
 */
export function getKafkaProbeTimeoutMs() {
  return positiveInt("LOOM_KAFKA_PROBE_TIMEOUT_MS", 3_000);
}

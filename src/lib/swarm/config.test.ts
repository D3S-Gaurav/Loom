import { afterEach, describe, expect, it, vi } from "vitest";
import { getKafkaConfig, InfrastructureConfigError } from "./config";

afterEach(() => vi.unstubAllEnvs());

describe("Kafka infrastructure configuration", () => {
  it("builds a hosted SASL/TLS configuration", () => {
    vi.stubEnv("KAFKA_BROKERS", "kafka.example.com:12345");
    vi.stubEnv("KAFKA_SWARM_EVENTS_TOPIC", "loom.swarm.events");
    vi.stubEnv("KAFKA_SSL", "1");
    vi.stubEnv("KAFKA_SASL_MECHANISM", "scram-sha-256");
    vi.stubEnv("KAFKA_USERNAME", "loom");
    vi.stubEnv("KAFKA_PASSWORD", "secret");

    expect(getKafkaConfig()).toMatchObject({
      brokers: ["kafka.example.com:12345"],
      topic: "loom.swarm.events",
      ssl: true,
      sasl: { mechanism: "scram-sha-256", username: "loom", password: "secret" },
    });
  });

  it("loads an Aiven project CA without weakening certificate verification", () => {
    vi.stubEnv("KAFKA_BROKERS", "kafka.example.com:12345");
    vi.stubEnv("KAFKA_SWARM_EVENTS_TOPIC", "loom.swarm.events");
    vi.stubEnv("KAFKA_SSL", "1");
    vi.stubEnv("KAFKA_CA_CERT", "-----BEGIN CERTIFICATE-----\\ncertificate\\n-----END CERTIFICATE-----");

    expect(getKafkaConfig().ssl).toEqual({
      ca: ["-----BEGIN CERTIFICATE-----\ncertificate\n-----END CERTIFICATE-----"],
      rejectUnauthorized: true,
    });
  });

  it("rejects missing broker configuration", () => {
    vi.stubEnv("KAFKA_BROKERS", "");
    vi.stubEnv("KAFKA_SWARM_EVENTS_TOPIC", "loom.swarm.events");
    expect(() => getKafkaConfig()).toThrow(InfrastructureConfigError);
  });

  it("rejects broker URL schemes KafkaJS cannot consume", () => {
    vi.stubEnv("KAFKA_BROKERS", "SASL_SSL://kafka.example.com:12345");
    vi.stubEnv("KAFKA_SWARM_EVENTS_TOPIC", "loom.swarm.events");
    expect(() => getKafkaConfig()).toThrow("without URL schemes");
  });

  it("requires username and password together", () => {
    vi.stubEnv("KAFKA_BROKERS", "kafka.example.com:12345");
    vi.stubEnv("KAFKA_SWARM_EVENTS_TOPIC", "loom.swarm.events");
    vi.stubEnv("KAFKA_USERNAME", "loom");
    vi.stubEnv("KAFKA_PASSWORD", "");
    expect(() => getKafkaConfig()).toThrow("KAFKA_USERNAME and KAFKA_PASSWORD must be configured together");
  });

  it("targets Azure Event Hubs over the Kafka protocol when a connection string is set", () => {
    vi.stubEnv(
      "AZURE_EVENTHUBS_CONNECTION_STRING",
      "Endpoint=sb://loom-ns.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=abc123==;EntityPath=loom.swarm.events",
    );

    expect(getKafkaConfig()).toMatchObject({
      brokers: ["loom-ns.servicebus.windows.net:9093"],
      topic: "loom.swarm.events",
      ssl: true,
      sasl: {
        mechanism: "plain",
        username: "$ConnectionString",
        password:
          "Endpoint=sb://loom-ns.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=abc123==;EntityPath=loom.swarm.events",
      },
    });
  });

  it("falls back to the event hub name from KAFKA_SWARM_EVENTS_TOPIC when EntityPath is absent", () => {
    vi.stubEnv(
      "AZURE_EVENTHUBS_CONNECTION_STRING",
      "Endpoint=sb://loom-ns.servicebus.windows.net/;SharedAccessKeyName=send;SharedAccessKey=key==",
    );
    vi.stubEnv("KAFKA_SWARM_EVENTS_TOPIC", "swarm.events");
    expect(getKafkaConfig().topic).toBe("swarm.events");
  });

  it("rejects an Azure Event Hubs connection string missing its shared access key", () => {
    vi.stubEnv(
      "AZURE_EVENTHUBS_CONNECTION_STRING",
      "Endpoint=sb://loom-ns.servicebus.windows.net/;SharedAccessKeyName=send;EntityPath=swarm.events",
    );
    expect(() => getKafkaConfig()).toThrow("SharedAccessKeyName and SharedAccessKey");
  });
});

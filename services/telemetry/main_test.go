package main

import "testing"

func TestProcessCountsKnownEvents(t *testing.T) {
	stats := &metrics{}
	event := []byte(`{"version":1,"runId":"run-1","sequence":1,"occurredAt":123,"event":{"kind":"run.start"}}`)

	decoded, err := process(event, stats)
	if err != nil {
		t.Fatalf("process returned error: %v", err)
	}
	if decoded.GetRunId() != "run-1" || decoded.GetKind() != "run.start" {
		t.Fatalf("unexpected decoded event: %+v", decoded)
	}
	if decoded.GetPayloadJson() != `{"kind":"run.start"}` {
		t.Fatalf("payload JSON = %q, want the original event body", decoded.GetPayloadJson())
	}
	if got := stats.events.Load(); got != 1 {
		t.Fatalf("events = %d, want 1", got)
	}
	if got := stats.runsStarted.Load(); got != 1 {
		t.Fatalf("runsStarted = %d, want 1", got)
	}
}

func TestProcessRejectsInvalidEnvelope(t *testing.T) {
	stats := &metrics{}
	if _, err := process([]byte(`{"version":1}`), stats); err == nil {
		t.Fatal("expected invalid envelope error")
	}
}

func TestLoadConfigAcceptsHostedKafkaTLSAndSASL(t *testing.T) {
	t.Setenv("KAFKA_BROKERS", "kafka.example.com:12345")
	t.Setenv("KAFKA_SSL", "1")
	t.Setenv("KAFKA_SASL_MECHANISM", "scram-sha-256")
	t.Setenv("KAFKA_USERNAME", "consumer")
	t.Setenv("KAFKA_PASSWORD", "secret")

	cfg, err := loadConfig()
	if err != nil {
		t.Fatalf("loadConfig returned error: %v", err)
	}
	if !cfg.ssl || cfg.saslMechanism != "scram-sha-256" || cfg.username != "consumer" {
		t.Fatalf("unexpected hosted Kafka config: %+v", cfg)
	}
	if _, err := kafkaOptions(cfg); err != nil {
		t.Fatalf("kafkaOptions returned error: %v", err)
	}
}

func TestKafkaOptionsRejectsInvalidProjectCA(t *testing.T) {
	_, err := kafkaOptions(config{
		brokers: []string{"kafka.example.com:12345"},
		topic:   "loom.swarm.events",
		groupID: "loom-telemetry-v1",
		ssl:     true,
		caCert:  "not a certificate",
	})
	if err == nil {
		t.Fatal("expected invalid KAFKA_CA_CERT error")
	}
}

func TestLoadConfigRequiresCompleteSASLCredentials(t *testing.T) {
	t.Setenv("KAFKA_USERNAME", "consumer")
	t.Setenv("KAFKA_PASSWORD", "")
	if _, err := loadConfig(); err == nil {
		t.Fatal("expected incomplete SASL credentials error")
	}
}

func TestKafkaOptionsRejectsUnsupportedSASLMechanism(t *testing.T) {
	_, err := kafkaOptions(config{
		brokers:       []string{"kafka.example.com:12345"},
		topic:         "loom.swarm.events",
		groupID:       "loom-telemetry-v1",
		saslMechanism: "oauth",
		username:      "consumer",
		password:      "secret",
	})
	if err == nil {
		t.Fatal("expected unsupported SASL mechanism error")
	}
}

func TestLoadConfigReadsGRPCPortAndWebSocketOrigins(t *testing.T) {
	t.Setenv("TELEMETRY_GRPC_PORT", "9190")
	t.Setenv("TELEMETRY_WS_ALLOWED_ORIGINS", "https://loom.example.com, http://localhost:3000")

	cfg, err := loadConfig()
	if err != nil {
		t.Fatalf("loadConfig returned error: %v", err)
	}
	if cfg.grpcAddress != ":9190" {
		t.Fatalf("grpcAddress = %q, want :9190", cfg.grpcAddress)
	}
	if len(cfg.wsOrigins) != 2 || cfg.wsOrigins[1] != "http://localhost:3000" {
		t.Fatalf("wsOrigins = %#v, want both origins trimmed", cfg.wsOrigins)
	}
}

func TestLoadConfigRejectsNonNumericGRPCPort(t *testing.T) {
	t.Setenv("TELEMETRY_GRPC_PORT", "grpc")
	if _, err := loadConfig(); err == nil {
		t.Fatal("expected non-numeric TELEMETRY_GRPC_PORT error")
	}
}

package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/sasl/plain"
	"github.com/twmb/franz-go/pkg/sasl/scram"

	telemetryv1 "github.com/D3S-Gaurav/Loom/services/telemetry/gen/telemetry/v1"
)

type config struct {
	brokers       []string
	topic         string
	groupID       string
	address       string
	grpcAddress   string
	wsOrigins     []string
	ssl           bool
	caCert        string
	saslMechanism string
	username      string
	password      string
}

type envelope struct {
	Version    int       `json:"version"`
	RunID      string    `json:"runId"`
	Sequence   int64     `json:"sequence"`
	OccurredAt int64     `json:"occurredAt"`
	Event      eventBody `json:"event"`
}

// eventBody keeps the event exactly as the web tier published it. The consumer
// itself only needs `kind` for its counters, but gRPC and WebSocket subscribers
// want the whole payload, and re-encoding a decoded struct would silently drop
// every field this service does not know about.
type eventBody struct {
	Kind string `json:"kind"`
	raw  []byte
}

func (b *eventBody) UnmarshalJSON(data []byte) error {
	var shape struct {
		Kind string `json:"kind"`
	}
	if err := json.Unmarshal(data, &shape); err != nil {
		return err
	}
	b.Kind = shape.Kind
	b.raw = append(b.raw[:0], data...)
	return nil
}

type metrics struct {
	consumerUp    atomic.Bool
	events        atomic.Int64
	invalidEvents atomic.Int64
	runsStarted   atomic.Int64
	runsCompleted atomic.Int64
	runErrors     atomic.Int64
	agentSpawns   atomic.Int64
	tokenChunks   atomic.Int64
	lastEventAt   atomic.Int64
}

func main() {
	cfg, err := loadConfig()
	if err != nil {
		slog.Error("invalid configuration", "error", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	stats := &metrics{}
	options, err := kafkaOptions(cfg)
	if err != nil {
		slog.Error("configure Kafka client", "error", err)
		os.Exit(1)
	}
	client, err := kgo.NewClient(options...)
	if err != nil {
		slog.Error("create Kafka client", "error", err)
		os.Exit(1)
	}
	defer client.Close()

	// One Kafka consumer, many readers: /metrics scrapes, gRPC streams and
	// WebSocket clients all read from the same poll loop through the hub.
	events := newHub()

	server := &http.Server{
		Addr:              cfg.address,
		Handler:           routes(ctx, stats, events, cfg.wsOrigins),
		ReadHeaderTimeout: 3 * time.Second,
	}

	go consume(ctx, client, stats, events)
	go func() {
		if err := serveGRPC(ctx, cfg.grpcAddress, stats, events); err != nil {
			slog.Error("telemetry gRPC server failed", "error", err)
			stop()
		}
	}()
	go func() {
		slog.Info("telemetry HTTP server started", "address", cfg.address)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("telemetry HTTP server failed", "error", err)
			stop()
		}
	}()

	<-ctx.Done()
	// Closing the hub first releases WebSocket writers, so Shutdown is waiting
	// on connections that are already unwinding rather than on live streams.
	events.closeAll()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdownCtx)
}

func consume(ctx context.Context, client *kgo.Client, stats *metrics, events *hub) {
	for ctx.Err() == nil {
		if err := client.Ping(ctx); err != nil {
			stats.consumerUp.Store(false)
			slog.Warn("Kafka unavailable", "error", err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Second):
			}
			continue
		}

		stats.consumerUp.Store(true)
		fetches := client.PollFetches(ctx)
		if fetches.IsClientClosed() || ctx.Err() != nil {
			return
		}
		if errs := fetches.Errors(); len(errs) > 0 {
			stats.consumerUp.Store(false)
			for _, fetchErr := range errs {
				slog.Warn("Kafka fetch failed", "topic", fetchErr.Topic, "partition", fetchErr.Partition, "error", fetchErr.Err)
			}
			continue
		}

		records := make([]*kgo.Record, 0, fetches.NumRecords())
		fetches.EachRecord(func(record *kgo.Record) {
			event, err := process(record.Value, stats)
			if err != nil {
				stats.invalidEvents.Add(1)
				slog.Warn("invalid swarm event", "error", err, "partition", record.Partition, "offset", record.Offset)
			} else {
				// Non-blocking by contract. Fan-out must never slow the poll
				// loop down, or a stalled subscriber would stop offset commits
				// and eventually force a consumer group rebalance.
				events.publish(event)
			}
			// Invalid records are observed and then acknowledged too. Otherwise one
			// poison message would be fetched forever and block its partition. A
			// production expansion can publish the raw record to a dead-letter topic.
			records = append(records, record)
		})

		if len(records) > 0 {
			if err := client.CommitRecords(ctx, records...); err != nil {
				stats.consumerUp.Store(false)
				slog.Warn("Kafka offset commit failed", "error", err)
			}
		}
	}
}

func process(value []byte, stats *metrics) (*telemetryv1.RunEvent, error) {
	var event envelope
	if err := json.Unmarshal(value, &event); err != nil {
		return nil, fmt.Errorf("decode envelope: %w", err)
	}
	if event.Version != 1 || event.RunID == "" || event.Sequence < 1 || event.Event.Kind == "" {
		return nil, errors.New("missing required envelope fields")
	}

	stats.events.Add(1)
	stats.lastEventAt.Store(event.OccurredAt)
	switch event.Event.Kind {
	case "run.start":
		stats.runsStarted.Add(1)
	case "run.done":
		stats.runsCompleted.Add(1)
	case "error":
		stats.runErrors.Add(1)
	case "agent.spawn":
		stats.agentSpawns.Add(1)
	case "agent.token":
		stats.tokenChunks.Add(1)
	}

	return &telemetryv1.RunEvent{
		Version:      int32(event.Version),
		RunId:        event.RunID,
		Sequence:     event.Sequence,
		OccurredAtMs: event.OccurredAt,
		Kind:         event.Event.Kind,
		PayloadJson:  string(event.Event.raw),
	}, nil
}

func routes(ctx context.Context, stats *metrics, events *hub, wsOrigins []string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /ws", websocketHandler(ctx, events, wsOrigins))
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("content-type", "application/json")
		if !stats.consumerUp.Load() {
			w.WriteHeader(http.StatusServiceUnavailable)
		}
		_, _ = fmt.Fprintf(w, `{"status":%q}`, map[bool]string{true: "ready", false: "not_ready"}[stats.consumerUp.Load()])
	})
	mux.HandleFunc("GET /metrics", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("content-type", "text/plain; version=0.0.4")
		writeGauge(w, "loom_consumer_up", boolValue(stats.consumerUp.Load()))
		writeCounter(w, "loom_events_consumed_total", stats.events.Load())
		writeCounter(w, "loom_invalid_events_total", stats.invalidEvents.Load())
		writeCounter(w, "loom_runs_started_total", stats.runsStarted.Load())
		writeCounter(w, "loom_runs_completed_total", stats.runsCompleted.Load())
		writeCounter(w, "loom_run_errors_total", stats.runErrors.Load())
		writeCounter(w, "loom_agent_spawns_total", stats.agentSpawns.Load())
		writeCounter(w, "loom_token_chunks_total", stats.tokenChunks.Load())
		writeGauge(w, "loom_last_event_timestamp_milliseconds", stats.lastEventAt.Load())
		writeGauge(w, "loom_stream_subscribers", events.subscriberCount())
		writeCounter(w, "loom_slow_subscribers_dropped_total", events.droppedCount())
	})
	return mux
}

func writeCounter(w http.ResponseWriter, name string, value int64) {
	_, _ = fmt.Fprintf(w, "# TYPE %s counter\n%s %d\n", name, name, value)
}

func writeGauge(w http.ResponseWriter, name string, value int64) {
	_, _ = fmt.Fprintf(w, "# TYPE %s gauge\n%s %d\n", name, name, value)
}

func boolValue(value bool) int64 {
	if value {
		return 1
	}
	return 0
}

func loadConfig() (config, error) {
	brokers := splitNonEmpty(env("KAFKA_BROKERS", "kafka:19092"))
	if len(brokers) == 0 {
		return config{}, errors.New("KAFKA_BROKERS must contain at least one broker")
	}
	port := env("TELEMETRY_PORT", "9091")
	if _, err := strconv.Atoi(port); err != nil {
		return config{}, fmt.Errorf("TELEMETRY_PORT must be numeric: %w", err)
	}
	grpcPort := env("TELEMETRY_GRPC_PORT", "9090")
	if _, err := strconv.Atoi(grpcPort); err != nil {
		return config{}, fmt.Errorf("TELEMETRY_GRPC_PORT must be numeric: %w", err)
	}
	ssl, err := boolEnv("KAFKA_SSL", false)
	if err != nil {
		return config{}, err
	}
	username := strings.TrimSpace(os.Getenv("KAFKA_USERNAME"))
	password := strings.TrimSpace(os.Getenv("KAFKA_PASSWORD"))
	if (username == "") != (password == "") {
		return config{}, errors.New("KAFKA_USERNAME and KAFKA_PASSWORD must be configured together")
	}
	return config{
		brokers:       brokers,
		topic:         env("KAFKA_SWARM_EVENTS_TOPIC", "loom.swarm.events"),
		groupID:       env("KAFKA_TELEMETRY_GROUP_ID", "loom-telemetry-v1"),
		address:       ":" + port,
		grpcAddress:   ":" + grpcPort,
		wsOrigins:     splitNonEmpty(env("TELEMETRY_WS_ALLOWED_ORIGINS", "http://localhost:3000")),
		ssl:           ssl,
		caCert:        strings.ReplaceAll(strings.TrimSpace(os.Getenv("KAFKA_CA_CERT")), `\n`, "\n"),
		saslMechanism: env("KAFKA_SASL_MECHANISM", "plain"),
		username:      username,
		password:      password,
	}, nil
}

func kafkaOptions(cfg config) ([]kgo.Opt, error) {
	options := []kgo.Opt{
		kgo.SeedBrokers(cfg.brokers...),
		kgo.ClientID("loom-go-telemetry"),
		kgo.ConsumerGroup(cfg.groupID),
		kgo.ConsumeTopics(cfg.topic),
		kgo.DisableAutoCommit(),
		kgo.ConsumeResetOffset(kgo.NewOffset().AtStart()),
	}
	if cfg.ssl {
		tlsConfig := &tls.Config{MinVersion: tls.VersionTLS12}
		if cfg.caCert != "" {
			roots, err := x509.SystemCertPool()
			if err != nil || roots == nil {
				roots = x509.NewCertPool()
			}
			if !roots.AppendCertsFromPEM([]byte(cfg.caCert)) {
				return nil, errors.New("KAFKA_CA_CERT does not contain a valid PEM certificate")
			}
			tlsConfig.RootCAs = roots
		}
		options = append(options, kgo.DialTLSConfig(tlsConfig))
	}
	if cfg.username == "" {
		return options, nil
	}

	switch cfg.saslMechanism {
	case "plain":
		options = append(options, kgo.SASL(plain.Auth{User: cfg.username, Pass: cfg.password}.AsMechanism()))
	case "scram-sha-256":
		options = append(options, kgo.SASL(scram.Auth{User: cfg.username, Pass: cfg.password}.AsSha256Mechanism()))
	case "scram-sha-512":
		options = append(options, kgo.SASL(scram.Auth{User: cfg.username, Pass: cfg.password}.AsSha512Mechanism()))
	default:
		return nil, fmt.Errorf("unsupported KAFKA_SASL_MECHANISM %q", cfg.saslMechanism)
	}
	return options, nil
}

func boolEnv(name string, fallback bool) (bool, error) {
	value := strings.ToLower(strings.TrimSpace(os.Getenv(name)))
	if value == "" {
		return fallback, nil
	}
	switch value {
	case "1", "true", "yes":
		return true, nil
	case "0", "false", "no":
		return false, nil
	default:
		return false, fmt.Errorf("%s must be 1/0, true/false, or yes/no", name)
	}
}

func env(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func splitNonEmpty(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

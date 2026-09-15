package main

import (
	"context"
	"net"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/test/bufconn"

	telemetryv1 "github.com/D3S-Gaurav/Loom/services/telemetry/gen/telemetry/v1"
)

// startTestGRPC runs the real server over an in-memory listener, so these tests
// exercise the actual registration, streaming and shutdown paths rather than
// calling the handler struct directly.
func startTestGRPC(t *testing.T, stats *metrics, events *hub) *grpc.ClientConn {
	t.Helper()

	listener := bufconn.Listen(1024 * 1024)
	ctx, cancel := context.WithCancel(context.Background())

	served := make(chan error, 1)
	go func() { served <- serveGRPCOn(ctx, listener, stats, events) }()

	conn, err := grpc.NewClient("passthrough:///bufconn",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return listener.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		cancel()
		t.Fatalf("dial bufconn: %v", err)
	}

	t.Cleanup(func() {
		_ = conn.Close()
		cancel()
		select {
		case err := <-served:
			if err != nil {
				t.Errorf("gRPC server returned error: %v", err)
			}
		case <-time.After(5 * time.Second):
			t.Error("gRPC server did not shut down")
		}
	})

	return conn
}

func TestGetRunMetricsReportsConsumerCounters(t *testing.T) {
	stats := &metrics{}
	events := newHub()
	client := telemetryv1.NewTelemetryServiceClient(startTestGRPC(t, stats, events))

	if _, err := process([]byte(`{"version":1,"runId":"run-1","sequence":1,"occurredAt":42,"event":{"kind":"run.start"}}`), stats); err != nil {
		t.Fatalf("process returned error: %v", err)
	}
	stats.consumerUp.Store(true)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	response, err := client.GetRunMetrics(ctx, &telemetryv1.GetRunMetricsRequest{})
	if err != nil {
		t.Fatalf("GetRunMetrics: %v", err)
	}
	if !response.GetConsumerUp() || response.GetEventsConsumed() != 1 || response.GetRunsStarted() != 1 {
		t.Fatalf("unexpected metrics response: %+v", response)
	}
	if response.GetLastEventTimestampMs() != 42 {
		t.Fatalf("lastEventTimestampMs = %d, want 42", response.GetLastEventTimestampMs())
	}
}

func TestStreamRunEventsDeliversLiveEvent(t *testing.T) {
	stats := &metrics{}
	events := newHub()
	client := telemetryv1.NewTelemetryServiceClient(startTestGRPC(t, stats, events))

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	stream, err := client.StreamRunEvents(ctx, &telemetryv1.StreamRunEventsRequest{RunId: "run-1"})
	if err != nil {
		t.Fatalf("StreamRunEvents: %v", err)
	}

	// StreamRunEvents subscribes when the handler starts, which races the
	// client-side call returning. Publishing until the event lands keeps the
	// test deterministic without sleeping for a fixed interval.
	stop := make(chan struct{})
	defer close(stop)
	go func() {
		ticker := time.NewTicker(20 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-stop:
				return
			case <-ticker.C:
				events.publish(testEvent("other-run", 99))
				events.publish(testEvent("run-1", 7))
			}
		}
	}()

	received, err := stream.Recv()
	if err != nil {
		t.Fatalf("stream.Recv: %v", err)
	}
	if received.GetRunId() != "run-1" || received.GetSequence() != 7 {
		t.Fatalf("unexpected streamed event: %+v", received)
	}
	if received.GetPayloadJson() != `{"kind":"agent.token","delta":"hi"}` {
		t.Fatalf("payload JSON = %q, want the published event body", received.GetPayloadJson())
	}
}

func TestStreamRunEventsEndsWhenSubscriberIsEvicted(t *testing.T) {
	stats := &metrics{}
	events := newHub()
	client := telemetryv1.NewTelemetryServiceClient(startTestGRPC(t, stats, events))

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	stream, err := client.StreamRunEvents(ctx, &telemetryv1.StreamRunEventsRequest{})
	if err != nil {
		t.Fatalf("StreamRunEvents: %v", err)
	}

	// Wait for the handler to actually register before evicting it.
	deadline := time.Now().Add(5 * time.Second)
	for events.subscriberCount() == 0 {
		if time.Now().After(deadline) {
			t.Fatal("stream never registered a subscriber")
		}
		time.Sleep(10 * time.Millisecond)
	}

	events.closeAll()
	if _, err := stream.Recv(); err == nil {
		t.Fatal("expected the stream to end after its subscription closed")
	}
}

func TestHealthServiceIsRegistered(t *testing.T) {
	stats := &metrics{}
	stats.consumerUp.Store(true)
	events := newHub()
	healthClient := healthpb.NewHealthClient(startTestGRPC(t, stats, events))

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// trackConsumerHealth mirrors the Kafka flag on a ticker, so the first probe
	// can legitimately land before the status has been published.
	deadline := time.Now().Add(5 * time.Second)
	for {
		response, err := healthClient.Check(ctx, &healthpb.HealthCheckRequest{})
		if err == nil && response.GetStatus() == healthpb.HealthCheckResponse_SERVING {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("health never reported SERVING (last error: %v)", err)
		}
		time.Sleep(50 * time.Millisecond)
	}
}

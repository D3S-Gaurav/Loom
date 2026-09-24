package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/keepalive"
	"google.golang.org/grpc/reflection"
	"google.golang.org/grpc/status"

	telemetryv1 "github.com/D3S-Gaurav/Loom/services/telemetry/gen/telemetry/v1"
)

type telemetryServer struct {
	telemetryv1.UnimplementedTelemetryServiceServer
	stats *metrics
	hub   *hub
}

func (s *telemetryServer) GetRunMetrics(_ context.Context, _ *telemetryv1.GetRunMetricsRequest) (*telemetryv1.GetRunMetricsResponse, error) {
	return &telemetryv1.GetRunMetricsResponse{
		ConsumerUp:             s.stats.consumerUp.Load(),
		EventsConsumed:         s.stats.events.Load(),
		InvalidEvents:          s.stats.invalidEvents.Load(),
		RunsStarted:            s.stats.runsStarted.Load(),
		RunsCompleted:          s.stats.runsCompleted.Load(),
		RunErrors:              s.stats.runErrors.Load(),
		AgentSpawns:            s.stats.agentSpawns.Load(),
		TokenChunks:            s.stats.tokenChunks.Load(),
		LastEventTimestampMs:   s.stats.lastEventAt.Load(),
		StreamSubscribers:      s.hub.subscriberCount(),
		SlowSubscribersDropped: s.hub.droppedCount(),
	}, nil
}

func (s *telemetryServer) StreamRunEvents(req *telemetryv1.StreamRunEventsRequest, stream grpc.ServerStreamingServer[telemetryv1.RunEvent]) error {
	events, release := s.hub.subscribe(req.GetRunId())
	defer release()

	for {
		select {
		case <-stream.Context().Done():
			// The client hung up or its deadline expired. Returning here runs
			// release, which is the only thing that unregisters the subscriber.
			return status.FromContextError(stream.Context().Err()).Err()
		case event, open := <-events:
			if !open {
				// The hub closed the channel: either shutdown or this stream was
				// evicted for falling behind. Either way the client's view is now
				// incomplete, and a retryable code says so honestly.
				return status.Error(codes.Unavailable, "telemetry stream closed: subscriber fell behind or server is shutting down")
			}
			if err := stream.Send(event); err != nil {
				return err
			}
		}
	}
}

// serveGRPC runs the gRPC surface on address until ctx is cancelled.
func serveGRPC(ctx context.Context, address string, stats *metrics, events *hub) error {
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return err
	}
	slog.Info("telemetry gRPC server started", "address", address)
	return serveGRPCOn(ctx, listener, stats, events)
}

// serveGRPCOn is split out from serveGRPC so tests can drive the real server
// over an in-memory bufconn listener instead of binding a port.
//
// Health and reflection are registered because they are what makes the service
// operable: health for container probes and load balancers, reflection so
// grpcurl can call it with no .proto file in hand.
func serveGRPCOn(ctx context.Context, listener net.Listener, stats *metrics, events *hub) error {
	server := grpc.NewServer(
		// Without an enforcement policy a client that pings aggressively gets
		// its connection killed with GOAWAY; 15s matches what a browser-facing
		// proxy typically uses.
		grpc.KeepaliveEnforcementPolicy(keepalive.EnforcementPolicy{
			MinTime:             15 * time.Second,
			PermitWithoutStream: true,
		}),
		grpc.KeepaliveParams(keepalive.ServerParameters{
			Time:    30 * time.Second,
			Timeout: 10 * time.Second,
		}),
	)

	telemetryv1.RegisterTelemetryServiceServer(server, &telemetryServer{stats: stats, hub: events})

	healthServer := health.NewServer()
	healthpb.RegisterHealthServer(server, healthServer)
	go trackConsumerHealth(ctx, healthServer, stats)

	reflection.Register(server)

	go func() {
		<-ctx.Done()
		// GracefulStop waits for open RPCs, and every StreamRunEvents call is
		// open by definition, so the hub is closed first to make them return.
		events.closeAll()
		server.GracefulStop()
	}()

	if err := server.Serve(listener); err != nil && !errors.Is(err, grpc.ErrServerStopped) {
		return err
	}
	return nil
}

// trackConsumerHealth mirrors Kafka connectivity into the gRPC health service.
// The consumer flag is an atomic updated from the poll loop, so this polls it
// rather than threading a notification channel through the Kafka code.
func trackConsumerHealth(ctx context.Context, healthServer *health.Server, stats *metrics) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	last := healthpb.HealthCheckResponse_SERVICE_UNKNOWN
	for {
		next := healthpb.HealthCheckResponse_NOT_SERVING
		if stats.consumerUp.Load() {
			next = healthpb.HealthCheckResponse_SERVING
		}
		if next != last {
			healthServer.SetServingStatus(telemetryv1.TelemetryService_ServiceDesc.ServiceName, next)
			// The empty service name is the overall process status that probes
			// such as grpc_health_probe check by default.
			healthServer.SetServingStatus("", next)
			last = next
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

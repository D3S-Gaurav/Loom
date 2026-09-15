package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/coder/websocket"

	telemetryv1 "github.com/D3S-Gaurav/Loom/services/telemetry/gen/telemetry/v1"
)

const (
	// How often the server pings. A browser answers automatically; a peer whose
	// machine slept or whose network died never will, which is how dead
	// connections are reaped instead of accumulating goroutines and buffers.
	wsPingInterval = 20 * time.Second
	// Doubles as the read deadline: Ping blocks until the matching pong arrives
	// or this elapses, so a silent peer is closed within one interval.
	wsPongTimeout  = 10 * time.Second
	wsWriteTimeout = 5 * time.Second
)

// wsFrame is the JSON shape pushed to browsers. It deliberately mirrors the
// Kafka envelope rather than the protobuf message, so a browser client reads
// the same field names it already gets over SSE from the Next.js app.
type wsFrame struct {
	Version    int32           `json:"version"`
	RunID      string          `json:"runId"`
	Sequence   int64           `json:"sequence"`
	OccurredAt int64           `json:"occurredAt"`
	Kind       string          `json:"kind"`
	Event      json.RawMessage `json:"event,omitempty"`
}

// websocketHandler streams live swarm events to browsers.
//
// This lives in the Go service rather than in Next.js on purpose: Vercel's
// serverless functions cannot hold a long-lived socket open, and this process
// already owns the Kafka consumer the socket needs to read from.
func websocketHandler(ctx context.Context, events *hub, allowedOrigins []string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !originAllowed(r, allowedOrigins) {
			// A WebSocket handshake is a plain GET, so it is not covered by the
			// browser's CORS preflight; the origin check has to happen here or
			// any page on the internet could open this socket.
			http.Error(w, "origin not allowed", http.StatusForbidden)
			return
		}

		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			// The allowlist above already matched the full origin including
			// scheme. OriginPatterns only compares hosts, so it would be the
			// weaker of the two checks; "*" defers to ours rather than adding a
			// second, laxer one.
			OriginPatterns: []string{"*"},
		})
		if err != nil {
			slog.Warn("websocket handshake failed", "error", err)
			return
		}
		defer conn.CloseNow()

		runID := strings.TrimSpace(r.URL.Query().Get("runId"))
		stream, release := events.subscribe(runID)
		defer release()

		// Tie the connection to process shutdown as well as to the request, so
		// SIGTERM closes sockets instead of waiting for peers to notice.
		requestCtx, cancel := context.WithCancel(r.Context())
		defer cancel()
		go func() {
			select {
			case <-ctx.Done():
				cancel()
			case <-requestCtx.Done():
			}
		}()

		// CloseRead runs the read loop that processes pong and close frames, and
		// gives back a context cancelled the moment the peer goes away. Nothing
		// here expects client messages, so discarding reads is correct.
		connCtx := conn.CloseRead(requestCtx)

		ticker := time.NewTicker(wsPingInterval)
		defer ticker.Stop()

		for {
			select {
			case <-connCtx.Done():
				return
			case <-ticker.C:
				pingCtx, cancelPing := context.WithTimeout(connCtx, wsPongTimeout)
				err := conn.Ping(pingCtx)
				cancelPing()
				if err != nil {
					conn.Close(websocket.StatusPolicyViolation, "keepalive timeout")
					return
				}
			case event, open := <-stream:
				if !open {
					// The hub evicted this subscriber for falling behind, or the
					// process is shutting down. Say which with the close code so
					// the client knows whether reconnecting will help.
					conn.Close(websocket.StatusTryAgainLater, "subscriber fell behind")
					return
				}
				if err := writeFrame(connCtx, conn, event); err != nil {
					slog.Debug("websocket write failed", "runId", runID, "error", err)
					return
				}
			}
		}
	}
}

func writeFrame(ctx context.Context, conn *websocket.Conn, event *telemetryv1.RunEvent) error {
	frame := wsFrame{
		Version:    event.GetVersion(),
		RunID:      event.GetRunId(),
		Sequence:   event.GetSequence(),
		OccurredAt: event.GetOccurredAtMs(),
		Kind:       event.GetKind(),
	}
	if payload := event.GetPayloadJson(); payload != "" {
		frame.Event = json.RawMessage(payload)
	}
	encoded, err := json.Marshal(frame)
	if err != nil {
		return err
	}

	// A bounded write deadline is the other half of the backpressure story: the
	// hub stops this goroutine from blocking the Kafka loop, and this stops a
	// stalled TCP send from blocking the goroutine forever.
	writeCtx, cancel := context.WithTimeout(ctx, wsWriteTimeout)
	defer cancel()
	return conn.Write(writeCtx, websocket.MessageText, encoded)
}

// originAllowed enforces TELEMETRY_WS_ALLOWED_ORIGINS. Non-browser clients
// (websocat, a Go service) send no Origin header at all and are allowed: the
// header exists to protect users whose browser attaches their cookies, and
// there are no cookies on this endpoint to steal.
func originAllowed(r *http.Request, allowed []string) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return true
	}
	for _, candidate := range allowed {
		if strings.EqualFold(candidate, origin) {
			return true
		}
	}
	return false
}

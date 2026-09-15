package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func newWSServer(t *testing.T, events *hub, origins []string) *httptest.Server {
	t.Helper()

	ctx, cancel := context.WithCancel(context.Background())
	server := httptest.NewServer(routes(ctx, &metrics{}, events, origins))
	t.Cleanup(func() {
		cancel()
		server.Close()
	})
	return server
}

func wsURL(server *httptest.Server, path string) string {
	return "ws" + server.URL[len("http"):] + path
}

func TestWebSocketPushesLiveEvent(t *testing.T) {
	events := newHub()
	server := newWSServer(t, events, []string{"http://localhost:3000"})

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(ctx, wsURL(server, "/ws?runId=run-1"), &websocket.DialOptions{
		HTTPHeader: http.Header{"Origin": []string{"http://localhost:3000"}},
	})
	if err != nil {
		t.Fatalf("websocket dial: %v", err)
	}
	defer conn.CloseNow()

	// The handler subscribes after the handshake returns, so publish until the
	// frame arrives rather than racing a single publish against registration.
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
				events.publish(testEvent("run-2", 1))
				events.publish(testEvent("run-1", 5))
			}
		}
	}()

	messageType, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("websocket read: %v", err)
	}
	if messageType != websocket.MessageText {
		t.Fatalf("message type = %v, want text", messageType)
	}

	var frame struct {
		Version    int32  `json:"version"`
		RunID      string `json:"runId"`
		Sequence   int64  `json:"sequence"`
		OccurredAt int64  `json:"occurredAt"`
		Kind       string `json:"kind"`
		Event      struct {
			Kind  string `json:"kind"`
			Delta string `json:"delta"`
		} `json:"event"`
	}
	if err := json.Unmarshal(payload, &frame); err != nil {
		t.Fatalf("decode frame %q: %v", payload, err)
	}
	if frame.RunID != "run-1" || frame.Sequence != 5 || frame.Kind != "agent.token" {
		t.Fatalf("unexpected frame: %+v", frame)
	}
	if frame.Event.Delta != "hi" {
		t.Fatalf("frame carried no event body: %+v", frame.Event)
	}
}

func TestWebSocketRejectsDisallowedOrigin(t *testing.T) {
	server := newWSServer(t, newHub(), []string{"http://localhost:3000"})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, response, err := websocket.Dial(ctx, wsURL(server, "/ws"), &websocket.DialOptions{
		HTTPHeader: http.Header{"Origin": []string{"https://evil.example.com"}},
	})
	if err == nil {
		conn.CloseNow()
		t.Fatal("handshake succeeded for a disallowed origin")
	}
	if response == nil || response.StatusCode != http.StatusForbidden {
		t.Fatalf("status = %v, want 403", response)
	}
}

func TestWebSocketClosesWhenSubscriberIsEvicted(t *testing.T) {
	events := newHub()
	server := newWSServer(t, events, nil)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// No Origin header: a non-browser client, which the allowlist permits.
	conn, _, err := websocket.Dial(ctx, wsURL(server, "/ws"), nil)
	if err != nil {
		t.Fatalf("websocket dial: %v", err)
	}
	defer conn.CloseNow()

	deadline := time.Now().Add(5 * time.Second)
	for events.subscriberCount() == 0 {
		if time.Now().After(deadline) {
			t.Fatal("websocket never registered a subscriber")
		}
		time.Sleep(10 * time.Millisecond)
	}

	events.closeAll()
	if _, _, err := conn.Read(ctx); err == nil {
		t.Fatal("expected the socket to close after its subscription ended")
	}
}

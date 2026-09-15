package main

import (
	"log/slog"
	"sync"
	"sync/atomic"

	telemetryv1 "github.com/D3S-Gaurav/Loom/services/telemetry/gen/telemetry/v1"
)

// subscriberBuffer is how many events a single subscriber may fall behind by
// before it is evicted. It is sized for a browser tab that pauses for a moment
// during a garbage collection or a tab switch, not for one that has silently
// died — those are what the eviction below exists to remove.
const subscriberBuffer = 256

type subscriber struct {
	// runID narrows the subscription. Empty means every run.
	runID  string
	events chan *telemetryv1.RunEvent
}

// hub fans one Kafka consumer out to every gRPC stream and WebSocket client.
//
// The invariant that matters: publish must never block. The only caller is the
// Kafka poll loop, and a blocked poll loop stops committing offsets, stalls the
// consumer group, and eventually triggers a rebalance — one stuck browser tab
// would take down telemetry for everybody. So each subscriber gets its own
// buffered channel and a subscriber that fills it is dropped, not waited on.
type hub struct {
	mu          sync.Mutex
	nextID      uint64
	subscribers map[uint64]*subscriber

	// Read from /metrics and GetRunMetrics, so they are atomics rather than
	// values guarded by mu; readers must not contend with the publish path.
	active  atomic.Int64
	dropped atomic.Int64
}

func newHub() *hub {
	return &hub{subscribers: make(map[uint64]*subscriber)}
}

// subscribe registers a listener and returns its event channel plus a release
// function. The channel is closed exactly once — either by release or by an
// eviction in publish — so a receiver can treat a closed channel as "this
// subscription is over" without a second signal.
func (h *hub) subscribe(runID string) (<-chan *telemetryv1.RunEvent, func()) {
	sub := &subscriber{runID: runID, events: make(chan *telemetryv1.RunEvent, subscriberBuffer)}

	h.mu.Lock()
	h.nextID++
	id := h.nextID
	h.subscribers[id] = sub
	h.active.Store(int64(len(h.subscribers)))
	h.mu.Unlock()

	var once sync.Once
	return sub.events, func() {
		once.Do(func() {
			h.mu.Lock()
			if _, stillRegistered := h.subscribers[id]; stillRegistered {
				delete(h.subscribers, id)
				h.active.Store(int64(len(h.subscribers)))
				close(sub.events)
			}
			h.mu.Unlock()
		})
	}
}

// publish delivers an event to every matching subscriber without ever blocking.
// Holding mu across the sends is safe precisely because every send is
// non-blocking: the critical section is bounded by the subscriber count, not by
// how fast the slowest client reads.
func (h *hub) publish(event *telemetryv1.RunEvent) {
	h.mu.Lock()
	defer h.mu.Unlock()

	for id, sub := range h.subscribers {
		if sub.runID != "" && sub.runID != event.GetRunId() {
			continue
		}
		select {
		case sub.events <- event:
		default:
			// Buffer full: this consumer is not keeping up. Evict it rather than
			// dropping single events, so the client learns its stream is
			// incomplete instead of silently missing sequence numbers.
			delete(h.subscribers, id)
			close(sub.events)
			h.dropped.Add(1)
			h.active.Store(int64(len(h.subscribers)))
			slog.Warn("dropped slow telemetry subscriber", "runId", sub.runID, "buffer", subscriberBuffer)
		}
	}
}

// closeAll ends every subscription, used on shutdown so in-flight gRPC streams
// and WebSocket writers return instead of leaking until their peers time out.
func (h *hub) closeAll() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for id, sub := range h.subscribers {
		delete(h.subscribers, id)
		close(sub.events)
	}
	h.active.Store(0)
}

func (h *hub) subscriberCount() int64 { return h.active.Load() }

func (h *hub) droppedCount() int64 { return h.dropped.Load() }

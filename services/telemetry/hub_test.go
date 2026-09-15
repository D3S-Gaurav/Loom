package main

import (
	"testing"
	"time"

	telemetryv1 "github.com/D3S-Gaurav/Loom/services/telemetry/gen/telemetry/v1"
)

func testEvent(runID string, sequence int64) *telemetryv1.RunEvent {
	return &telemetryv1.RunEvent{
		Version:      1,
		RunId:        runID,
		Sequence:     sequence,
		OccurredAtMs: 1,
		Kind:         "agent.token",
		PayloadJson:  `{"kind":"agent.token","delta":"hi"}`,
	}
}

func TestHubFiltersBySubscribedRun(t *testing.T) {
	events := newHub()
	stream, release := events.subscribe("run-a")
	defer release()

	events.publish(testEvent("run-b", 1))
	events.publish(testEvent("run-a", 2))

	select {
	case got := <-stream:
		if got.GetRunId() != "run-a" {
			t.Fatalf("received event for %q, want run-a only", got.GetRunId())
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for the filtered event")
	}
}

// The behaviour this asserts is the whole reason the hub exists: one client that
// stops reading must not slow down or silence any other client, and must not
// leave the Kafka poll loop waiting on it.
func TestHubDropsSlowSubscriberWithoutStallingOthers(t *testing.T) {
	events := newHub()

	slow, releaseSlow := events.subscribe("")
	defer releaseSlow()
	fast, releaseFast := events.subscribe("")
	defer releaseFast()

	// The fast subscriber drains continuously; the slow one never reads.
	received := make(chan int64, subscriberBuffer*4)
	go func() {
		for event := range fast {
			received <- event.GetSequence()
		}
	}()

	published := int64(subscriberBuffer * 3)
	done := make(chan struct{})
	go func() {
		for i := int64(1); i <= published; i++ {
			events.publish(testEvent("run-a", i))
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("publish blocked on a subscriber that stopped reading")
	}

	if got := events.droppedCount(); got != 1 {
		t.Fatalf("droppedCount = %d, want exactly the one slow subscriber", got)
	}
	if got := events.subscriberCount(); got != 1 {
		t.Fatalf("subscriberCount = %d, want the fast subscriber still attached", got)
	}

	// Eviction closes the channel, but the buffered events it never read are
	// still queued ahead of that signal, so drain before checking for the close.
	drained := 0
	for range slow {
		drained++
	}
	if drained != subscriberBuffer {
		t.Fatalf("slow subscriber buffered %d events, want the full %d before eviction", drained, subscriberBuffer)
	}

	// The fast subscriber must have seen the last event published after the
	// eviction, proving the drop did not cost it anything.
	deadline := time.After(2 * time.Second)
	for {
		select {
		case sequence := <-received:
			if sequence == published {
				return
			}
		case <-deadline:
			t.Fatal("fast subscriber never received the final event")
		}
	}
}

func TestHubReleaseIsIdempotentAndUnregisters(t *testing.T) {
	events := newHub()
	stream, release := events.subscribe("")
	if got := events.subscriberCount(); got != 1 {
		t.Fatalf("subscriberCount = %d, want 1", got)
	}

	release()
	release() // A double release must not panic on an already-closed channel.

	if _, open := <-stream; open {
		t.Fatal("channel should be closed after release")
	}
	if got := events.subscriberCount(); got != 0 {
		t.Fatalf("subscriberCount = %d, want 0 after release", got)
	}

	// Publishing to nobody must stay safe.
	events.publish(testEvent("run-a", 1))
}

func TestHubCloseAllEndsEverySubscription(t *testing.T) {
	events := newHub()
	first, releaseFirst := events.subscribe("")
	defer releaseFirst()
	second, releaseSecond := events.subscribe("run-a")
	defer releaseSecond()

	events.closeAll()

	for name, stream := range map[string]<-chan *telemetryv1.RunEvent{"first": first, "second": second} {
		if _, open := <-stream; open {
			t.Fatalf("%s subscriber was not closed by closeAll", name)
		}
	}
	if got := events.subscriberCount(); got != 0 {
		t.Fatalf("subscriberCount = %d, want 0 after closeAll", got)
	}
}

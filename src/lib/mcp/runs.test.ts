import { beforeEach, describe, expect, it, vi } from "vitest";

const sessions = vi.hoisted(() => ({
  getRunSession: vi.fn(),
  listRunSessions: vi.fn(),
}));

vi.mock("../swarm/session", () => sessions);

import { getOwnedFinalDeliverable, listOwnedRuns } from "./runs";

describe("MCP run access", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists only the runs returned for the authenticated owner", async () => {
    sessions.listRunSessions.mockResolvedValue([
      {
        runId: "11111111-1111-4111-8111-111111111111",
        ownerId: "user-a",
        status: "completed",
        goal: "Ship the launch plan",
        eventCount: 4,
        final: "# Launch plan",
      },
    ]);

    await expect(listOwnedRuns("user-a", 10)).resolves.toEqual([
      expect.objectContaining({ goal: "Ship the launch plan", hasFinalDeliverable: true }),
    ]);
    expect(sessions.listRunSessions).toHaveBeenCalledWith("user-a", 10);
  });

  it("does not reveal a final deliverable owned by another user", async () => {
    sessions.getRunSession.mockResolvedValue({
      runId: "22222222-2222-4222-8222-222222222222",
      ownerId: "user-b",
      status: "completed",
      eventCount: 4,
      final: "private result",
    });

    await expect(
      getOwnedFinalDeliverable("user-a", "22222222-2222-4222-8222-222222222222"),
    ).resolves.toBeNull();
  });
});

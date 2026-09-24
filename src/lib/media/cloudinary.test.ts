import { afterEach, describe, expect, it, vi } from "vitest";

const { upload, config } = vi.hoisted(() => ({
  upload: vi.fn(),
  config: vi.fn(),
}));

vi.mock("cloudinary", () => ({
  v2: { config, uploader: { upload } },
}));

import {
  ImageStorageUnavailableError,
  isImageStorageConfigured,
  storeSwarmImage,
} from "./cloudinary";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("Cloudinary swarm image storage", () => {
  it("fails closed when server credentials are incomplete", async () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "demo");
    expect(isImageStorageConfigured()).toBe(false);
    await expect(
      storeSwarmImage({ dataUrl: "data:image/png;base64,YQ==", ownerId: "user", runId: "run" }),
    ).rejects.toBeInstanceOf(ImageStorageUnavailableError);
  });

  it("stores images as authenticated assets in an owner-scoped run folder", async () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "demo");
    vi.stubEnv("CLOUDINARY_API_KEY", "key");
    vi.stubEnv("CLOUDINARY_API_SECRET", "secret");
    upload.mockResolvedValue({
      asset_id: "asset",
      public_id: "loom/run-context/hash/run/id",
      version: 1,
      format: "png",
      bytes: 128,
    });

    await expect(
      storeSwarmImage({ dataUrl: "data:image/png;base64,YQ==", ownerId: "user", runId: "run" }),
    ).resolves.toMatchObject({ assetId: "asset", format: "png", bytes: 128 });

    expect(config).toHaveBeenCalledWith(expect.objectContaining({ cloud_name: "demo", secure: true }));
    expect(upload).toHaveBeenCalledWith(
      "data:image/png;base64,YQ==",
      expect.objectContaining({
        resource_type: "image",
        type: "authenticated",
        folder: expect.stringMatching(/^loom\/run-context\/[a-f0-9]{16}\/run$/),
        overwrite: false,
      }),
    );
  });
});

import { createHash } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";

export interface StoredSwarmImage {
  assetId: string;
  publicId: string;
  version: number;
  format: string;
  bytes: number;
}

export class ImageStorageUnavailableError extends Error {
  constructor(message = "Image storage is not configured.") {
    super(message);
    this.name = "ImageStorageUnavailableError";
  }
}

function configuration() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) throw new ImageStorageUnavailableError();
  return { cloudName, apiKey, apiSecret };
}

export function isImageStorageConfigured() {
  try {
    configuration();
    return true;
  } catch {
    return false;
  }
}

/** Stores validated run context as an authenticated Cloudinary asset. */
export async function storeSwarmImage(input: {
  dataUrl: string;
  ownerId: string;
  runId: string;
}): Promise<StoredSwarmImage> {
  const config = configuration();
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    hide_sensitive: true,
    secure: true,
  });

  const ownerHash = createHash("sha256").update(input.ownerId).digest("hex").slice(0, 16);
  try {
    const stored = await cloudinary.uploader.upload(input.dataUrl, {
      resource_type: "image",
      type: "authenticated",
      folder: `loom/run-context/${ownerHash}/${input.runId}`,
      tags: ["loom", "run-context"],
      unique_filename: true,
      use_filename: false,
      overwrite: false,
      timeout: 15_000,
    });
    return {
      assetId: stored.asset_id,
      publicId: stored.public_id,
      version: stored.version,
      format: stored.format,
      bytes: stored.bytes,
    };
  } catch (error) {
    console.error("Cloudinary image storage failed", error);
    throw new ImageStorageUnavailableError("Loom could not store the attached image.");
  }
}

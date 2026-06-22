// Shared R2 client + bucket config for the upload/sync scripts.
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import "dotenv/config";

const required = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    console.error("Copy .env.example to .env and fill in the values.");
    process.exit(1);
  }
}

export const BUCKET = process.env.R2_BUCKET;
export const PREFIX = "cards/"; // full bordered card: cards/{id}.jpg
export const CROPPED_PREFIX = "cards_cropped/"; // borderless artwork: cards_cropped/{id}.jpg

export const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/**
 * List every key already in the bucket under the given prefix (defaults to PREFIX).
 * Returns a Set of full keys like "cards/89943723.jpg" or "cards_cropped/89943723.jpg".
 */
export async function listExistingKeys(prefix = PREFIX) {
  const keys = new Set();
  let ContinuationToken;
  do {
    const out = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken })
    );
    for (const obj of out.Contents ?? []) keys.add(obj.Key);
    ContinuationToken = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return keys;
}

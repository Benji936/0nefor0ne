// One-time script: upload every JPEG already in src/assets/Cards/ to R2.
// Safe to re-run — it skips files that are already in the bucket.
//
// Usage:
//   npm run cards:bulk-upload

import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3, BUCKET, PREFIX, listExistingKeys } from "./_client.mjs";

const LOCAL_DIR = resolve(process.cwd(), "src/assets/Cards");
const CONCURRENCY = 10;

async function main() {
  // Sanity-check the source folder.
  try {
    const s = await stat(LOCAL_DIR);
    if (!s.isDirectory()) throw new Error("not a directory");
  } catch {
    console.error(`Source folder not found: ${LOCAL_DIR}`);
    process.exit(1);
  }

  const files = (await readdir(LOCAL_DIR)).filter((f) => f.endsWith(".jpg"));
  console.log(`Found ${files.length} local images.`);

  console.log("Listing existing R2 keys…");
  const existing = await listExistingKeys();
  console.log(`R2 already has ${existing.size} cards.`);

  const todo = files.filter((f) => !existing.has(`${PREFIX}${f}`));
  console.log(`${todo.length} files to upload.`);

  let done = 0;
  let failed = 0;

  async function uploadOne(filename) {
    const localPath = join(LOCAL_DIR, filename);
    try {
      const body = await readFile(localPath);
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: `${PREFIX}${filename}`,
          Body: body,
          ContentType: "image/jpeg",
          // Card images never change, so cache aggressively at the edge + browser.
          CacheControl: "public, max-age=31536000, immutable",
        })
      );
      done++;
      if (done % 50 === 0) {
        console.log(`Uploaded ${done}/${todo.length}…`);
      }
    } catch (err) {
      failed++;
      console.error(`Failed ${filename}: ${err.message}`);
    }
  }

  // Simple concurrency: run N workers in parallel pulling from a shared queue.
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const f = queue.shift();
        if (f) await uploadOne(f);
      }
    })
  );

  console.log(`\nDone. Uploaded ${done}, failed ${failed}.`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

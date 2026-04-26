// Recurring sync: fetch the YGOPRODeck card list, find cards missing from R2,
// download them from images.ygoprodeck.com, and upload to R2.
//
// Usage:
//   npm run cards:sync
//
// YGOPRODeck rate-limits images.ygoprodeck.com. We throttle to small batches
// with a delay between them — well under their ~20 requests/second cap.

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3, BUCKET, PREFIX, listExistingKeys } from "./_client.mjs";

const API_URL = "https://db.ygoprodeck.com/api/v7/cardinfo.php";
const BATCH_SIZE = 5;
const DELAY_MS = 1000; // pause between batches

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchCardList() {
  console.log("Fetching card list from YGOPRODeck…");
  const r = await fetch(API_URL);
  if (!r.ok) throw new Error(`YGOPRODeck API returned ${r.status}`);
  const j = await r.json();
  return j.data;
}

/**
 * Yu-Gi-Oh cards can have multiple printings (alt arts) — each gets its own id
 * inside card.card_images. We upload every one of them so the frontend can
 * reference any printing id and find an image.
 */
function buildImageList(cards) {
  const pairs = [];
  for (const card of cards) {
    for (const img of card.card_images ?? []) {
      pairs.push({ id: img.id, url: img.image_url });
    }
  }
  return pairs;
}

async function uploadOne({ id, url }) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url} → ${r.status}`);
  const buffer = Buffer.from(await r.arrayBuffer());
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: `${PREFIX}${id}.jpg`,
      Body: buffer,
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
}

async function main() {
  const [existing, cards] = await Promise.all([listExistingKeys(), fetchCardList()]);
  console.log(`R2 has ${existing.size} cards. API reports ${cards.length} unique cards.`);

  const all = buildImageList(cards);
  const missing = all.filter(({ id }) => !existing.has(`${PREFIX}${id}.jpg`));
  console.log(`${missing.length} new images to upload.`);

  if (missing.length === 0) {
    console.log("Already up to date.");
    return;
  }

  let done = 0;
  let failed = 0;

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (item) => {
        try {
          await uploadOne(item);
          done++;
        } catch (err) {
          failed++;
          console.error(`Failed ${item.id}: ${err.message}`);
        }
      })
    );
    console.log(`Progress: ${done + failed}/${missing.length}`);
    if (i + BATCH_SIZE < missing.length) await sleep(DELAY_MS);
  }

  console.log(`\nDone. Uploaded ${done}, failed ${failed}.`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

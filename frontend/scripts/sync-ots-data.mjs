// Copies the canonical scraped OTS data (repo-root /data) into public/data so
// Vite serves it at /data/stores.json and /data/events.json. Runs on predev and
// prebuild; the copies are gitignored (single source of truth = repo-root /data).
import { copyFile, mkdir, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoData = resolve(__dirname, "../../data");
const outDir = resolve(__dirname, "../public/data");

const FILES = ["stores.json", "events.json"];

async function main() {
  await mkdir(outDir, { recursive: true });
  for (const name of FILES) {
    const src = resolve(repoData, name);
    try {
      await access(src);
    } catch {
      console.warn(`[sync-ots-data] source missing, skipping: ${src}`);
      continue;
    }
    await copyFile(src, resolve(outDir, name));
    console.log(`[sync-ots-data] copied ${name}`);
  }
}

main().catch((err) => {
  console.error("[sync-ots-data] failed:", err);
  process.exit(1);
});

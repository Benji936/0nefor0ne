import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

describe("CardPage explains the visible Cardmarket value", () => {
  it("labels unavailable printings instead of leaving a finished row blank", () => {
    const page = read("../components/Pages/App/CardPage.vue");
    expect(page).toMatch(/v-else[^>]*class="cx__print-unavailable"[^>]*>\s*\{\{\s*\$t\('price\.unavailable'\)/s);
  });

  it("puts the selected Cardmarket metric on the rendered price", () => {
    const price = read("../components/trade/CardPrice.vue");
    expect(price).toMatch(/:title="metricHint"/);
    expect(price).toMatch(/price\.trendMetric/);
    expect(price).toMatch(/price\.lowMetric/);
  });
});

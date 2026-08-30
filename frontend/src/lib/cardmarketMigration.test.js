import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migrationsDir = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));

describe("the shared card price RPC uses the public display ladder", () => {
  it("selects trend, then low, and never a rolling average", () => {
    const files = readdirSync(migrationsDir)
      .filter((name) => name.endsWith("_card_prices_trend_low.sql"));

    expect(files, "generate the trend-to-low card_prices migration").toHaveLength(1);

    const sql = readFileSync(`${migrationsDir}/${files[0]}`, "utf8");
    expect(sql).toMatch(/coalesce\(trend,\s*low\)/i);
    expect(sql).not.toMatch(/coalesce\(trend,\s*avg7|coalesce\(trend,\s*avg30/i);
  });
});

describe("Cardmarket name matching tolerates decorative stars", () => {
  it("uses one narrow name key in set, name-only, and audit matching", () => {
    const files = readdirSync(migrationsDir)
      .filter((name) => name.endsWith("_cardmarket_name_symbols.sql"));

    expect(files, "generate the decorative-symbol name migration").toHaveLength(1);

    const sql = readFileSync(`${migrationsDir}/${files[0]}`, "utf8");
    expect(sql).toMatch(/function public\.cardmarket_name_key/i);
    expect(sql).toMatch(/function public\.cardmarket_metacards_by_name/i);
    expect(sql).toMatch(/replace\([^;]+?'☆'[^;]+?'★'/is);
    expect(sql).toMatch(/cardmarket_name_key\(p\.name\)\s*=\s*s\.name_key/i);
    expect(sql).toMatch(/cardmarket_name_key\(p\.name\)\s*=\s*cardmarket_name_key\(c\.name\)/i);
    expect(sql).not.toMatch(/cardmarket_name_key[\s\S]*?regexp_replace\([^;]+\[\^a-z0-9\]/i);
  });
});

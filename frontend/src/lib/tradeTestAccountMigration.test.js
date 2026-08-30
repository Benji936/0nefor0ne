import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationsDir = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));

describe("test-account trade access", () => {
  it("accepts only an admin-controlled app-metadata bypass", () => {
    const files = readdirSync(migrationsDir)
      .filter((name) => name.endsWith("_trade_test_account_bypass.sql"));

    expect(files, "create the test-account trade bypass migration").toHaveLength(1);

    const sql = readFileSync(`${migrationsDir}/${files[0]}`, "utf8");
    expect(sql).toMatch(/phone_confirmed_at\s+is\s+not\s+null/i);
    expect(sql).toMatch(/raw_app_meta_data\s*->>\s*'trade_phone_bypass'/i);
    expect(sql).not.toMatch(/raw_user_meta_data/i);
  });
});

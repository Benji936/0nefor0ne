import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const mainCss = readFileSync(
  fileURLToPath(new URL("../assets/main.css", import.meta.url)),
  "utf8",
);

describe("Tailwind source detection", () => {
  it("only scans application source files, not Vite-SSG temporary output", () => {
    expect(mainCss).toMatch(/@import\s+["']tailwindcss["']\s+source\(none\);/);
    expect(mainCss).toMatch(/@source\s+["']\.\.\/["'];/);
  });
});

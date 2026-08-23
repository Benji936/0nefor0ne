import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The guard that should have existed before a four-language dialog started
 * speaking English.
 *
 * CreateAnnounceDialog hardcoded seven strings. Three of them — "No card
 * found.", "Search failed. Try again." and the set-code placeholder — already
 * existed as keys, already translated into all four languages, and were already
 * being used by the sibling dialog twenty files away. A German user searching
 * for a card to attach to their post got the failure in English while the
 * German string sat in the same repository.
 *
 * Two rules catch that class of bug. Every locale carries the same keys, so a
 * key added to one is added to all four. And the surfaces below hold no
 * user-facing English of their own, so a string can only reach the screen by
 * going through the locale files first.
 */

const url = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel) => readFileSync(url(rel), "utf8");
const LOCALES = readdirSync(url("../locales")).filter((f) => f.endsWith(".json")).sort();

const leaves = (obj, path = "") =>
  Object.entries(obj).flatMap(([k, v]) => {
    const next = path ? `${path}.${k}` : k;
    return v && typeof v === "object" && !Array.isArray(v) ? leaves(v, next) : [next];
  });

describe("every language says the same things", () => {
  const keysOf = (f) => new Set(leaves(JSON.parse(read(`../locales/${f}`))));
  const en = keysOf("en.json");

  it("ships four locales", () => {
    expect(LOCALES).toEqual(["de.json", "en.json", "fr.json", "it.json"]);
  });

  it.each(LOCALES.filter((f) => f !== "en.json"))("%s carries exactly the keys en.json does", (f) => {
    const other = keysOf(f);
    expect([...en].filter((k) => !other.has(k)), `missing from ${f}`).toEqual([]);
    expect([...other].filter((k) => !en.has(k)), `absent from en.json`).toEqual([]);
  });
});

describe("the announce form and the support page hold no English of their own", () => {
  // Only the surfaces this rule has been applied to. Adding a file here is a
  // commitment to keep it clean, not a claim about the rest of the app.
  const SURFACES = [
    "../components/trade/CreateAnnounceDialog.vue",
    "../components/Pages/App/BuiltWithPage.vue",
    "../components/support/SupportToolCard.vue",
  ];

  // A word of three or more letters that is not a binding, an entity, a unit or
  // a currency code — i.e. something a reader would notice was in the wrong
  // language.
  const strayText = (tpl) => {
    const out = [];
    for (const m of tpl.matchAll(/>([^<>{}]*[A-Za-z]{3}[^<>{}]*)</g)) {
      const s = m[1].trim();
      if (!s || /^(EUR|USD|GBP)\b/.test(s)) continue;
      out.push(s);
    }
    for (const m of tpl.matchAll(/\s(?:placeholder|title|alt|aria-label)="([^"{}]*[A-Za-z]{3}[^"{}]*)"/g)) {
      out.push(m[1].trim());
    }
    return out;
  };

  it.each(SURFACES)("%s renders no literal English", (rel) => {
    const src = read(rel);
    const tpl = src.slice(src.indexOf("<template>"), src.indexOf("<style"));
    expect(strayText(tpl), "route it through the locale files").toEqual([]);
  });

  // The other half: a message assembled in script and handed to the template.
  it("CreateAnnounceDialog builds no English error messages", () => {
    const src = read("../components/trade/CreateAnnounceDialog.vue");
    const script = src.slice(0, src.indexOf("<template>"));
    const literals = [...script.matchAll(/=\s*"([A-Z][a-z]+(?:\s+\w+){2,}[.!?])"/g)].map((m) => m[1]);
    expect(literals, "an error the user reads is a translated string").toEqual([]);
  });
});

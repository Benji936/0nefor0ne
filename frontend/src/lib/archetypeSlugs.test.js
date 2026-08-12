import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ARCHETYPES, ARCHETYPE_BY_SLUG } from "@/data/archetype-slugs.js";

// These slugs are live URLs under /en/archetype/, submitted in sitemap.xml and
// linked from every card page in the archetype. The generator is run by hand, so
// nothing else would catch a bad regeneration before it shipped.
describe("archetype slugs", () => {
  it("covers every archetype in archetype-art.json", () => {
    const art = JSON.parse(
      readFileSync(resolve(__dirname, "../../public/archetype-art.json"), "utf8"),
    );
    expect(ARCHETYPES).toHaveLength(Object.keys(art).length);
    for (const { name, artId } of ARCHETYPES) {
      expect(art[name]).toBe(artId);
    }
  });

  it("gives every archetype a unique slug", () => {
    const slugs = ARCHETYPES.map(a => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  // A slug that needs percent-encoding produces a URL that does not survive
  // being copied, shared, or written to disk as a directory name. Four archetype
  // names contain characters that would do exactly that: "C", @Ignister,
  // /Assault Mode and D/D.
  it("keeps every slug URL-safe and lowercase", () => {
    for (const { slug, name } of ARCHETYPES) {
      expect(slug, `slug for ${JSON.stringify(name)}`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(encodeURIComponent(slug)).toBe(slug);
    }
  });

  // D.D. and D/D are different archetypes that a naive slugifier collapses onto
  // "d-d". Dropping "." rather than hyphenating it is what separates them.
  it("distinguishes D.D. from D/D", () => {
    expect(ARCHETYPE_BY_SLUG.get("dd")?.name).toBe("D.D.");
    expect(ARCHETYPE_BY_SLUG.get("d-d")?.name).toBe("D/D");
  });

  // Case-only pairs (roid/Roid, sphinx/Sphinx, tellarknight/Tellarknight) cannot
  // be told apart by a lowercase slug, so the second one is numbered. Both must
  // still resolve, or one archetype silently loses its page.
  it("resolves both halves of a case-only collision", () => {
    expect(ARCHETYPE_BY_SLUG.get("roid")?.name).toBe("Roid");
    expect(ARCHETYPE_BY_SLUG.get("roid-2")?.name).toBe("roid");
    expect(ARCHETYPE_BY_SLUG.get("tellarknight")?.name).toBe("Tellarknight");
    expect(ARCHETYPE_BY_SLUG.get("tellarknight-2")?.name).toBe("tellarknight");
  });

  it("indexes every entry in ARCHETYPE_BY_SLUG", () => {
    expect(ARCHETYPE_BY_SLUG.size).toBe(ARCHETYPES.length);
    for (const a of ARCHETYPES) {
      expect(ARCHETYPE_BY_SLUG.get(a.slug)).toBe(a);
    }
  });
});

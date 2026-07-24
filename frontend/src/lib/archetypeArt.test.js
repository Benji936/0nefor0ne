import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  archetypeArtManifest,
  archetypeArtId,
  archetypeArtUrl,
} from "./archetypeArt";

// Real passcodes, so the fixture and the generated manifest agree:
// The First Darklord / Blue-Eyes Alternative Ultimate Dragon / Sky Striker Ace - Azalea Temperance.
const MANIFEST = { "Darklord": 4167084, "Blue-Eyes": 43228023, "Sky Striker": 56741506 };

describe("archetypeArt", () => {
  beforeEach(() => {
    archetypeArtManifest.value = MANIFEST;
  });

  it("resolves a known archetype to its elected card id", () => {
    expect(archetypeArtId("Darklord")).toBe(4167084);
    expect(archetypeArtId("Sky Striker")).toBe(56741506);
  });

  // The whole point of the feature: an announce whose text matched no
  // archetype must render no picture at all, not a placeholder.
  it("returns null for an archetype that is not in the manifest", () => {
    expect(archetypeArtId("Darklord deck base")).toBeNull();
    expect(archetypeArtUrl("Darklord deck base")).toBeNull();
    expect(archetypeArtUrl("not a real archetype")).toBeNull();
  });

  it("returns null for empty, blank, null and non-string archetypes", () => {
    for (const input of ["", "   ", null, undefined, 42, {}]) {
      expect(archetypeArtId(input)).toBeNull();
      expect(archetypeArtUrl(input)).toBeNull();
    }
  });

  it("trims surrounding whitespace before looking up", () => {
    expect(archetypeArtId("  Darklord  ")).toBe(4167084);
  });

  // Guards against casing drift between YGOPRODeck's archetype list (which
  // populates announce.archetype) and the manifest.
  it("falls back to a case-insensitive match", () => {
    expect(archetypeArtId("DARKLORD")).toBe(4167084);
    expect(archetypeArtId("blue-eyes")).toBe(43228023);
  });

  it("re-derives the case-insensitive index when the manifest is replaced", () => {
    expect(archetypeArtId("darklord")).toBe(4167084);
    archetypeArtManifest.value = { "Labrynth": 81497285 };
    expect(archetypeArtId("darklord")).toBeNull();
    expect(archetypeArtId("labrynth")).toBe(81497285);
  });

  it("returns null while the manifest has not loaded", () => {
    archetypeArtManifest.value = null;
    expect(archetypeArtId("Darklord")).toBeNull();
    expect(archetypeArtUrl("Darklord")).toBeNull();
  });

  it("builds a cropped-art URL containing the elected card id", () => {
    expect(archetypeArtUrl("Darklord")).toMatch(/cards_cropped\/4167084\.jpg$/);
  });
});

// Shape check on the real generated file, so a broken or truncated run of
// scripts/archetype-art.mjs fails the suite rather than silently shipping.
describe("public/archetype-art.json", () => {
  const manifest = JSON.parse(
    readFileSync(resolve(__dirname, "../../public/archetype-art.json"), "utf8")
  );

  it("covers the full archetype list", () => {
    expect(Object.keys(manifest).length).toBeGreaterThan(600);
  });

  it("maps every archetype to a positive integer card id", () => {
    for (const [name, id] of Object.entries(manifest)) {
      expect(name.length, `empty archetype name`).toBeGreaterThan(0);
      expect(Number.isInteger(id), `${name} -> ${id} is not an integer`).toBe(true);
      expect(id, `${name} -> ${id} is not positive`).toBeGreaterThan(0);
    }
  });

  it("elects the recognisable boss monster for well-known archetypes", () => {
    archetypeArtManifest.value = manifest;
    // The First Darklord, not the alphabetically-first "Asmo Token".
    expect(archetypeArtId("Darklord")).toBe(4167084);
  });
});

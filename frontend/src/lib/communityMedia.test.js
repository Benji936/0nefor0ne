import { describe, it, expect } from "vitest";
import { validateImageFile, mediaPath } from "./communityMedia";

function fakeFile({ name = "pic.png", type = "image/png", size = 1000 } = {}) {
  return { name, type, size };
}

describe("validateImageFile", () => {
  it("accepts an image under 5 MB", () => {
    expect(validateImageFile(fakeFile({ type: "image/jpeg", size: 4 * 1024 * 1024 }))).toEqual({ ok: true });
  });
  it("rejects a missing file", () => {
    expect(validateImageFile(null)).toEqual({ ok: false, error: "no_file" });
  });
  it("rejects a non-image", () => {
    expect(validateImageFile(fakeFile({ type: "application/pdf" }))).toEqual({ ok: false, error: "wrong_type" });
  });
  it("rejects an image over 5 MB", () => {
    expect(validateImageFile(fakeFile({ size: 5 * 1024 * 1024 + 1 }))).toEqual({ ok: false, error: "too_large" });
  });
});

describe("mediaPath", () => {
  it("builds {id}/{kind}-{ts}.{ext} with a lowercased extension", () => {
    expect(mediaPath(42, "avatar", fakeFile({ name: "Photo.PNG" }))).toMatch(/^42\/avatar-\d+\.png$/);
  });
  it("uses the banner kind", () => {
    expect(mediaPath(7, "banner", fakeFile({ name: "b.jpeg" }))).toMatch(/^7\/banner-\d+\.jpeg$/);
  });
  it("falls back to 'img' when there is no extension", () => {
    expect(mediaPath(1, "avatar", fakeFile({ name: "noext" }))).toMatch(/^1\/avatar-\d+\.img$/);
  });
  it("sanitizes a weird extension to alphanumerics", () => {
    expect(mediaPath(1, "avatar", fakeFile({ name: "x.p!n g" }))).toMatch(/^1\/avatar-\d+\.png$/);
  });
});

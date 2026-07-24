import { describe, it, expect } from "vitest";
import { toQueryParams, fromQueryParams } from "./communityFilters";

describe("toQueryParams", () => {
  it("omits empty and false values", () => {
    expect(toQueryParams({ kind: "", country: "FR", remoteDuel: false, q: "" }))
      .toEqual({ country: "FR" });
  });
  it("serializes remoteDuel only when true", () => {
    expect(toQueryParams({ remoteDuel: true })).toEqual({ remote: "1" });
  });
  it("drops page 0 but keeps a positive page", () => {
    expect(toQueryParams({ page: 0 })).toEqual({});
    expect(toQueryParams({ page: 3 })).toEqual({ page: "3" });
  });
});

describe("fromQueryParams", () => {
  it("is the inverse of toQueryParams", () => {
    const f = { kind: "store", country: "DE", region: "EMEA", remoteDuel: true, q: "hobby", page: 2 };
    expect(fromQueryParams(toQueryParams(f))).toEqual(f);
  });
  it("defaults missing values", () => {
    expect(fromQueryParams({})).toEqual({ kind: "", country: "", region: "", remoteDuel: false, q: "", page: 0 });
  });
});

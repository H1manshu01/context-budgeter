import { describe, expect, it } from "vitest";
import { MODELS, estimate, limitFor } from "../src/models.js";

describe("estimate", () => {
  it("is roughly chars/4", () => {
    expect(estimate("abcd")).toBe(1);
    expect(estimate("abcde")).toBe(2);
    expect(estimate("")).toBe(0);
  });
});

describe("limitFor", () => {
  it("resolves exact ids and version prefixes", () => {
    expect(limitFor("gpt-4o")).toBe(128_000);
    expect(limitFor("gpt-4o-2024-08-06")).toBe(128_000);
    expect(limitFor("claude-3-5-sonnet-20241022")).toBe(200_000);
  });
  it("returns undefined for an unknown model", () => {
    expect(limitFor("totally-made-up")).toBeUndefined();
  });
  it("exposes the raw table", () => {
    expect(MODELS["gpt-4"]).toBe(8_192);
  });
});

import { describe, expect, it } from "vitest";
import { fit, fitAsync } from "../src/index.js";
import type { Message } from "../src/index.js";

const ten = () => 10;
const byLen = (t: string) => t.length;
const c = (m: Message) => m.content;

function users(n: number): Message[] {
  return Array.from({ length: n }, (_, i) => ({ role: "user" as const, content: `m${i}` }));
}

describe("fit — drop-oldest (default)", () => {
  it("drops oldest non-pinned until it fits, keeping system and the last message", () => {
    const msgs: Message[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
    ];
    const r = fit(msgs, { count: ten, budget: 30 });
    expect(r.messages.map(c)).toEqual(["sys", "u2", "a2"]);
    expect(r.dropped.map(c)).toEqual(["u1", "a1"]);
    expect(r.tokens).toBe(30);
    expect(r.fits).toBe(true);
  });

  it("returns everything when it already fits", () => {
    const msgs = users(3);
    const r = fit(msgs, { count: ten, budget: 1000 });
    expect(r.dropped).toEqual([]);
    expect(r.messages).toHaveLength(3);
    expect(r.fits).toBe(true);
  });
});

describe("fit — pinning", () => {
  it("throws loudly when the pinned set alone exceeds the budget", () => {
    expect(() => fit([{ role: "system", content: "x" }], { count: () => 100, budget: 50 })).toThrow(
      /exceed the budget/,
    );
  });
  it("never drops a custom-pinned message", () => {
    const msgs = users(6);
    const r = fit(msgs, {
      count: ten,
      budget: 20,
      keep: { last: 1, pin: (m) => m.content === "m2" },
    });
    expect(r.messages.map(c)).toContain("m2");
  });
  it("preserves passthrough fields and never mutates the input", () => {
    const msgs: Message[] = [{ role: "user", content: "x", name: "bob", extra: 1 }];
    const before = structuredClone(msgs);
    const r = fit(msgs, { count: () => 1, budget: 100 });
    expect(r.messages[0]).toMatchObject({ name: "bob", extra: 1 });
    expect(msgs).toEqual(before);
  });
});

describe("fit — strategies", () => {
  it("middle-out keeps the ends and drops the middle", () => {
    const msgs = users(7);
    const r = fit(msgs, {
      count: ten,
      budget: 40,
      strategy: "middle-out",
      keep: { first: 1, last: 1 },
    });
    expect(r.messages.map(c)).toEqual(["m0", "m1", "m5", "m6"]);
  });
  it("keep-system pins system even when keep.system is false", () => {
    const msgs: Message[] = [{ role: "system", content: "sys" }, ...users(5)];
    const r = fit(msgs, {
      count: ten,
      budget: 20,
      keep: { system: false, last: 1 },
      strategy: ["keep-system", "drop-oldest"],
    });
    expect(r.messages.some((m) => m.role === "system")).toBe(true);
  });
});

describe("fit — tool-call adjacency", () => {
  it("drops a tool result together with its assistant call", () => {
    const msgs: Message[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "u1" },
      { role: "assistant", content: "call", tool_calls: [{ id: "t1" }] },
      { role: "tool", content: "result" },
      { role: "user", content: "u2" },
    ];
    const r = fit(msgs, { count: ten, budget: 30 });
    expect(r.messages.map(c)).toEqual(["sys", "u2"]);
    expect(r.dropped.map(c)).toEqual(["u1", "call", "result"]);
  });
});

describe("fit / fitAsync — summarize", () => {
  const msgs: Message[] = [
    { role: "system", content: "S" },
    { role: "user", content: "hello" },
    { role: "assistant", content: "world" },
    { role: "user", content: "bye" },
  ];

  it("fit throws when a summarize hook would run", () => {
    expect(() =>
      fit(msgs, {
        count: byLen,
        budget: 12,
        strategy: ["drop-oldest", "summarize"],
        summarize: () => ({ role: "system", content: "sum" }),
      }),
    ).toThrow(/fitAsync/);
  });

  it("fitAsync folds dropped messages into a summary, inserted in place", async () => {
    const r = await fitAsync(msgs, {
      count: byLen,
      budget: 12,
      strategy: ["drop-oldest", "summarize"],
      summarize: (dropped) => ({ role: "system", content: `[${dropped.length}]` }),
    });
    expect(r.messages.map(c)).toEqual(["S", "[1]", "world", "bye"]);
    expect(r.dropped.map(c)).toEqual(["hello"]);
    expect(r.fits).toBe(true);
  });
});

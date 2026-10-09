// Cross-runtime smoke test against the BUILT output (dist/).
// Runs under both Node and Bun to confirm the published package loads and works.
// No network, no I/O: fit/estimate are pure functions over in-memory messages.
import assert from "node:assert/strict";
import { fit, fitAsync } from "../dist/index.js";
import { MODELS, estimate, limitFor } from "../dist/models.js";

// The package exports the documented surface from both entry points.
assert.equal(typeof fit, "function");
assert.equal(typeof fitAsync, "function");
assert.equal(typeof estimate, "function");
assert.equal(typeof limitFor, "function");
assert.equal(typeof MODELS, "object");

// estimate(): ~4 chars per token, rounded up.
assert.equal(estimate("abcd"), 1);
assert.equal(estimate("abcde"), 2);

// limitFor(): exact match, prefix match, and unknown model.
assert.equal(limitFor("gpt-4o"), 128000);
assert.equal(limitFor("gpt-4o-2024-08-06"), 128000);
assert.equal(limitFor("nope"), undefined);

// drop-oldest: trims the oldest unpinned turns to fit the budget.
{
  const count = () => 10;
  const msgs = [
    { role: "system", content: "s" },
    { role: "user", content: "u1" },
    { role: "assistant", content: "a1" },
    { role: "user", content: "u2" },
    { role: "assistant", content: "a2" },
  ];
  const result = fit(msgs, { count, budget: 30 });
  assert.deepEqual(
    result.messages.map((m) => m.content),
    ["s", "u2", "a2"],
  );
  assert.deepEqual(
    result.dropped.map((m) => m.content),
    ["u1", "a1"],
  );
  assert.equal(result.tokens, 30);
  assert.equal(result.fits, true);
}

// never-exceeds: pinned messages that cannot fit the budget throw.
assert.throws(() => fit([{ role: "system", content: "x" }], { count: () => 100, budget: 50 }));

// fitAsync() with a summarize hook: dropped turns collapse into a summary message.
{
  const msgs = [
    { role: "system", content: "S" },
    { role: "user", content: "hello" },
    { role: "assistant", content: "world" },
    { role: "user", content: "bye" },
  ];
  const count = (t) => t.length;
  const result = await fitAsync(msgs, {
    budget: 12,
    strategy: ["drop-oldest", "summarize"],
    summarize: (d) => ({ role: "system", content: `[${d.length}]` }),
    count,
  });
  assert.deepEqual(
    result.messages.map((m) => m.content),
    ["S", "[1]", "world", "bye"],
  );
  assert.equal(result.fits, true);
}

console.log(`smoke ok (${typeof Bun !== "undefined" ? "bun" : "node"})`);

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fit } from "../src/index.js";
import type { Message, Strategy } from "../src/index.js";

const msgArb = fc.record({
  role: fc.constantFrom<Message["role"]>("system", "user", "assistant"),
  content: fc.string({ maxLength: 20 }),
});
const strategyArb = fc.constantFrom<Strategy>("drop-oldest", "middle-out", "keep-system");

describe("properties", () => {
  it("never exceeds budget, never drops pinned, partitions the input, never mutates", () => {
    fc.assert(
      fc.property(
        fc.array(msgArb, { maxLength: 30 }),
        fc.integer({ min: 0, max: 500 }),
        strategyArb,
        (messages, budget, strategy) => {
          const count = (t: string) => t.length + 1; // every message costs at least 1
          const before = structuredClone(messages);

          let r: ReturnType<typeof fit>;
          try {
            r = fit(messages, { count, budget, strategy, keep: { last: 1 } });
          } catch (e) {
            // The only expected throw: the pinned set alone exceeds the budget.
            expect((e as Error).message).toMatch(/exceed the budget/);
            expect(messages).toEqual(before);
            return;
          }

          expect(r.tokens).toBeLessThanOrEqual(r.budget);
          expect(r.messages.length + r.dropped.length).toBe(messages.length);
          if (messages.length > 0) {
            expect(r.messages).toContain(messages[messages.length - 1]); // last is pinned
          }
          expect(messages).toEqual(before); // input untouched
        },
      ),
      { numRuns: 300 },
    );
  });
});

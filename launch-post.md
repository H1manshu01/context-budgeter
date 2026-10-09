---
title: "Fit any chat history into the context window, bring your own tokenizer"
published: true
description: "Every LLM app eventually overflows the context window, and the fix is always the same trimming shape — keep the system prompt, keep the recent turns, drop or fold the rest. context-budgeter is that shape done once: a tiny, zero-dependency, tokenizer-agnostic trimmer with pluggable strategies and a guarantee it never exceeds the budget or drops a pinned message."
tags: typescript, ai, opensource, webdev
cover_image: https://raw.githubusercontent.com/H1manshu01/context-budgeter/main/assets/cover.png
canonical_url: https://dev.to/h1manshu01/fit-any-chat-history-into-the-context-window-bring-your-own-tokenizer-5184
---

You ship a chat feature. It works. Then a conversation gets long enough, a couple
of chunky tool results land in the middle, and the next request crosses the
model's context window. You get one of these:

```
400 This model's maximum context length is 128000 tokens, however you requested 131402...
```

So you write a trimmer. Keep the system prompt, keep the last few turns, drop the
oldest stuff until it fits. Easy — except the first version drops the system
prompt by accident, the second one orphans a `tool` result from the assistant
call that produced it (which the provider rejects), and the third one is off by
enough tokens that you still get the 400 sometimes. Everyone writes this. Almost
everyone writes it slightly wrong.

## The trimming shape is always the same

Whatever the app, fitting a history into the window is the same move:

- Keep the **system prompt** (it defines the behavior).
- Keep the **most recent turns** (they are the live conversation).
- Keep anything you **pinned** (a few-shot example, the current user turn).
- **Drop or fold** the rest until the total is under the budget.
- Never separate a **tool result** from the **tool call** it answers.

Get it wrong and you ship one of three failures: a hard **400** from the
provider, a conversation that is **silently truncated** at the wrong place, or a
request that **quietly drops the system prompt** and changes how the model
behaves. The shape is simple; the edges are where it breaks.

## context-budgeter

[`context-budgeter`](https://www.npmjs.com/package/context-budgeter) is that shape
done once and correctly. You bring a token counter; it brings the strategies and
a hard guarantee the result is within budget with your pinned messages intact — or
it throws, rather than handing you something over budget.

```ts
import { fit } from "context-budgeter";
import { estimate, limitFor } from "context-budgeter/models";

const { messages, dropped, tokens, fits } = fit(history, {
  count: estimate,                          // bring your own; a real tokenizer is more accurate
  budget: limitFor("gpt-4o") ?? 128_000,
  reserve: 1_000,                           // hold back for the reply
  strategy: ["keep-system", "middle-out"],  // try in order until it fits
  keep: { last: 4 },                        // always keep the 4 most recent
});
```

`fit` is synchronous and deterministic. `messages` comes back in original order
with the system prompt still first and the last four turns kept; `dropped` is what
was removed; `fits` tells you whether it all fit. The input is never mutated, and
every passthrough field on your messages (`name`, `tool_calls`, `tool_call_id`,
anything) is carried through untouched.

## Bring your own tokenizer — on purpose

There is no universal tokenizer. OpenAI, Anthropic, and Llama all count
differently, real BPE tokenizers are large, and sometimes a provider's
token-count API is the only exact source. So `context-budgeter` bundles **no**
tokenizer and takes a `count` function instead:

```ts
import { encode } from "gpt-tokenizer";
import { fit } from "context-budgeter";

const count = (text: string) => encode(text).length; // exact, for OpenAI-family models
fit(history, { count, budget: 128_000, reserve: 1_000 });
```

`gpt-tokenizer` and `js-tiktoken` are **counters you pair with** this library, not
competitors. If you just want to prototype, the optional `context-budgeter/models`
module ships a rough `estimate` (~4 chars/token) and a small `limitFor(model)`
table — both approximate, both deliberately kept out of the core so it stays
tiny (the core is ~971 B min+brotli).

## Strategies, as a list tried in order

A strategy decides the **order droppable messages are removed in**. Pass one, or
an array that is applied in sequence until the history fits:

- `"drop-oldest"` (default) — classic sliding window, drops from the front.
- `"middle-out"` — drops from the **center** outward, so you keep both the oldest
  framing and the newest turns and sacrifice the middle.
- `"keep-system"` — force-pins every system message for the run.
- `"summarize"` — folds the dropped span into a summary (async; see below).

So `["keep-system", "middle-out", "summarize"]` reads exactly as it should: always
keep system, prefer to drop the middle, and if it still doesn't fit, summarize
what was dropped.

## Pinning, and the tool-call edge nobody remembers

Pins combine — a message survives if any `keep` rule matches it:

```ts
fit(history, {
  count,
  budget,
  keep: {
    system: true,                          // keep every system message (default)
    first: 2,                              // keep a leading few-shot pair
    last: 4,                               // keep the 4 most recent
    pin: (m) => m.name === "important",    // keep anything your predicate matches
  },
});
```

And the edge that trips hand-rolled trimmers: a `tool` result is grouped with the
assistant message that called it and they **drop together**. A tool result with no
preceding call is a request the provider rejects — `context-budgeter` never
produces one.

## Summarize instead of discard (async)

When you would rather fold the dropped span into a summary than lose it, set the
`"summarize"` strategy and a hook, and call `fitAsync`:

```ts
import { fitAsync } from "context-budgeter";

const r = await fitAsync(history, {
  count,
  budget: 4_000,
  strategy: ["drop-oldest", "summarize"], // drop first; summarize what dropped
  summarize: async (dropped) => ({
    role: "system",
    content: await myLLM.summarize(dropped),
  }),
});
```

The summary is inserted where the dropped span used to be, so order reads
naturally. (`fit` throws if a summarize hook would run — a nudge to reach for the
async entry point deliberately.)

## The guarantees are the point

Covered by 15 tests, including a `fast-check` property test over hundreds of
random inputs:

- The result **never exceeds the budget**.
- Pinned messages are **never dropped**.
- If the pinned set **alone** is over budget, `fit` throws a `RangeError` — it
  never silently returns an over-budget result.
- Order and passthrough fields are preserved; the **input is never mutated**.
- Tool-call and tool-result messages **drop together**.
- Deterministic and synchronous — the only async is your own `summarize` hook.

## Part of a small line of LLM dev tools

`context-budgeter` is one of a set of zero-dependency tools, each useful on its
own:

- **[`context-budgeter`](https://www.npmjs.com/package/context-budgeter)** — fit a
  chat history into the context window. *(this one)*
- **[`sse-wire`](https://www.npmjs.com/package/sse-wire)** — fetch-based SSE
  client: POST, headers, abort, opt-in reconnection.
- **[`retry-wire`](https://www.npmjs.com/package/retry-wire)** — provider-aware
  retry + throttle for the request (429 / 529 / `Retry-After`).
- **[`trickle-json`](https://www.npmjs.com/package/trickle-json)** — assemble
  streamed token deltas into the best valid partial value on every chunk.
- **[`coerce-json`](https://www.npmjs.com/package/coerce-json)** — repair and
  coerce that value to your Zod / JSON Schema, logging every fix.
- **[`trickle-react`](https://www.npmjs.com/package/trickle-react)** — React
  bindings for the streaming parse.
- **[`expect-llm`](https://www.npmjs.com/package/expect-llm)** — assertions for
  LLM output in tests.

## Try it

```sh
npm install context-budgeter
```

- **npm:** https://www.npmjs.com/package/context-budgeter
- **GitHub:** https://github.com/H1manshu01/context-budgeter
- Zero runtime dependencies, ESM + CJS, full types, core ~971 B min+brotli,
  published with provenance. Runs on Node 18+ and in the browser.

If it trims something it shouldn't — or keeps something it shouldn't, or your
budget math disagrees with your tokenizer — open an issue with the messages and
the `count` you used. The guarantees are the whole point, so I want to know. A
star helps if it saves you a hand-rolled trimmer.

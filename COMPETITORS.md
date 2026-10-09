# Competitor scan (M0)

Why `context-budgeter` exists: fitting a chat history into a model's context
window is a problem everyone hits and most solve ad hoc. The trimming **shape**
is always the same — keep the system prompt, keep the most recent turns, and drop
or fold the rest until it fits — but the correct version needs a specific
combination: a token counter you choose (there is no universal tokenizer),
strategies beyond chopping the front (`middle-out`, `summarize`), pinning that
survives every strategy, tool-call/tool-result messages that drop **together**,
and a hard guarantee the result is within budget or the call throws. Each
existing option covers part of that; the gaps are exactly where a long agent
conversation breaks.

Where a specific detail of a third-party library could have changed, claims are
dated **"as of early 2026"** and kept general rather than invented. Re-check
current behavior against each project before quoting it. The aim here is a fair
map of the space, not a takedown — several of these are good at what they were
built for, and a couple are complements `context-budgeter` pairs *with* rather
than replaces.

---

## `tokenlens`

**What it does.** A token-counting and context-window library: estimate or count
the tokens in text and look up model limits. As of early 2026 it is squarely a
**measurement** tool — "how many tokens is this, and what is the window for this
model."

**What it misses.**
- **It counts; it doesn't trim.** There is no history-fitting step — no strategy,
  no pinning, no dropping tool results with their calls. You still write the
  "keep system, keep recent, drop the rest until it fits" loop yourself.
- **Complementary, not a rival.** Its job overlaps `context-budgeter`'s optional
  `models` module (`estimate` / `limitFor`), not the core. You could feed a
  `tokenlens` count into `context-budgeter`'s `count` and let the trimmer do the
  fitting. The division of labor is the point: measure with one, fit with the
  other.

## LangChain `trimMessages`

**What it does.** A message-trimming utility inside LangChain: trim a list of
messages to a token count, keeping either the first or the last messages, with
options to keep the system message and to start/end on particular message types.
As of early 2026 it is the closest framework-native equivalent, and it is a
reasonable choice if you already live in LangChain.

**What it misses.**
- **Welded to the framework.** It operates on LangChain message objects and is
  adopted as part of LangChain, not as a standalone zero-dependency function. If
  you are not already in that ecosystem, it is a large thing to pull in for one
  trim. `context-budgeter` is a two-function package with no dependencies.
- **First/last, not `middle-out` or a strategy list.** It keeps a prefix or a
  suffix; there is no built-in "drop the middle, keep both ends" or a sequence of
  strategies tried in order. `context-budgeter` ships `drop-oldest`,
  `middle-out`, `keep-system`, and `summarize`, composable as a list.
- **Limited pinning.** It can keep the system message and anchor on message
  types, but there is no general `first N` / `last N` / custom-predicate pinning
  that combines. `context-budgeter`'s `keep` does all three at once.
- **Counting is tied to a model/encoder.** You supply a token counter bound to a
  model; `context-budgeter`'s `count` is a plain `(text, message?) => number` you
  can back with anything, including a provider's token-count API.

## `ctx-compact`

**What it does.** As of early 2026 this is a context-compaction helper for chat
histories — reduce a growing message list so it fits a smaller window. Details
vary by version, so this entry is kept general.

**What it misses (general, re-check before quoting).**
- **Fewer, less explicit strategy knobs.** Where it compacts, it tends to do so
  one way; `context-budgeter` exposes the drop order (`drop-oldest` vs.
  `middle-out`), a strategy list tried in order, and a `summarize` hook as
  distinct, documented choices.
- **Weaker guarantees at the edges.** The invariants `context-budgeter` is built
  around — never exceed budget, never drop a pin, throw rather than return
  over-budget, drop tool results with their calls, never mutate the input — are
  the parts that are easy to get subtly wrong in a general compactor. Verify
  which of these a given version holds.

## `slimcontext`

**What it does.** A context-trimming/compression library that, as of early 2026,
leans on **summarization** — collapse older turns into a summary so the recent
conversation still fits. A good fit when summarizing is exactly the behavior you
want.

**What it misses.**
- **Summarize-first, not a spectrum.** Its center of gravity is summarization;
  `context-budgeter` treats `summarize` as one strategy among several and lets you
  try cheaper, lossless drops first (`["middle-out", "summarize"]`), only folding
  what is left. Plain trimming with no LLM call is the default.
- **Tokenizer-agnostic BYO counting.** Confirm how it counts tokens; in
  `context-budgeter` the counter is always yours, so the budget math matches
  whatever tokenizer or API you already trust.
- **The hard guarantees.** As with the others, re-check whether it never exceeds
  budget, never drops a pinned message, and keeps tool results adjacent to their
  calls — those are explicit, tested invariants in `context-budgeter`.

## `gpt-tokenizer` / `js-tiktoken` (paired counters, not rivals)

**What they do.** Real BPE tokenizers for JavaScript — the accurate way to count
tokens for OpenAI-family (and compatible) models. `js-tiktoken` is the pure-JS
port of tiktoken; `gpt-tokenizer` is a popular pure-JS tokenizer with per-model
encodings.

**Why they are not competitors.** They count; they do not fit a history. They are
exactly what you pass into `context-budgeter`'s `count`:

```ts
import { encode } from "gpt-tokenizer";
import { fit } from "context-budgeter";

const count = (text: string) => encode(text).length;
fit(history, { count, budget: 128_000, reserve: 1_000 });
```

`context-budgeter` is deliberately tokenizer-agnostic so you can pair it with the
accurate counter for your model (or a provider's token-count API) rather than
bundling one and being wrong for everyone else's model.

## `agentfit`

**What it does.** As of early 2026, an agent/context-fitting helper in the same
general space — fitting messages or context for an agent loop. Specifics vary and
may have changed, so this entry is intentionally general.

**What it misses (general, re-check before quoting).**
- **Scope and portability.** Where it is bundled into a broader agent framework
  or runtime, you adopt more than a trimmer. `context-budgeter` is a single,
  zero-dependency function pair usable with any stack or none.
- **Explicit, tested invariants.** The never-over-budget / never-drop-a-pin /
  tool-adjacency / never-mutate guarantees are the differentiator; confirm which
  a given version provides before relying on them.

---

## The gap, in one line

| Capability | context-budgeter | `tokenlens` | LangChain `trimMessages` | `ctx-compact` | `slimcontext` | `agentfit` |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Trims a history to fit a token budget | Yes | — (counts only) | Yes | Yes | Yes | Varies |
| Tokenizer-agnostic, bring-your-own counter | Yes | n/a (is a counter) | Needs model/encoder | Varies | Varies | Varies |
| `drop-oldest` + `middle-out` drop orders | Yes | — | first / last | Varies | — | Varies |
| `summarize` (fold dropped into a summary) | Yes (hook) | — | — | Varies | Yes (LLM) | Varies |
| Strategy list tried in order until it fits | Yes | — | — | Varies | Varies | Varies |
| Pinning: system / first / last / predicate | Yes | — | `includeSystem` only | Varies | Varies | Varies |
| Tool-call + tool-result drop together | Yes | — | Partial | Varies | Varies | Varies |
| Never exceeds budget / never drops a pin | Yes (throws otherwise) | n/a | Best-effort | Varies | Varies | Varies |
| Zero runtime dependencies | Yes | Small | — (LangChain) | Varies | Varies | Varies |

`context-budgeter` is the row that is a tiny, dependency-free, tokenizer-agnostic
trimmer with pluggable strategies and real pinning all at once — and that treats
`gpt-tokenizer` / `js-tiktoken` / `tokenlens` as the counters you pair it with,
not things to replace. Where a cell says "Varies," the behavior depends on a
version that may have changed; the hedges are deliberate because these projects
evolve. **Re-check each before quoting it.**

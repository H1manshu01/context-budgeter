# Roadmap

`context-budgeter` ships `M0-M5` as **v0.1** — the trimmer (`fit` + `fitAsync`),
the strategies (`drop-oldest` / `keep-system` / `middle-out` / `summarize`), the
pinning rules, the tool-call adjacency grouping, the optional
`context-budgeter/models` estimator and model-limit table, the tests, and the
docs are all in place. It is a standalone tool in the author's LLM dev-tools
line; it sits beside [`sse-wire`](https://github.com/H1manshu01/sse-wire),
[`retry-wire`](https://github.com/H1manshu01/retry-wire), and the streaming
parsers — the step that keeps the request you are about to send inside the
model's context window.

## M0 — Validate & name (done)
- [x] Competitor scan: `tokenlens`, LangChain `trimMessages`, `ctx-compact`,
      `slimcontext`, the `gpt-tokenizer` / `js-tiktoken` counters (as paired
      tools, not rivals), and `agentfit` (see [COMPETITORS.md](./COMPETITORS.md))
- [x] Confirmed the gap: the trimming shape (keep system, keep recent, drop or
      fold the rest) is re-implemented badly everywhere; framework helpers are
      welded to a framework and a tokenizer, counters only count, and few model
      tool-call/tool-result adjacency or give a hard never-over-budget guarantee
- [x] Named and scoped as a tiny, zero-dependency, tokenizer-agnostic trimmer
      with pluggable strategies and pinning

## M1 — Core trimmer (done)
- [x] `fit(messages, options)` — synchronous, deterministic; drops droppable
      units in the strategy's order until the kept set is within `budget -
      reserve` (`src/fit.ts`)
- [x] Bring-your-own `count: CountFn` (required) and `budget` (required);
      `reserve` held back for the reply; a `TypeError` for a missing/invalid
      `count` or `budget`
- [x] `FitResult` — `messages` (original order), `dropped`, `tokens`, the
      effective `budget`, and `fits`; input never mutated, passthrough fields
      preserved

## M2 — Strategies & pinning (done)
- [x] `drop-oldest` (front-first), `middle-out` (center outward, keeping oldest
      and newest), `keep-system` (force-pin system), `summarize` (mark dropped to
      fold); a `Strategy[]` applied in order until it fits
- [x] `KeepRule` — `system` (default true), `first`, `last` (default 1), and a
      `pin(message, index)` predicate; pins combine (any match pins)
- [x] Tool-call adjacency: a `tool` result groups with the preceding message and
      drops as a unit, so a result is never orphaned from its call (`buildUnits`)
- [x] `RangeError` when the pinned set alone exceeds the effective budget — no
      silent over-budget return

## M3 — Summarize & async (done)
- [x] `fitAsync(messages, options)` — awaits an optional `summarize(dropped)`
      hook and inserts the summary where the dropped span used to be
- [x] `fit` throws a clear error if a `summarize` hook would need to run, so the
      async path is reached deliberately

## M4 — Models batteries & size (done)
- [x] `context-budgeter/models` kept out of the core: `estimate` (~4 chars/token),
      `MODELS` (hand-maintained context-window table), `limitFor(model)` (exact
      then version-prefix match, `undefined` otherwise) (`src/models.ts`)
- [x] Core `fit`/`fitAsync` (drop-oldest, pinning, strategies, tool adjacency,
      summarize) and models (`estimate`, `limitFor`) covered; a `fast-check`
      property test for never-over-budget / never-drop-pinned / partition /
      no-mutation — `test/`
- [x] 15 tests pass; ESM + CJS + `.d.ts` build (tsup); zero-dependency; core
      ~971 B, models ~298 B min+brotli, under the `size-limit` budget

## M5 — Docs / CI / release (done)
- [x] README with the problem, the quick start with a BYO `count`, the `fit` /
      `fitAsync` API, the options and strategy tables, the counter + optional
      models section, a pinning/tool-adjacency section, a Guardrails section, and
      a comparison table
- [x] `COMPETITORS.md`, `CHANGELOG.md`, launch post draft
- [ ] npm publish with `--provenance` — needs an `NPM_TOKEN` secret and a
      `v0.1.0` tag (owner action)

## Post-1.0 ideas
- **Byte and word budget modes.** A built-in `count` for bytes or words, for the
  cases where a budget is denominated in characters/bytes (a storage cap, a
  logging limit) rather than tokens — without pulling in a tokenizer at all.
- **Per-role weighting.** A declarative way to bias which roles are dropped first
  (e.g. prefer dropping old `assistant` turns over old `user` turns) without
  writing a full custom `pin` predicate.
- **Recursive / rolling summary.** Keep a single running summary that is
  re-summarized as the conversation grows, so the summarized prefix stays bounded
  instead of each `summarize` call starting from the raw dropped span.
- **A real-tokenizer adapter package.** A thin, separately-published adapter that
  wraps `gpt-tokenizer` / `js-tiktoken` into a ready `CountFn` per model, so the
  core stays zero-dependency while exact counting is one import away.
- **Streaming / running budget.** A stateful helper that accepts messages as they
  arrive and keeps the window trimmed incrementally, rather than re-fitting the
  whole history each turn.

## Known trade-offs (document, don't hide)
- **`estimate` and `MODELS` are approximate.** The ~4 chars/token heuristic will
  disagree with a real tokenizer, sometimes meaningfully, and the hand-maintained
  limit table can lag new or renamed models. They are for getting started; use a
  real tokenizer and your own authoritative limits for a tight production budget.
- **`summarize` can push slightly over budget.** The summary message has its own
  token cost, added after the drop pass. A large summary can make the total
  exceed the budget — `FitResult.fits` then reports `false`, so check it. Keep
  summaries short or reserve headroom.
- **No throttle / rate concerns here.** Pacing and retry are a different layer
  (`retry-wire`); `context-budgeter` is pure, synchronous trimming (the only
  async is your own `summarize` hook) and holds no timers or state between calls.
- **You own counting accuracy.** No tokenizer is bundled by design, so an
  inaccurate `count` yields an inaccurate budget. The guarantees are about the
  numbers `count` returns, not about matching a provider's tokenizer you did not
  pass in.

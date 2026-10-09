# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project adheres to
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-09

Initial public release — fit a chat message history into a model's context
window: a tiny, zero-dependency, tokenizer-agnostic trimmer with pluggable
strategies and a hard guarantee it never exceeds the budget or drops a pinned
message.

### Added
- **`fit(messages, options) → FitResult`** — synchronous, deterministic trimmer.
  Drops droppable messages in the chosen strategy's order until the kept set is
  within `budget - reserve`, returning them in their original order alongside
  what was dropped. Throws a `TypeError` for a missing/invalid `count` or
  `budget`, and a `RangeError` if the pinned set alone exceeds the budget.
- **`fitAsync(messages, options) → Promise<FitResult>`** — like `fit`, but awaits
  an optional `summarize(dropped)` hook and inserts the summary where the dropped
  span used to be. `fit` throws if a `summarize` hook would need to run.
- **Required options** — `count: (text, message?) => number` (bring your own
  token counter; no tokenizer is bundled) and `budget: number` (the token
  budget). Optional `reserve` holds tokens back for the reply; the effective
  budget is `budget - reserve`.
- **Strategies** — `"drop-oldest"` (default, front-first), `"keep-system"`
  (force-pin system), `"middle-out"` (drops from the center outward, keeping the
  oldest and newest), and `"summarize"` (fold the dropped span via the hook). A
  `Strategy[]` is applied in order until the history fits.
- **Pinning (`keep`)** — `system` (default `true`), `first`, `last` (default
  `1`), and a `pin(message, index)` predicate. Pins combine (any match pins) and
  are never dropped by any strategy.
- **Tool-call adjacency** — a `tool` result is grouped with the message that
  precedes it and drops as a unit, so a result is never orphaned from its call.
- **`FitResult`** — `messages` (what fits, original order, plus a summary if
  summarized), `dropped`, `tokens`, the effective `budget`, and `fits`. The input
  array and its messages are never mutated and all passthrough fields are kept.
- **`context-budgeter/models`** (optional, separate entry point) — `estimate`
  (~4 chars/token `CountFn`), `MODELS` (hand-maintained context-window table),
  and `limitFor(model)` (exact then version-prefix match; `undefined` for an
  unknown model). Both the estimate and the table are approximate.
- **Exported types** — `Message`, `Role`, `CountFn`, `Strategy`, `KeepRule`,
  `FitOptions`, `FitResult` (core) and `ModelId` (models).

### Verified
- `drop-oldest` drops the oldest non-pinned messages until it fits, keeping
  system and the last message; returns everything when it already fits.
- Pinning throws loudly when the pinned set alone exceeds the budget, never drops
  a custom-pinned message, and preserves passthrough fields without mutating the
  input.
- `middle-out` keeps the ends and drops the middle; `keep-system` pins system
  even when `keep.system` is `false`.
- A `tool` result is dropped together with its assistant call.
- `fit` throws when a `summarize` hook would run; `fitAsync` folds the dropped
  messages into a summary inserted in place.
- `estimate` is roughly chars/4; `limitFor` resolves exact ids and version
  prefixes and returns `undefined` for an unknown model; `MODELS` exposes the raw
  table.
- A `fast-check` property test asserts, over hundreds of random inputs, that the
  result never exceeds the budget, never drops a pinned message, partitions the
  input, and never mutates it.
- 15 tests pass. ESM + CJS builds with type declarations; zero-dependency, under
  the `size-limit` budget (core ~971 B, models ~298 B min+brotli).

[0.1.0]: https://github.com/H1manshu01/context-budgeter/releases/tag/v0.1.0

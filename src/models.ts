/**
 * context-budgeter/models — optional batteries, kept out of the core so `fit`
 * stays tiny and tokenizer-agnostic.
 *
 *  - `estimate`: a rough, provider-agnostic token counter (~4 characters/token).
 *  - `MODELS` / `limitFor`: a small, hand-maintained table of context-window limits.
 *
 * Both are approximations. For exact counts, pass your own `count` (e.g. a real
 * tokenizer or a provider's token-count API).
 */
import type { CountFn } from "./types.js";

export type ModelId = string;

/** A rough token estimate: about 4 characters per token. Approximate, never exact. */
export const estimate: CountFn = (text) => Math.ceil((text?.length ?? 0) / 4);

/** Context-window limits (tokens), hand-maintained and approximate — they may lag real models. */
export const MODELS: Record<string, number> = {
  "gpt-4o": 128_000,
  "gpt-4o-mini": 128_000,
  "gpt-4.1": 1_000_000,
  "gpt-4-turbo": 128_000,
  "gpt-4": 8_192,
  "gpt-3.5-turbo": 16_385,
  o1: 200_000,
  "o1-mini": 128_000,
  "o3-mini": 200_000,
  "claude-3-5-sonnet": 200_000,
  "claude-3-5-haiku": 200_000,
  "claude-3-opus": 200_000,
  "claude-sonnet-4": 200_000,
  "claude-opus-4": 200_000,
  "gemini-1.5-pro": 2_000_000,
  "gemini-1.5-flash": 1_000_000,
  "gemini-2.0-flash": 1_000_000,
  "mistral-large": 128_000,
  "llama-3.1-70b": 128_000,
  "llama-3.1-405b": 128_000,
};

/**
 * Look up a model's context-window limit. Matches exact ids and then common
 * version prefixes (e.g. "gpt-4o-2024-08-06" resolves via "gpt-4o"). Returns
 * `undefined` for an unknown model.
 */
export function limitFor(model: ModelId): number | undefined {
  if (Object.hasOwn(MODELS, model)) return MODELS[model];
  for (const key of Object.keys(MODELS)) {
    if (model.startsWith(key)) return MODELS[key];
  }
  return undefined;
}

/**
 * context-budgeter — fit a chat message history into a model's context window.
 *
 * You bring the token counter; it brings the strategies and a hard guarantee it
 * never exceeds the budget or drops a pinned message.
 *
 * ```ts
 * import { fit } from "context-budgeter";
 * import { estimate, limitFor } from "context-budgeter/models";
 *
 * const { messages, dropped, tokens, fits } = fit(history, {
 *   count: estimate,                       // bring your own: a real tokenizer is better
 *   budget: limitFor("gpt-4o") ?? 128_000,
 *   reserve: 1_000,                        // hold back for the reply
 *   strategy: ["keep-system", "middle-out"],
 *   keep: { last: 4 },
 * });
 * ```
 *
 * The model registry and estimator live in `context-budgeter/models` so the
 * core stays tiny and tokenizer-agnostic.
 */
export { fit, fitAsync } from "./fit.js";
export type {
  CountFn,
  FitOptions,
  FitResult,
  KeepRule,
  Message,
  Role,
  Strategy,
} from "./types.js";

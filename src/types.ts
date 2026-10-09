export type Role = "system" | "user" | "assistant" | "tool";

/** A chat message. Extra fields (e.g. `tool_calls`, `name`) are preserved untouched. */
export interface Message {
  role: Role;
  content: string;
  [extra: string]: unknown;
}

/** Bring-your-own token counter, so no tokenizer is bundled. */
export type CountFn = (text: string, message?: Message) => number;

export type Strategy = "keep-system" | "drop-oldest" | "middle-out" | "summarize";

export interface KeepRule {
  /** Never drop `system` messages. Default true. */
  system?: boolean;
  /** Pin the first N messages. */
  first?: number;
  /** Pin the last N messages. Default 1. */
  last?: number;
  /** Pin any message for which this returns true. */
  pin?: (message: Message, index: number) => boolean;
}

export interface FitOptions {
  /** Bring-your-own token counter (required). Use `estimate` from `context-budgeter/models` for a rough one. */
  count: CountFn;
  /** The token budget (required). Pair with `reserve`, or derive from `limitFor(model)`. */
  budget: number;
  /** Tokens to hold back for the reply. The effective budget is `budget - reserve`. */
  reserve?: number;
  /** One strategy or several applied in order until it fits. Default "drop-oldest". */
  strategy?: Strategy | Strategy[];
  keep?: KeepRule;
  /** Fold the dropped messages into a summary. Requires the "summarize" strategy and `fitAsync`. */
  summarize?: (dropped: Message[]) => Message | Promise<Message>;
}

export interface FitResult {
  /** The messages that fit, in their original order (plus a summary, if summarized). */
  messages: Message[];
  /** The messages that were removed (or folded into the summary). */
  dropped: Message[];
  /** Token count of `messages`. */
  tokens: number;
  /** The effective budget (`budget - reserve`). */
  budget: number;
  /** Whether `messages` is within `budget`. */
  fits: boolean;
}

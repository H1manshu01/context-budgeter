/**
 * context-budgeter — fit a chat history into a token budget.
 *
 * You bring the token counter; this brings the strategies. It never exceeds the
 * budget, never drops a pinned message, preserves message order and passthrough
 * fields, and never mutates the input. Tool-call and tool-result messages drop
 * together so a result is never orphaned from its call.
 */
import type { FitOptions, FitResult, KeepRule, Message, Strategy } from "./types.js";

interface Unit {
  indices: number[];
  tokens: number;
  pinned: boolean;
  dropped: boolean;
}

function normalizeStrategies(s: FitOptions["strategy"]): Strategy[] {
  if (!s) return ["drop-oldest"];
  return Array.isArray(s) ? s : [s];
}

function computePinned(
  messages: Message[],
  keep: KeepRule | undefined,
  forceSystem: boolean,
): boolean[] {
  const n = messages.length;
  const pinned = new Array<boolean>(n).fill(false);
  const sys = forceSystem || (keep?.system ?? true);
  const first = keep?.first ?? 0;
  const last = keep?.last ?? 1;
  for (let i = 0; i < n; i++) {
    const m = messages[i] as Message;
    if (sys && m.role === "system") pinned[i] = true;
    else if (i < first) pinned[i] = true;
    else if (i >= n - last) pinned[i] = true;
    else if (keep?.pin?.(m, i)) pinned[i] = true;
  }
  return pinned;
}

/** Group each non-tool message with the tool results that follow it, so they drop together. */
function buildUnits(messages: Message[], costs: number[], pinned: boolean[]): Unit[] {
  const units: Unit[] = [];
  for (let i = 0; i < messages.length; i++) {
    if ((messages[i] as Message).role === "tool" && units.length > 0) {
      const u = units[units.length - 1] as Unit;
      u.indices.push(i);
      u.tokens += costs[i] as number;
      if (pinned[i]) u.pinned = true;
    } else {
      units.push({
        indices: [i],
        tokens: costs[i] as number,
        pinned: pinned[i] as boolean,
        dropped: false,
      });
    }
  }
  return units;
}

function totalTokens(units: Unit[]): number {
  let t = 0;
  for (const u of units) if (!u.dropped) t += u.tokens;
  return t;
}

function dropOrder(strategy: Strategy, units: Unit[]): number[] {
  const droppable: number[] = [];
  for (let i = 0; i < units.length; i++) {
    const u = units[i] as Unit;
    if (!u.pinned && !u.dropped) droppable.push(i);
  }
  if (strategy === "middle-out") {
    const order: number[] = [];
    let lo = Math.floor((droppable.length - 1) / 2);
    let hi = lo + 1;
    while (lo >= 0 || hi < droppable.length) {
      if (lo >= 0) order.push(droppable[lo--] as number);
      if (hi < droppable.length) order.push(droppable[hi++] as number);
    }
    return order;
  }
  // drop-oldest / keep-system / summarize: oldest (front) first.
  return droppable;
}

interface RunResult {
  units: Unit[];
  budget: number;
  summaryNeeded: boolean;
}

function run(messages: Message[], options: FitOptions): RunResult {
  if (typeof options.count !== "function") {
    throw new TypeError("context-budgeter: options.count (a token counter) is required");
  }
  if (typeof options.budget !== "number" || !Number.isFinite(options.budget)) {
    throw new TypeError("context-budgeter: options.budget (a number) is required");
  }
  const budget = options.budget - (options.reserve ?? 0);
  const strategies = normalizeStrategies(options.strategy);
  const forceSystem = strategies.includes("keep-system");

  const costs = messages.map((m) => options.count((m.content ?? "") as string, m));
  const pinned = computePinned(messages, options.keep, forceSystem);
  const units = buildUnits(messages, costs, pinned);

  const pinnedTokens = units.reduce((t, u) => t + (u.pinned ? u.tokens : 0), 0);
  if (pinnedTokens > budget) {
    throw new RangeError(
      `context-budgeter: pinned messages (${pinnedTokens} tokens) exceed the budget (${budget})`,
    );
  }

  for (const strat of strategies) {
    if (totalTokens(units) <= budget) break;
    for (const ui of dropOrder(strat, units)) {
      if (totalTokens(units) <= budget) break;
      const u = units[ui] as Unit;
      if (u.pinned || u.dropped) continue;
      u.dropped = true;
    }
  }

  const summaryNeeded =
    strategies.includes("summarize") && Boolean(options.summarize) && units.some((u) => u.dropped);
  return { units, budget, summaryNeeded };
}

function collect(messages: Message[], units: Unit[]): { kept: Message[]; dropped: Message[] } {
  const kept: Message[] = [];
  const dropped: Message[] = [];
  for (const u of units) {
    for (const i of u.indices) (u.dropped ? dropped : kept).push(messages[i] as Message);
  }
  return { kept, dropped };
}

/** Fit `messages` into the budget synchronously. For a `summarize` hook, use {@link fitAsync}. */
export function fit(messages: Message[], options: FitOptions): FitResult {
  const { units, budget, summaryNeeded } = run(messages, options);
  if (summaryNeeded) {
    throw new Error(
      "context-budgeter: the summarize strategy with a summarize hook requires fitAsync()",
    );
  }
  const { kept, dropped } = collect(messages, units);
  const tokens = totalTokens(units);
  return { messages: kept, dropped, tokens, budget, fits: tokens <= budget };
}

/** Like {@link fit}, but awaits an optional `summarize` hook that folds dropped messages into a summary. */
export async function fitAsync(messages: Message[], options: FitOptions): Promise<FitResult> {
  const { units, budget, summaryNeeded } = run(messages, options);
  const { kept, dropped } = collect(messages, units);
  let tokens = totalTokens(units);
  let finalMessages = kept;

  if (summaryNeeded && options.summarize && dropped.length > 0) {
    const summary = await options.summarize(dropped);
    const summaryCost = options.count((summary.content ?? "") as string, summary);
    // Insert the summary where the first dropped message used to be.
    const firstDroppedIdx = messages.indexOf(dropped[0] as Message);
    const insertAt = kept.findIndex((m) => messages.indexOf(m) > firstDroppedIdx);
    const pos = insertAt === -1 ? kept.length : insertAt;
    finalMessages = [...kept.slice(0, pos), summary, ...kept.slice(pos)];
    tokens += summaryCost;
  }

  return { messages: finalMessages, dropped, tokens, budget, fits: tokens <= budget };
}

/** Structured store the run must hit after retrieve_context. */
export type RequiredLookup = "get_metric" | "list_tasks" | "query_dataset";

const WANTS_TASKS =
  /\b(in motion|still open|what'?s (left|due|slipping|blocked)|priorit(y|ies)|task board|what we owe|what is stuck)\b/i;
const WANTS_DATASET =
  /\b(how many (users|rows|bookers)|user(s)? export|count (of )?users|dataset|row-level)\b/i;
const IS_DECISION = /\b(did we (decide|agree)|was (it|that) decided|decision to|raise the take rate)\b/i;
const WANTS_FIGURES =
  /\b(bookings|revenue|take rate|cash|subscriber|metric|traction|commission|walk in with|prep me|figures|how much|net revenue)\b/i;

/**
 * Which structured store a question needs after search. Null means search
 * is enough: the answer is in notes, or the matching tool is not allowed.
 */
export function requiredLookup(
  input: string,
  allowed: readonly string[]
): RequiredLookup | null {
  if (WANTS_TASKS.test(input) && allowed.includes("list_tasks")) return "list_tasks";
  if (WANTS_DATASET.test(input) && allowed.includes("query_dataset")) return "query_dataset";
  if (
    !IS_DECISION.test(input) &&
    WANTS_FIGURES.test(input) &&
    allowed.includes("get_metric")
  ) {
    return "get_metric";
  }
  return null;
}

/** Companion call after list_tasks, when the copilot has objectives. */
export function followOnLookup(
  lookup: RequiredLookup | null,
  allowed: readonly string[]
): "list_objectives" | null {
  if (lookup === "list_tasks" && allowed.includes("list_objectives")) return "list_objectives";
  return null;
}

export function lookupInstruction(lookup: RequiredLookup | null): string {
  if (lookup === "get_metric") {
    return "After retrieve_context, you will be required to call get_metric with no metric and no period, and include_claims false. That returns the ledger snapshot (bookings, commission, take rate, net revenue, cash, subscribers). State company numbers only from those records. A deck, call, or scan figure is a claim: name the file and date, and never present it as the close.";
  }
  if (lookup === "list_tasks") {
    return "After retrieve_context, you will be required to call list_tasks, then list_objectives if you have it. What is in motion, blocked, or due comes from those tables, not from notes.";
  }
  if (lookup === "query_dataset") {
    return "After retrieve_context, you will be required to call query_dataset. Counts and row filters come from that result, not from reading the export as text.";
  }
  return "After retrieve_context, call another tool only if the question needs it. If a named date or file did not contain the asked fact, say so.";
}

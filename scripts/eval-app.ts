/**
 * Feature checklist for the running VentureOS app.
 *
 * Scoring
 *   Each checklist item is one point: pass or fail.
 *   A feature score is points earned / points in that feature.
 *   Product checks cover stable behavior (pages, APIs, tools, trace shape).
 *   Answer checks cover the Ridgeline prompts in eval/ridgeline/tests.md:
 *   retrieval mix, required claims, stale figures, off-topic volume, and
 *   named unsupported claims. Those use the live model when a key is set.
 *   The overall score counts every point together.
 *
 * Product failures exit 1. Answer misses stay in the score and do not fail
 * the process, because the model can phrase a correct brief more than one way.
 *
 * Requires the dev server (default http://localhost:3000) and a seeded DB.
 * Run: npm run eval
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { documents, tasks, memories, agentRuns } from "../src/lib/db/schema";
import { chunkText } from "../src/lib/ai/ingest";
import { embedText } from "../src/lib/ai/embeddings";
import { EMBEDDING_DIMENSIONS } from "../src/lib/ai/provider";
import { buildTools } from "../src/lib/ai/tools";
import { requiredLookup } from "../src/lib/ai/lookup";
import { COPILOTS } from "../src/lib/constants";
import { requireOrg } from "../src/lib/org";
import { functions as inngestFunctions } from "../src/lib/inngest/functions";
import { webSearch } from "../src/lib/integrations/tavily";

const BASE = process.env.EVAL_BASE_URL ?? "http://localhost:3000";

type Group = "product" | "answer";

interface Check {
  id: string;
  label: string;
  pass: boolean;
  note?: string;
}

interface Suite {
  feature: string;
  group: Group;
  checks: Check[];
}

interface AgentTrace {
  runId: string;
  brief: string;
  events: Array<Record<string, unknown>>;
  error?: string;
}

class CookieJar {
  cookies = new Map<string, string>();

  absorb(res: Response) {
    const getSetCookie = (
      res.headers as Headers & { getSetCookie?: () => string[] }
    ).getSetCookie;
    const raw = getSetCookie ? getSetCookie.call(res.headers) : [];
    const fromHeader = res.headers.get("set-cookie");
    const lines = raw.length ? raw : fromHeader ? [fromHeader] : [];
    for (const line of lines) {
      const pair = line.split(";")[0];
      const i = pair.indexOf("=");
      if (i > 0) this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }

  header() {
    return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

const jar = new CookieJar();

async function request(
  path: string,
  init: RequestInit & { redirect?: RequestRedirect } = {}
) {
  const headers = new Headers(init.headers);
  const cookie = jar.header();
  if (cookie) headers.set("cookie", cookie);
  const res = await fetch(BASE + path, { ...init, headers, redirect: init.redirect ?? "manual" });
  jar.absorb(res);
  return res;
}

async function signInDemo() {
  const csrfRes = await request("/api/auth/csrf");
  const csrf = (await csrfRes.json()) as { csrfToken?: string };
  if (!csrf.csrfToken) throw new Error("No CSRF token from /api/auth/csrf");
  const body = new URLSearchParams({
    csrfToken: csrf.csrfToken,
    callbackUrl: `${BASE}/dashboard`,
  });
  const res = await request("/api/auth/callback/demo", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  return res.status === 302 && (res.headers.get("location") || "").includes("/dashboard");
}

async function text(path: string) {
  const res = await request(path, { redirect: "follow" });
  return { status: res.status, html: await res.text(), url: res.url };
}

function includesAll(html: string, needles: string[]) {
  const missing = needles.filter((n) => !html.includes(n));
  return { ok: missing.length === 0, missing };
}

async function item(
  id: string,
  label: string,
  fn: () => Promise<{ pass: boolean; note?: string } | boolean>
): Promise<Check> {
  try {
    const result = await fn();
    if (typeof result === "boolean") return { id, label, pass: result };
    return { id, label, pass: result.pass, note: result.note };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { id, label, pass: false, note: message };
  }
}

async function runAgent(copilotType: string, input: string): Promise<AgentTrace> {
  const res = await request("/api/agent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input, copilotType }),
    redirect: "follow",
  });
  if (!res.ok || !res.body) {
    const errText = await res.text();
    return { runId: "", brief: "", events: [], error: `${res.status} ${errText.slice(0, 240)}` };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: Array<Record<string, unknown>> = [];
  const timer = setTimeout(() => reader.cancel(), 120_000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        events.push(JSON.parse(trimmed) as Record<string, unknown>);
      }
    }
  } finally {
    clearTimeout(timer);
  }
  if (buffer.trim()) events.push(JSON.parse(buffer.trim()) as Record<string, unknown>);

  const run = events.find((e) => e.type === "run");
  const finalEv = events.find((e) => e.type === "final");
  const errorEv = events.find((e) => e.type === "error");
  const tokens = events
    .filter((e) => e.type === "token")
    .map((e) => String(e.text ?? ""))
    .join("");
  return {
    runId: String(run?.runId ?? ""),
    brief: String(finalEv?.brief ?? tokens),
    events,
    error: errorEv ? String(errorEv.message ?? "error") : undefined,
  };
}

function stepTools(trace: AgentTrace): string[] {
  const names: string[] = [];
  for (const ev of trace.events) {
    if (ev.type !== "step") continue;
    const step = ev.step as { payload?: { tool?: string } } | undefined;
    if (step?.payload?.tool) names.push(step.payload.tool);
  }
  return names;
}

function hasStepType(trace: AgentTrace, type: string) {
  return trace.events.some((ev) => {
    if (ev.type !== "step") return false;
    const step = ev.step as { type?: string } | undefined;
    return step?.type === type;
  });
}

function retrievedTitles(trace: AgentTrace): string[] {
  const titles: string[] = [];
  for (const ev of trace.events) {
    if (ev.type !== "step") continue;
    const step = ev.step as { payload?: { result?: { sources?: Array<{ documentTitle?: string }> } } } | undefined;
    for (const source of step?.payload?.result?.sources ?? []) {
      if (source.documentTitle) titles.push(source.documentTitle);
    }
  }
  return titles;
}

function taskArgs(trace: AgentTrace): Array<{ title?: string; owner?: string; dueDate?: string; description?: string }> {
  const out: Array<{ title?: string; owner?: string; dueDate?: string; description?: string }> = [];
  for (const ev of trace.events) {
    if (ev.type !== "step") continue;
    const step = ev.step as {
      type?: string;
      payload?: { tool?: string; args?: { title?: string; owner?: string; dueDate?: string; description?: string } };
    } | undefined;
    if (step?.type === "tool_call" && step.payload?.tool === "create_task" && step.payload.args) {
      out.push(step.payload.args);
    }
  }
  return out;
}

function sentences(brief: string) {
  return brief
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function labeledStale(sentence: string) {
  const namesFile = /deck|call|march|scan|january|september|june|data room/i.test(sentence);
  const marksOff = /not |n't|instead|stale|outdated|wrong|superseded|dropped|rather than|do not|don't/i.test(sentence);
  return namesFile && marksOff;
}

const DOCS = {
  gl: "GL export — Oct 2025 through Sep 2026",
  prep: "Investor prep — 28 Sep 2026",
  sepDeck: "Investor deck — September 2026",
  janDeck: "Investor deck — January 2026",
  janCall: "Investor call — 12 Jan 2026",
  junCall: "Investor call — 3 Jun 2026",
  users: "Users export — 12 Oct 2026",
  guest: "Guest recovery — 3 Sep 2026",
  group: "Group sales queue — 2 Oct 2026",
  march: "Competitor scan — March 2026",
  august: "Competitor scan — August 2026",
  standup: "Rank standup — 16 Oct 2026",
  supply: "Supply review — 8 Oct 2026",
  roadmap: "Roadmap, working copy — 13 Oct 2026",
};

function gradeRetrieval(
  trace: AgentTrace,
  depends: string[][],
  may: string[],
  off: string[]
): Check {
  const titles = retrievedTitles(trace);
  const allowed = new Set([...depends.flat(), ...may]);
  const unexpected = Array.from(new Set(titles.filter((t) => !allowed.has(t))));
  const offHit = Array.from(new Set(titles.filter((t) => off.includes(t))));
  const missing = depends
    .filter((group) => !group.some((title) => titles.includes(title)))
    .map((group) => group.join(" or "));
  const dependChunks = titles.filter((t) => depends.some((group) => group.includes(t))).length;
  const mayChunks = titles.filter((t) => may.includes(t)).length;
  const crowded = depends.length > 0 && mayChunks > dependChunks;
  const pass = missing.length === 0 && unexpected.length === 0 && offHit.length === 0 && !crowded && (depends.length === 0 || titles.length > 0);
  const note = [
    titles.length ? Array.from(new Set(titles)).join(" | ") : "no chunks",
    missing.length ? `missing ${missing.join("; ")}` : "",
    unexpected.length ? `unexpected ${unexpected.join(" | ")}` : "",
    crowded ? `may-appear chunks ${mayChunks} outnumber source chunks ${dependChunks}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  return { id: "retrieval", label: "Retrieved set stays on the question", pass: pass && !trace.error, note };
}

function claim(id: string, label: string, pass: boolean, note?: string): Check {
  return { id, label, pass, note };
}

function staleCheck(brief: string, patterns: RegExp[]): Check {
  const bad = sentences(brief).filter((s) => patterns.some((p) => p.test(s)) && !labeledStale(s));
  return {
    id: "stale",
    label: "Stale figures are named as stale, or left out",
    pass: bad.length === 0,
    note: bad[0]?.slice(0, 180),
  };
}

function volumeCheck(brief: string, offTopic: RegExp): Check {
  const parts = sentences(brief);
  const off = parts.filter((s) => offTopic.test(s) && !/out of scope|not part of this|leave that/i.test(s));
  const ratio = parts.length ? off.length / parts.length : 1;
  return {
    id: "volume",
    label: "Off-topic sentences stay under one third of the brief",
    pass: parts.length > 0 && ratio <= 1 / 3,
    note: `${off.length}/${parts.length} off-topic sentences`,
  };
}

function extraChecks(brief: string, extras: Array<{ id: string; label: string; when: RegExp }>): Check[] {
  const hits: Check[] = [];
  for (const extra of extras) {
    const bad = sentences(brief).filter((s) => extra.when.test(s) && !labeledStale(s));
    if (bad.length) hits.push({ id: extra.id, label: extra.label, pass: false, note: bad[0].slice(0, 180) });
  }
  return hits;
}

function answerChecks(feature: string, trace: AgentTrace): Check[] {
  const b = trace.brief;
  const err = trace.error;
  const fail = (id: string, label: string): Check => claim(id, label, false, err);
  if (err) return [fail("run", "Brief was produced")];

  const money = /\$108(\.0)?\s?m|108 million|108,000,000/i.test(b);
  const commission = /\$9\.39\s?m|9\.39 million|9,390,000/i.test(b);
  const take = /8\.7%/.test(b);
  const net = /\$12\.24\s?m|12\.24 million|12,240,000/i.test(b);
  const cash = /\$16\.4\s?m|16\.4 million|16,400,000/i.test(b);
  const subs = /52,300|52300/.test(b);
  const deckFigures = /120/.test(b) && /55[, ]?000/.test(b) && /18/.test(b);
  const deckRejected = /not the close|aren't the close|not the books|not the ledger|do not walk|don't walk|do not present|don't present|stale|outdated/i.test(b);
  const inventedFirm = /\b(Sequoia|Andreessen|a16z|Accel|Benchmark|Greylock|Lightspeed|Founders Fund|Kleiner)\b/i.test(b);

  const staleMoney = [/\$120\s?m/i, /\b11%/, /~\s*10%|about 10%|approximately 10%/i, /\$42\s?m/i, /\$18\s?m/i, /55[, ]?000/, /48[, ]?000/, /\b9\.2%/];

  if (feature === "Investor Prep") {
    return [
      gradeRetrieval(trace, [[DOCS.gl], [DOCS.prep]], [DOCS.sepDeck, DOCS.janDeck, DOCS.janCall, DOCS.junCall], [DOCS.users, DOCS.guest, DOCS.group, DOCS.march, DOCS.august, DOCS.standup]),
      claim("ttm", "Trailing bookings, commission, take rate, and net revenue match the ledger", money && commission && take && net),
      claim("sept", "September cash is $16.4M and subscribers are 52,300", cash && subs),
      claim("deck", "September deck round numbers are marked as not the close", deckFigures && deckRejected),
      claim("names", "No fund or partner name is invented", !inventedFirm),
      staleCheck(b, staleMoney),
      volumeCheck(b, /blackcomb|school district|guest recovery|weski|ski\.com|rank refresh/i),
      ...extraChecks(b, [
        { id: "headcount", label: "Extra claim: headcount stated as a close figure", when: /\b(40|90|91)\b[^.]{0,40}(people|employees|headcount)/i },
        { id: "renewal-avg", label: "Extra claim: renewal rate stated as an average", when: /renewal[^.]{0,40}average|average[^.]{0,30}renewal/i },
        { id: "gear", label: "Extra claim: gear shipping this year", when: /gear[^.]{0,80}(this year|shipping|will launch)/i },
        { id: "flights", label: "Extra claim: flights are in the package or next", when: /flights?[^.]{0,60}(next|in the package|checkout)/i },
      ]),
    ];
  }

  if (feature === "Competitive Analysis") {
    const products = /weski/i.test(b) && /flight/i.test(b) && /ski\.com/i.test(b) && /expedia|planner/i.test(b);
    const revenue = /5\s?[–-]\s?6|\$5.+\$6/i.test(b) && /unresolved|under \$5|\$20/i.test(b) && /\$40/i.test(b);
    const noFlight = /no flight|without a flight|flight is not|does not include a flight|not in the package/i.test(b);
    return [
      gradeRetrieval(trace, [[DOCS.august]], [DOCS.march, DOCS.roadmap], [DOCS.gl, DOCS.sepDeck, DOCS.janDeck, DOCS.users, DOCS.guest, DOCS.group, DOCS.supply, DOCS.standup, DOCS.prep, DOCS.janCall, DOCS.junCall]),
      claim("products", "WeSki is flight, stay, and transfer; Ski.com is a planner with Expedia lodging", products),
      claim("revenue", "WeSki is the August $5–6M estimate and Ski.com stays unresolved", revenue),
      claim("package", "Ridgeline's package has no flight", noFlight),
      staleCheck(b, [/\$8\s?m/i, /\$15\s?m/i]),
      volumeCheck(b, /november 6|data room|blackcomb|gross bookings|\$108/i),
      ...extraChecks(b, [
        { id: "single-ski", label: "Extra claim: a single Ski.com revenue", when: /ski\.com[^.]{0,80}(is|at|around|about)\s+\$\d/i },
        { id: "ridgeline-books", label: "Extra claim: a Ridgeline bookings or take-rate figure", when: /\$108|8\.7%|gross bookings/i },
      ]),
    ];
  }

  if (feature === "Notion") {
    const absent = /notion/i.test(b) && /not (in|mentioned|listed)|neither|no mention|isn't in|is not in/i.test(b);
    const ships = /shipped|released|launched|announced/i.test(b);
    const searched = stepTools(trace).includes("web_search");
    const tied = !ships || (searched && /http|according|search|web/i.test(b));
    return [
      gradeRetrieval(trace, [], [DOCS.march, DOCS.august], [DOCS.gl, DOCS.sepDeck, DOCS.janDeck, DOCS.users, DOCS.guest, DOCS.group, DOCS.supply, DOCS.standup, DOCS.prep, DOCS.janCall, DOCS.junCall, DOCS.roadmap]),
      claim("absent", "Notion is not in either competitor scan", absent),
      claim("web", "A product claim is tied to a web result, or the brief says the workspace does not have one", tied && (absent || searched)),
      staleCheck(b, []),
      volumeCheck(b, /gross bookings|blackcomb|take rate|data room/i),
      ...extraChecks(b, [
        { id: "changelog", label: "Extra claim: a ski changelog without a web source", when: /notion[^.]{0,80}(shipped|released|launched)/i },
        { id: "competitor", label: "Extra claim: Notion is a Ridgeline competitor", when: /notion[^.]{0,40}competitor/i },
      ]),
    ];
  }

  if (feature === "Meeting Synthesis") {
    const made = taskArgs(trace);
    const blob = made.map((t) => `${t.title ?? ""} ${t.owner ?? ""} ${t.dueDate ?? ""} ${t.description ?? ""}`).join("\n");
    const finance = /financ/i.test(blob) && /22/.test(blob) && /pdf|data room/i.test(blob);
    const supply = /supply/i.test(blob) && /24/.test(blob) && /ikon/i.test(blob);
    const extraTask = made.some((t) => /blackcomb|rank refresh|12%|gear|flight/i.test(`${t.title} ${t.description}`));
    const held = /thanksgiving/i.test(b) && /\$39/.test(b) && /12%/.test(b) && /not (decided|approved)|wasn't decided|was not decided|no decision/i.test(b);
    return [
      gradeRetrieval(trace, [[DOCS.supply]], [DOCS.standup, DOCS.roadmap], [DOCS.gl, DOCS.sepDeck, DOCS.janDeck, DOCS.users, DOCS.guest, DOCS.group, DOCS.march, DOCS.august, DOCS.janCall, DOCS.junCall, DOCS.prep]),
      claim("held", "Take rate stays put, Snow Pass stays $39, and 12% was not decided", held),
      claim("finance-task", "Creates a Finance task due October 22 for the July pdf", finance),
      claim("supply-task", "Creates a Head of Supply task due October 24 for the Ikon block", supply),
      claim("no-extra-task", "Does not create a task for Blackcomb, the rank refresh, 12%, gear, or flights", !extraTask),
      staleCheck(b, [/\b9\.2%/, /\$120\s?m/i, /\$18\s?m/i]),
      volumeCheck(b, /blackcomb|school district|gross bookings|weski/i),
      ...extraChecks(b, [
        { id: "replacement-rate", label: "Extra claim: a replacement take rate", when: /\b9\.2%|take rate (is|of|to) \d/i },
      ]),
    ];
  }

  if (feature === "Take rate") {
    const held = /do not touch|don't touch|not touch|stays put|leave .{0,20}take rate|no(t)? .{0,30}raise/i.test(b) && /thanksgiving/i.test(b);
    const twelve = /12%/.test(b) && /not (a )?decision|not decided|no date|wasn't decided|was not decided/i.test(b);
    const quiet = /october 16|16 oct|standup/i.test(b) && /september 3|guest recovery|3 sep/i.test(b) && /did not|didn't|no .{0,20}price|not discuss/i.test(b);
    return [
      gradeRetrieval(trace, [[DOCS.supply]], [DOCS.standup, DOCS.guest, DOCS.roadmap], [DOCS.sepDeck, DOCS.janDeck, DOCS.janCall, DOCS.junCall, DOCS.march, DOCS.august, DOCS.gl, DOCS.users, DOCS.group, DOCS.prep]),
      claim("held", "October 8 said not to touch the take rate before Thanksgiving", held),
      claim("twelve", "The 12% idea is not a decision", twelve),
      claim("quiet", "October 16 and September 3 did not discuss price", quiet),
      staleCheck(b, [/\b11%/, /~\s*10%|about 10%/i, /\b9\.2%/]),
      volumeCheck(b, /gross bookings|52,300|weski|blackcomb/i),
      ...extraChecks(b, [
        { id: "ledger-vote", label: "Extra claim: the ledger take rate was a pricing decision", when: /8\.7%[^.]{0,40}(decided|decision|voted)/i },
      ]),
    ];
  }

  if (feature === "Executive Task Management") {
    const refresh = /rank refresh/i.test(b) && /product/i.test(b) && /november\s*1|1 november|nov\.?\s*1/i.test(b) && /in progress/i.test(b);
    const ikon = /ikon/i.test(b) && /legal/i.test(b) && !/our (engineering|eng)|internal (engineering|delay)/i.test(b);
    const why = /thanksgiving/i.test(b);
    const mailed = /subject:|dear /i.test(b);
    return [
      gradeRetrieval(trace, [[DOCS.roadmap, DOCS.standup]], [DOCS.supply], [DOCS.gl, DOCS.sepDeck, DOCS.janDeck, DOCS.users, DOCS.guest, DOCS.group, DOCS.march, DOCS.august, DOCS.janCall, DOCS.junCall, DOCS.prep]),
      claim("tasks-listed", "list_tasks was called", stepTools(trace).includes("list_tasks")),
      claim("refresh", "Rank refresh is in progress, owned by Product, due November 1", refresh),
      claim("ikon", "The Ikon feed is blocked on Ikon's legal review", ikon),
      claim("why", "Thanksgiving bookings are why the date is November 1", why),
      claim("email", "No email is drafted", !mailed),
      staleCheck(b, staleMoney),
      volumeCheck(b, /blackcomb|weski|gross bookings|\$108/i),
    ];
  }

  if (feature === "Before November 6") {
    const finance = /financ/i.test(b) && /22/.test(b) && /pdf|data room/i.test(b);
    const supply = /supply/i.test(b) && /24/.test(b) && /ikon/i.test(b);
    return [
      gradeRetrieval(trace, [[DOCS.supply]], [DOCS.prep, DOCS.gl, DOCS.roadmap], [DOCS.users, DOCS.march, DOCS.august, DOCS.guest, DOCS.group, DOCS.janCall, DOCS.junCall, DOCS.sepDeck, DOCS.janDeck]),
      claim("finance", "Finance still owes the data-room fix on October 22", finance),
      claim("supply", "Head of Supply still owes the Ikon note on October 24", supply),
      staleCheck(b, [/\$120\s?m/i, /55[, ]?000/, /\$18\s?m/i]),
      volumeCheck(b, /blackcomb|weski|school district/i),
      ...extraChecks(b, [
        { id: "present-deck", label: "Extra claim: present the September deck figures", when: /present[^.]{0,40}(\$120|55,000|\$18)/i },
        { id: "firm", label: "Extra claim: a fund or partner name", when: /\b(Sequoia|Andreessen|a16z|Accel)\b/i },
      ]),
    ];
  }

  const school = /blackcomb/i.test(b) && /40/.test(b) && /\$189/.test(b) && /february\s*12/i.test(b) && /december\s*1/i.test(b);
  const normal = /14/.test(b) && /credit/i.test(b) && /not cash|isn't cash|no cash/i.test(b);
  const split = /minneapolis/i.test(b) && /school/i.test(b);
  return [
    gradeRetrieval(trace, [[DOCS.group], [DOCS.guest]], [], [DOCS.gl, DOCS.sepDeck, DOCS.janDeck, DOCS.march, DOCS.august, DOCS.users, DOCS.roadmap, DOCS.janCall, DOCS.junCall, DOCS.supply, DOCS.standup, DOCS.prep]),
    claim("school", "Blackcomb School District terms, including the December 1 deposit", school),
    claim("normal", "Other bookers get a move outside 14 days and a credit inside 14 days", normal),
    claim("split", "The school contract and the normal rule stay separate", split && !/every booker[^.]{0,40}school|school[^.]{0,40}every booker/i.test(b)),
    staleCheck(b, staleMoney),
    volumeCheck(b, /gross bookings|weski|rank refresh|take rate/i),
    ...extraChecks(b, [
      { id: "price", label: "Extra claim: a company price or subscriber count", when: /8\.7%|52,300|\$108/i },
    ]),
  ];
}

function score(checks: Check[]) {
  const earned = checks.filter((c) => c.pass).length;
  return { earned, total: checks.length, pct: checks.length ? earned / checks.length : 0 };
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function printReport(suites: Suite[]) {
  const width = 42;
  console.log("\nVentureOS feature checklist\n");
  console.log(
    "Each item is 1 point. Feature score = passed / items. Overall = every point together.\n"
  );

  for (const group of ["product", "answer"] as const) {
    const rows = suites.filter((s) => s.group === group);
    if (!rows.length) continue;
    console.log(group === "product" ? "Product behavior" : "Copilot answers");
    for (const suite of rows) {
      const s = score(suite.checks);
      const name = suite.feature.padEnd(width, ".");
      console.log(`  ${name} ${s.earned}/${s.total}  ${pct(s.pct)}`);
      for (const c of suite.checks) {
        const mark = c.pass ? "pass" : "FAIL";
        const note = c.note ? ` — ${c.note}` : "";
        console.log(`      [${mark}] ${c.label}${note}`);
      }
    }
    console.log("");
  }

  const all = suites.flatMap((s) => s.checks);
  const product = suites.filter((s) => s.group === "product").flatMap((s) => s.checks);
  const answer = suites.filter((s) => s.group === "answer").flatMap((s) => s.checks);
  const allScore = score(all);
  const productScore = score(product);
  const answerScore = score(answer);
  console.log(`Product score   ${productScore.earned}/${productScore.total}  ${pct(productScore.pct)}`);
  console.log(`Answer score    ${answerScore.earned}/${answerScore.total}  ${pct(answerScore.pct)}`);
  console.log(`Overall score   ${allScore.earned}/${allScore.total}  ${pct(allScore.pct)}`);
  return { productFailed: product.some((c) => !c.pass) };
}

async function toolResult(orgId: string, name: string, args: Record<string, unknown>) {
  const tools = buildTools({ orgId }, [name]);
  const tool = tools[name as keyof typeof tools] as {
    execute?: (input: Record<string, unknown>, opts: { toolCallId: string; messages: unknown[] }) => Promise<unknown>;
  };
  if (!tool?.execute) throw new Error(`${name} is not executable`);
  return tool.execute(args, { toolCallId: "eval", messages: [] });
}

async function main() {
  const suites: Suite[] = [];
  const db = getDb();
  const org = await requireOrg();
  const createdTaskIds: string[] = [];
  const createdDocIds: string[] = [];
  const createdMemoryIds: string[] = [];
  const startedAt = new Date();

  const anonRequest = async (path: string) => {
    const previous = new Map(jar.cookies);
    jar.cookies.clear();
    try {
      return await request(path);
    } finally {
      jar.cookies = previous;
    }
  };

  suites.push({
    feature: "Auth and demo login",
    group: "product",
    checks: [
      await item("login-page", "Logged-out /login offers demo mode and hides Google", async () => {
        const res = await anonRequest("/login");
        const html = await res.text();
        const demo = html.includes("Continue in demo mode");
        const google = html.includes("Continue with Google");
        return {
          pass: res.status === 200 && demo && !google,
          note: `status ${res.status}, demo ${demo}, google button ${google}`,
        };
      }),
      await item("login-gate", "Logged-out /dashboard redirects to /login", async () => {
        const res = await anonRequest("/dashboard");
        const loc = res.headers.get("location") || "";
        return { pass: res.status === 307 && loc.includes("/login"), note: `${res.status} ${loc}` };
      }),
      await item("demo-signin", "Demo credentials create a session", async () => {
        const ok = await signInDemo();
        const sessionRes = await request("/api/auth/session", { redirect: "follow" });
        const session = (await sessionRes.json()) as { user?: { email?: string; name?: string } };
        return {
          pass: ok && session.user?.email === "founder@ventureos.dev",
          note: session.user?.email ?? "no session user",
        };
      }),
    ],
  });

  const pages: Array<{ feature: string; path: string; needles: string[] }> = [
    {
      feature: "Dashboard",
      path: "/dashboard",
      needles: [
        "Ridgeline",
        "Objectives",
        "Open tasks",
        "Upcoming meetings",
        "Documents indexed",
        "Rank refresh out before Thanksgiving bookings",
        "Ikon pass-day feed",
        "November 6 investor meeting",
        "/copilots/competitive-analysis",
        "/copilots/investor-prep",
        "/copilots/meeting-synthesis",
        "/copilots/task-management",
      ],
    },
    {
      feature: "Copilot index",
      path: "/copilots",
      needles: [
        "Competitive Analysis",
        "Investor Prep",
        "Meeting Synthesis",
        "Executive Task Management",
        "Know exactly where you stand",
      ],
    },
    {
      feature: "Knowledge",
      path: "/knowledge",
      needles: [
        "Documents",
        "Company",
        "Market",
        "GL export — Oct 2025 through Sep 2026",
        "Investor deck — January 2026",
        "Investor deck — September 2026",
        "Competitor scan — March 2026",
        "Competitor scan — August 2026",
        "Roadmap, working copy — 13 Oct 2026",
        "WeSki",
        "Add knowledge",
      ],
    },
    {
      feature: "Meetings",
      path: "/meetings",
      needles: [
        "Growth investor meeting",
        "Supply review",
        "Guest recovery",
        "Open Meeting Synthesis",
      ],
    },
    {
      feature: "Tasks board",
      path: "/tasks",
      needles: ["To do", "In progress", "Blocked", "Done", "New task", "Rank refresh", "Ikon pass-day feed", "Day-ticket commission options"],
    },
    {
      feature: "Integrations",
      path: "/integrations",
      needles: ["Gmail", "Google Calendar", "Web Search (Tavily)", "OpenAI", "Inngest"],
    },
    {
      feature: "Settings",
      path: "/settings",
      needles: [
        "Ridgeline",
        "Series B",
        "Ski travel",
        "OpenAI (LLM + embeddings)",
        "Tavily (web search)",
        "Shared agent memory",
        "Do not touch the take rate before Thanksgiving",
      ],
    },
  ];

  for (const page of pages) {
    const loaded = await text(page.path);
    const found = includesAll(loaded.html, page.needles);
    suites.push({
      feature: page.feature,
      group: "product",
      checks: [
        {
          id: "status",
          label: `${page.path} renders for a signed-in session`,
          pass: loaded.status === 200,
          note: `status ${loaded.status}`,
        },
        {
          id: "content",
          label: "Page shows the seeded records for this feature",
          pass: loaded.status === 200 && found.ok,
          note: found.missing.length ? `missing: ${found.missing.join(", ")}` : undefined,
        },
      ],
    });
  }

  const integrationHtml = (await text("/integrations")).html;
  const settingsHtml = (await text("/settings")).html;
  suites.push({
    feature: "Integration status",
    group: "product",
    checks: [
      {
        id: "tavily-connected",
        label: "Integrations shows Tavily connected",
        pass: /Web Search \(Tavily\)[\s\S]{0,400}Connected/.test(integrationHtml),
      },
      {
        id: "openai-connected",
        label: "Integrations shows OpenAI connected",
        pass: /OpenAI[\s\S]{0,400}Connected/.test(integrationHtml),
      },
      {
        id: "gmail-off",
        label: "Gmail shows not connected when Google OAuth is unset",
        pass: /Gmail[\s\S]{0,300}Not connected/.test(integrationHtml),
      },
      {
        id: "calendar-off",
        label: "Google Calendar shows not connected when Google OAuth is unset",
        pass: /Google Calendar[\s\S]{0,300}Not connected/.test(integrationHtml),
      },
      {
        id: "inngest-off",
        label: "Inngest shows not connected when its event key is unset",
        pass: /Inngest[\s\S]{0,400}Not connected/.test(integrationHtml),
      },
      {
        id: "settings-tavily",
        label: "Settings marks Tavily configured",
        pass: /Tavily \(web search\)[\s\S]{0,800}Configured/.test(settingsHtml),
      },
    ],
  });

  const copilotPages = Object.values(COPILOTS);
  const copilotChecks: Check[] = [];
  for (const meta of copilotPages) {
    const loaded = await text(`/copilots/${meta.slug}`);
    copilotChecks.push({
      id: `${meta.slug}-page`,
      label: `${meta.name} workspace shows its starter prompts and the Agent Trace`,
      pass:
        loaded.status === 200 &&
        loaded.html.includes(meta.examples[0]) &&
        loaded.html.includes("Agent Trace"),
      note: loaded.status === 200 ? undefined : `status ${loaded.status}`,
    });
  }
  const missing = await request("/copilots/not-a-copilot");
  copilotChecks.push({
    id: "unknown-slug",
    label: "Unknown copilot slug returns 404",
    pass: missing.status === 404,
    note: `status ${missing.status}`,
  });
  suites.push({ feature: "Copilot workspaces", group: "product", checks: copilotChecks });

  const marker = `FENNEL-HARBOR-${Date.now()}`;
  const longNote = `${marker} is the eval codeword for a lodging deposit policy.\n\n${"Refunds inside 14 days are credited to the next package. ".repeat(40)}\n\n${"Snow Pass renews annually at $39. ".repeat(40)}`;

  suites.push({
    feature: "Document ingest",
    group: "product",
    checks: [
      await item("chunk-short", "Short text stays one chunk", async () => chunkText("One short paragraph.").length === 1),
      await item("chunk-empty", "Empty text produces no chunks", async () => chunkText("   \n\n  ").length === 0),
      await item("chunk-long", "Long text splits into overlapping chunks", async () => {
        const parts = chunkText(longNote);
        const overlaps =
          parts.length > 1 && parts[1].includes(parts[0].slice(-80).trim().slice(0, 40));
        return { pass: parts.length > 1 && overlaps, note: `${parts.length} chunks, overlap ${overlaps}` };
      }),
      await item("reject-empty", "Ingest rejects a note with no text", async () => {
        const res = await request("/api/ingest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: "empty", content: "   " }),
        });
        return { pass: res.status === 400, note: `status ${res.status}` };
      }),
      await item("ingest-note", "A pasted note is stored and chunked", async () => {
        const res = await request("/api/ingest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: `Eval note ${marker}`,
            content: longNote,
            source: "note",
          }),
        });
        const body = (await res.json()) as { chunkCount?: number; document?: { id: string } };
        if (body.document?.id) createdDocIds.push(body.document.id);
        return {
          pass: res.status === 200 && (body.chunkCount ?? 0) > 1,
          note: `status ${res.status}, chunks ${body.chunkCount}`,
        };
      }),
    ],
  });

  suites.push({
    feature: "Embeddings",
    group: "product",
    checks: [
      await item("dimensions", "An embedding has 1536 dimensions", async () => {
        const vec = await embedText("Ridgeline gross bookings");
        return { pass: vec.length === EMBEDDING_DIMENSIONS, note: `length ${vec.length}` };
      }),
    ],
  });

  suites.push({
    feature: "Tasks API",
    group: "product",
    checks: [
      await item("list", "GET /api/tasks returns the seeded board and not the October 8 assignments", async () => {
        const res = await request("/api/tasks", { redirect: "follow" });
        const body = (await res.json()) as { tasks?: Array<{ title: string }> };
        const titles = (body.tasks ?? []).map((t) => t.title);
        const oct8 = titles.some((t) => /data room|july board|ikon note/i.test(t));
        return {
          pass:
            res.status === 200 &&
            titles.includes("Rank refresh") &&
            titles.includes("Ikon pass-day feed") &&
            titles.includes("Day-ticket commission options") &&
            !oct8,
          note: titles.join(" | "),
        };
      }),
      await item("create", "POST /api/tasks creates a task in To do", async () => {
        const res = await request("/api/tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: `Eval task ${marker}`, priority: "low", owner: "Eval" }),
        });
        const body = (await res.json()) as { task?: { id: string; status: string } };
        if (body.task?.id) createdTaskIds.push(body.task.id);
        return {
          pass: res.status === 200 && body.task?.status === "todo",
          note: body.task?.status,
        };
      }),
      await item("patch", "PATCH moves that task to Done", async () => {
        const id = createdTaskIds[0];
        if (!id) return { pass: false, note: "no task to update" };
        const res = await request(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "done" }),
        });
        const body = (await res.json()) as { task?: { status: string } };
        return { pass: res.status === 200 && body.task?.status === "done", note: body.task?.status };
      }),
      await item("missing", "PATCH on an unknown task is 404", async () => {
        const res = await request("/api/tasks/00000000-0000-0000-0000-000000000000", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "done" }),
        });
        return { pass: res.status === 404, note: `status ${res.status}` };
      }),
      await item("delete", "DELETE removes the eval task", async () => {
        const id = createdTaskIds[0];
        if (!id) return { pass: false, note: "no task to delete" };
        const res = await request(`/api/tasks/${id}`, { method: "DELETE" });
        const still = await db.select().from(tasks).where(eq(tasks.id, id));
        if (still.length === 0) createdTaskIds.shift();
        return { pass: res.status === 200 && still.length === 0 };
      }),
    ],
  });

  suites.push({
    feature: "Agent tools",
    group: "product",
    checks: [
      await item("competitors", "list_competitors returns the August scan, not Metabase or Hex", async () => {
        const result = (await toolResult(org.id, "list_competitors", {})) as {
          competitors?: Array<{ name: string }>;
        };
        const names = (result.competitors ?? []).map((c) => c.name).join(" | ");
        return {
          pass: /WeSki/.test(names) && /Ski\.com/.test(names) && !/Metabase|Hex/.test(names),
          note: names,
        };
      }),
      await item("objectives", "list_objectives returns the three seeded OKRs", async () => {
        const result = (await toolResult(org.id, "list_objectives", {})) as {
          objectives?: Array<{ title: string }>;
        };
        return { pass: (result.objectives ?? []).length >= 3, note: `${result.objectives?.length ?? 0} objectives` };
      }),
      await item("meetings", "list_meetings returns the November 6 growth investor meeting", async () => {
        const result = (await toolResult(org.id, "list_meetings", { limit: 8 })) as {
          meetings?: Array<{ title: string }>;
        };
        const titles = (result.meetings ?? []).map((m) => m.title).join(" | ");
        return { pass: titles.includes("Growth investor meeting"), note: titles };
      }),
      await item("calendar-fallback", "read_calendar uses workspace meetings when Google is not connected", async () => {
        const result = (await toolResult(org.id, "read_calendar", {})) as { source?: string; events?: unknown[] };
        return {
          pass: result.source === "workspace" && (result.events?.length ?? 0) > 0,
          note: result.source,
        };
      }),
      await item("email-fallback", "read_email explains that Gmail is not connected", async () => {
        const result = (await toolResult(org.id, "read_email", {})) as { source?: string; emails?: unknown[] };
        return {
          pass: result.source === "demo" && (result.emails?.length ?? 0) === 0,
          note: result.source,
        };
      }),
      await item("tasks-filter", "list_tasks can filter to blocked work", async () => {
        const result = (await toolResult(org.id, "list_tasks", { status: "blocked" })) as {
          tasks?: Array<{ title: string; status: string }>;
        };
        const rows = result.tasks ?? [];
        return {
          pass: rows.some((t) => t.title.includes("Ikon pass-day feed")) && rows.every((t) => t.status === "blocked"),
          note: rows.map((t) => t.title).join(" | "),
        };
      }),
      await item("get-metric-snapshot", "get_metric with no args returns the trailing ledger snapshot", async () => {
        const result = (await toolResult(org.id, "get_metric", {})) as {
          records?: Array<{ metric: string; period: string; value: number }>;
          claims?: unknown[];
        };
        const bookings = (result.records ?? []).find(
          (r) => /gross bookings/i.test(r.metric) && /twelve/i.test(r.period)
        );
        return {
          pass: bookings?.value === 108_000_000 && (result.claims ?? []).length === 0,
          note: `${result.records?.length ?? 0} records, TTM bookings ${bookings?.value ?? "missing"}`,
        };
      }),
      await item("get-metric", "get_metric returns ledger records apart from deck claims", async () => {
        const result = (await toolResult(org.id, "get_metric", {
          metric: "gross bookings",
          include_claims: true,
        })) as {
          records?: Array<{ period: string; value: number }>;
          claims?: Array<{ document: string; value: number }>;
        };
        const q4 = (result.records ?? []).find((r) => /q4 2025/i.test(r.period));
        return {
          pass: q4?.value === 36_400_000 && (result.claims ?? []).some((c) => c.value === 42_000_000),
          note: `Q4 2025 record ${q4?.value ?? "missing"}, ${result.claims?.length ?? 0} claims`,
        };
      }),
      await item("query-dataset", "query_dataset counts the 2,000-row users export", async () => {
        const result = (await toolResult(org.id, "query_dataset", {})) as { totalRows?: number };
        return { pass: result.totalRows === 2000, note: `${result.totalRows ?? 0} rows` };
      }),
      await item("lookup-routing", "requiredLookup picks the store that matches the question", async () => {
        const figures = ["retrieve_context", "get_metric", "query_dataset", "list_meetings"];
        const tasks = ["retrieve_context", "list_tasks", "list_objectives"];
        const notes = ["retrieve_context", "create_task"];
        const cases: Array<[string, string[], string | null]> = [
          ["Prep me for the November 6 growth investor meeting. What should I walk in with?", figures, "get_metric"],
          ["Did we decide to raise the take rate?", [...notes, "get_metric"], null],
          ["What is actually in motion before Thanksgiving bookings, and what is stuck?", tasks, "list_tasks"],
          ["What is still open before the November 6 meeting?", tasks, "list_tasks"],
          ["How many users are in the export?", figures, "query_dataset"],
          ["What's the deposit situation on the February school block?", notes, null],
        ];
        const missed = cases.filter(([q, allowed, want]) => requiredLookup(q, allowed) !== want);
        return {
          pass: missed.length === 0,
          note: missed.map(([q, , want]) => `${want ?? "none"} ← ${q.slice(0, 40)}`).join(" | ") || "6/6",
        };
      }),
      await item("versions", "retrieve_context searches the newest version unless history is asked for", async () => {
        const query = { queries: ["investor deck gross bookings", "competitor scan WeSki"] };
        const titles = (r: unknown) =>
          new Set(((r as { sources?: Array<{ documentTitle: string }> }).sources ?? []).map((s) => s.documentTitle));
        const latest = titles(await toolResult(org.id, "retrieve_context", query));
        const history = titles(await toolResult(org.id, "retrieve_context", { ...query, include_history: true }));
        const old = ["Investor deck — January 2026", "Competitor scan — March 2026"];
        return {
          pass: old.every((t) => !latest.has(t)) && old.some((t) => history.has(t)),
          note: `default: ${Array.from(latest).join(" | ")}`,
        };
      }),
      await item("create-task", "create_task writes an agent-sourced task", async () => {
        const result = (await toolResult(org.id, "create_task", {
          title: `Eval agent task ${marker}`,
          priority: "low",
          owner: "Eval",
        })) as { created?: { id: string; source: string } };
        if (result.created?.id) createdTaskIds.push(result.created.id);
        return { pass: result.created?.source === "agent", note: result.created?.source };
      }),
      await item("save-memory", "save_memory stores a fact on the org", async () => {
        const result = (await toolResult(org.id, "save_memory", {
          content: `Eval memory ${marker}`,
          type: "fact",
        })) as { saved?: { id: string; type: string } };
        if (result.saved?.id) createdMemoryIds.push(result.saved.id);
        return { pass: result.saved?.type === "fact" };
      }),
      await item("web-search", "web_search returns a live Tavily result", async () => {
        const result = await webSearch("OpenSnow ski forecast", 1);
        return {
          pass: result.configured && result.results.length > 0 && !result.results[0].title.startsWith("[Demo]"),
          note: result.results[0]?.title,
        };
      }),
    ],
  });

  suites.push({
    feature: "Background workflows",
    group: "product",
    checks: [
      await item("inngest-fns", "Inngest registers the background run and the weekday sweep", async () => {
        const ids = inngestFunctions.map((fn) => (fn as { id: () => string }).id?.() ?? "");
        return {
          pass: ids.includes("run-agent-job") && ids.includes("daily-followup-sweep"),
          note: ids.join(", "),
        };
      }),
      await item("inngest-route", "GET /api/inngest is served by the Inngest SDK", async () => {
        const res = await request("/api/inngest");
        const handled = res.headers.get("x-inngest-sdk-handled") === "true";
        const ready = res.status === 200;
        return {
          pass: handled && (ready || res.status === 500),
          note: ready
            ? "serving"
            : "mounted; local runs need INNGEST_DEV=1 or INNGEST_SIGNING_KEY",
        };
      }),
    ],
  });

  suites.push({
    feature: "Agent API",
    group: "product",
    checks: [
      await item("bad-body", "A missing prompt is rejected", async () => {
        const res = await request("/api/agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ copilotType: "general" }),
        });
        return { pass: res.status === 400, note: `status ${res.status}` };
      }),
    ],
  });

  for (const id of [...createdDocIds]) {
    await db.delete(documents).where(eq(documents.id, id));
  }
  createdDocIds.length = 0;

  const rubrics: Array<{
    type: keyof typeof COPILOTS | "general";
    feature: string;
    prompt: string;
    allowed: string[];
    facts: Array<{ id: string; label: string; test: (brief: string, trace: AgentTrace) => boolean }>;
  }> = [
    {
      type: "investor_prep",
      feature: "Investor Prep",
      prompt: "Prep me for the November 6 growth investor meeting. What should I walk in with?",
      allowed: COPILOTS.investor_prep.tools,
      facts: [
        { id: "sequoia", label: "Names the Sequoia meeting", test: (b) => /sequoia/i.test(b) },
        {
          id: "traction",
          label: "Uses a seeded traction figure (MRR, customer count, or NRR)",
          test: (b) => /42[, ]?000|\$42k|42k|118%|47/.test(b),
        },
        {
          id: "raise",
          label: "States the $3M raise or the $15M cap",
          test: (b) => /\$3\s?m|3 million|\$15\s?m|15 million/i.test(b),
        },
        {
          id: "shape",
          label: "Covers narrative, metrics, and questions",
          test: (b) => /narrative/i.test(b) && /metric/i.test(b) && /question/i.test(b),
        },
      ],
    },
    {
      type: "competitive_analysis",
      feature: "Competitive Analysis",
      prompt: "What do WeSki and Ski.com actually sell, and what revenue can we stand behind?",
      allowed: COPILOTS.competitive_analysis.tools,
      facts: [
        { id: "names", label: "Names Metabase and Hex", test: (b) => /metabase/i.test(b) && /hex/i.test(b) },
        {
          id: "price",
          label: "Includes a seeded price (Metabase hosted or Hex per seat)",
          test: (b) => /\$85|\$24/.test(b),
        },
        {
          id: "wedge",
          label: "States where Northwind is proactive or Slack-delivered",
          test: (b) => /slack|proactive/i.test(b),
        },
        {
          id: "shape",
          label: "Includes a landscape and a differentiation section",
          test: (b) => /landscape|position/i.test(b) && /different|where we win|exposed/i.test(b),
        },
      ],
    },
    {
      type: "competitive_analysis",
      feature: "Notion",
      prompt: "What did Notion ship for ski trips this quarter?",
      allowed: COPILOTS.competitive_analysis.tools,
      facts: [],
    },
    {
      type: "meeting_synthesis",
      feature: "Meeting Synthesis",
      prompt: "Go through the October 8 supply notes and make tasks only for what was actually handed to someone.",
      allowed: COPILOTS.meeting_synthesis.tools,
      facts: [
        { id: "slack", label: "Records the Slack-not-email decision", test: (b) => /slack/i.test(b) },
        {
          id: "root",
          label: "Records root-cause hypotheses as the priority",
          test: (b) => /root-cause|root cause/i.test(b),
        },
        {
          id: "actions",
          label: "Lists action items",
          test: (b) => /action/i.test(b),
        },
        {
          id: "created",
          label: "Calls create_task for those action items",
          test: (_b, trace) => stepTools(trace).includes("create_task"),
        },
        {
          id: "retrieved",
          label: "Calls retrieve_context, which the copilot prompt requires",
          test: (_b, trace) => stepTools(trace).includes("retrieve_context"),
        },
      ],
    },
    {
      type: "meeting_synthesis",
      feature: "Take rate",
      prompt: "Did we decide to raise the take rate?",
      allowed: COPILOTS.meeting_synthesis.tools,
      facts: [],
    },
    {
      type: "task_management",
      feature: "Executive Task Management",
      prompt: "What is actually in motion before Thanksgiving bookings, and what is stuck?",
      allowed: COPILOTS.task_management.tools,
      facts: [
        { id: "deck", label: "Surfaces the seed deck task", test: (b) => /seed deck/i.test(b) },
        { id: "blocked", label: "Surfaces the blocked SOC 2 work", test: (b) => /soc 2/i.test(b) },
        {
          id: "objective",
          label: "Ties the plan to a Q3 objective",
          test: (b) => /snowflake|\$75k|\$3m|seed round/i.test(b),
        },
        {
          id: "shape",
          label: "Separates priorities from slipping or blocked work",
          test: (b) => /priorit/i.test(b) && /slip|block/i.test(b),
        },
        {
          id: "retrieved",
          label: "Calls retrieve_context, which the copilot prompt requires",
          test: (_b, trace) => stepTools(trace).includes("retrieve_context"),
        },
      ],
    },
    {
      type: "task_management",
      feature: "Before November 6",
      prompt: "What is still open before the November 6 meeting?",
      allowed: COPILOTS.task_management.tools,
      facts: [],
    },
    {
      type: "general",
      feature: "School deposit",
      prompt: "What's the deposit situation on the February school block, and is that the normal rule?",
      allowed: ["retrieve_context", "get_metric", "query_dataset"],
      facts: [
        {
          id: "codeword",
          label: "Retrieves the note that was just ingested",
          test: (b, trace) => {
            const blob = JSON.stringify(trace.events);
            return b.includes(marker) || blob.includes(marker);
          },
        },
        {
          id: "policy",
          label: "Quotes the 14-day lodging refund policy",
          test: (b, trace) => /14/.test(b) || /14/.test(JSON.stringify(trace.events)),
        },
      ],
    },
  ];

  for (const rubric of rubrics) {
    process.stdout.write(`\nRunning ${rubric.feature}…\n`);
    const trace = await runAgent(rubric.type, rubric.prompt);
    const toolsUsed = stepTools(trace);
    const disallowed = toolsUsed.filter((name) => !rubric.allowed.includes(name));
    let persisted = false;
    if (trace.runId) {
      const [row] = await db.select().from(agentRuns).where(eq(agentRuns.id, trace.runId));
      persisted = row?.status === "completed" && Boolean(row.brief);
    }

    suites.push({
      feature: `${rubric.feature} trace`,
      group: "product",
      checks: [
        { id: "stream", label: "Run streams a run id and no error event", pass: Boolean(trace.runId) && !trace.error, note: trace.error },
        { id: "plan", label: "Trace includes a plan step", pass: hasStepType(trace, "plan") },
        {
          id: "tools-ran",
          label: "Trace records a retrieval or another tool call",
          pass: hasStepType(trace, "retrieval") || toolsUsed.length > 0,
        },
        { id: "final", label: "Trace ends in a synthesized brief", pass: hasStepType(trace, "final") && trace.brief.trim().length > 40 },
        { id: "tools", label: "Only this copilot's tools are called", pass: disallowed.length === 0, note: disallowed.join(", ") || toolsUsed.join(", ") },
        { id: "saved", label: "The run is stored as completed", pass: persisted },
      ],
    });

    suites.push({
      feature: rubric.feature,
      group: "answer",
      checks: answerChecks(rubric.feature, trace),
    });
  }

  for (const id of createdTaskIds) {
    await db.delete(tasks).where(eq(tasks.id, id));
  }
  await db
    .delete(tasks)
    .where(and(eq(tasks.orgId, org.id), eq(tasks.source, "agent"), gt(tasks.createdAt, startedAt)));
  for (const id of createdMemoryIds) {
    await db.delete(memories).where(eq(memories.id, id));
  }
  await db
    .delete(memories)
    .where(and(eq(memories.orgId, org.id), eq(memories.sourceRef, "agent"), gt(memories.createdAt, startedAt)));
  for (const id of createdDocIds) {
    await db.delete(documents).where(eq(documents.id, id));
  }

  const { productFailed } = printReport(suites);
  process.exit(productFailed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

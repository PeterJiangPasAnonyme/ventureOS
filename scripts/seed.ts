/**
 * Seeds the demo workspace as Ridgeline, from the messy files in eval/ridgeline.
 * Replaces the Northwind org. Run with: npm run db:seed
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { ingestDocument, sheetsToText, type IngestInput, type SheetData } from "../src/lib/ai/ingest";

const {
  organizations,
  competitors,
  marketNotes,
  objectives,
  meetings,
  tasks,
  memories,
} = schema;

const ROOT = path.join(__dirname, "..", "eval", "ridgeline");

function readText(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function pptxText(rel: string): string {
  const file = path.join(ROOT, rel);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ridgeline-deck-"));
  execSync(`unzip -q -o ${JSON.stringify(file)} -d ${JSON.stringify(dir)}`);
  const slidesDir = path.join(dir, "ppt", "slides");
  const slides = fs
    .readdirSync(slidesDir)
    .filter((name) => /^slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/\d+/)?.[0] ?? 0);
      const nb = Number(b.match(/\d+/)?.[0] ?? 0);
      return na - nb;
    });
  return slides
    .map((name, i) => {
      const xml = fs.readFileSync(path.join(slidesDir, name), "utf8");
      const bits = Array.from(xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)).map((m) =>
        m[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
      );
      return `Slide ${i + 1}\n${bits.join("\n")}`;
    })
    .join("\n\n");
}

function xlsxSheets(rel: string): SheetData[] {
  const file = path.join(ROOT, rel);
  const py = `
import re, json
from openpyxl import load_workbook
from openpyxl.utils import range_boundaries

wb = load_workbook(${JSON.stringify(file)}, data_only=False)
cache = {}

def sheet_of(current, spec):
    spec = spec.replace("$", "")
    if "!" in spec:
        name, spec = spec.split("!", 1)
        if name.startswith("'") and name.endswith("'"):
            name = name[1:-1]
        return name, spec
    return current, spec

def bounds(spec):
    if ":" not in spec:
        spec = spec + ":" + spec
    a, b = spec.split(":")
    if re.fullmatch(r"[A-Z]+", a):
        a = a + "1"
    if re.fullmatch(r"[A-Z]+", b):
        b = b + "1048576"
    return range_boundaries(a + ":" + b)

def raw_cell(sheet, coord):
    return wb[sheet][coord].value

def value_at(sheet, coord):
    key = (sheet, coord)
    if key in cache:
        return cache[key]
    cache[key] = 0
    raw = raw_cell(sheet, coord)
    val = eval_expr(sheet, raw[1:]) if isinstance(raw, str) and raw.startswith("=") else raw
    cache[key] = val
    return val

def cells(current, spec):
    sheet, spec = sheet_of(current, spec)
    min_col, min_row, max_col, max_row = bounds(spec)
    ws = wb[sheet]
    max_row = min(max_row, ws.max_row or min_row)
    out = []
    for row in ws.iter_rows(min_row=min_row, max_row=max_row, min_col=min_col, max_col=max_col):
        for c in row:
            out.append(value_at(sheet, c.coordinate))
    return out

def num(v):
    if isinstance(v, bool) or v is None or v == "-":
        return 0
    if isinstance(v, (int, float)):
        return v
    try:
        return float(v)
    except Exception:
        return 0

def split_args(s):
    parts, buf, quoted = [], "", False
    for ch in s:
        if ch == '"':
            quoted = not quoted
        if ch == "," and not quoted:
            parts.append(buf.strip())
            buf = ""
        else:
            buf += ch
    parts.append(buf.strip())
    return parts

def eval_expr(sheet, expr):
    def repl_call(m):
        name = m.group(1).upper()
        arg = m.group(2)
        if name == "SUM":
            return str(sum(num(v) for v in cells(sheet, arg)))
        if name == "COUNTA":
            return str(sum(1 for v in cells(sheet, arg) if v not in (None, "")))
        if name == "COUNTBLANK":
            return str(sum(1 for v in cells(sheet, arg) if v in (None, "")))
        if name == "COUNTIF":
            rng, literal = split_args(arg)
            want = literal
            if want.startswith('"') and want.endswith('"'):
                want = want[1:-1]
            return str(sum(1 for v in cells(sheet, rng) if str(v if v is not None else "") == want))
        if name == "IF":
            cond, a, b = split_args(arg)
            return "(" + a + " if (" + cond + ") else " + b + ")"
        return m.group(0)
    prev = None
    cur = expr
    while cur != prev:
        prev = cur
        cur = re.sub(r"([A-Za-z]+)\\(([^()]+)\\)", repl_call, cur)
    cur = re.sub(r"(?<![<>=])=(?!=)", "==", cur)
    def repl_ref(m):
        ref = m.group(0)
        sh, coord = sheet_of(sheet, ref)
        val = value_at(sh, coord)
        if isinstance(val, str):
            return '"' + val.replace('"', "") + '"'
        if val is None:
            return "0"
        return str(val)
    cur = re.sub(r"(?:(?:'[^']+'|[A-Za-z][A-Za-z0-9]*)!)?\\$?[A-Z]{1,3}\\$?\\d+", repl_ref, cur)
    try:
        return eval(cur, {"__builtins__": {}}, {})
    except Exception:
        return expr

def out(cell, val):
    if val is None or val == "":
        return None
    if isinstance(val, bool):
        return str(val)
    if isinstance(val, (int, float)):
        if "%" in (cell.number_format or ""):
            return {"pct": val}
        return val
    if isinstance(val, str) and val.startswith("="):
        return None
    return str(val)

sheets = []
for ws in wb.worksheets:
    rows = []
    for row in ws.iter_rows():
        vals = []
        for c in row:
            raw = c.value
            val = eval_expr(ws.title, raw[1:]) if isinstance(raw, str) and raw.startswith("=") else raw
            vals.append(out(c, val))
        while vals and vals[-1] is None:
            vals.pop()
        rows.append(vals)
    sheets.append({"name": ws.title, "rows": rows})
print(json.dumps(sheets))
`;
  return JSON.parse(execSync("python -", { input: py, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local first.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });
const db = drizzle(sql, { schema });

async function main() {
  console.log("Seeding Ridgeline…");
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await db.delete(organizations).where(eq(organizations.slug, "ventureos"));

  const [org] = await db
    .insert(organizations)
    .values({
      name: "Ridgeline",
      slug: "ventureos",
      oneLiner:
        "Ranks the resort for your dates and snow, then books the room, the lift, and the ride in.",
      description:
        "Denver ski-trip company, founded 2019, Series B. A skier enters dates, a home airport, Epic or Ikon or a day ticket, and a level. The package is lodging, lift or pass-day, and ground transfer. Snow Pass is the alert. The notes, decks, and ledger in this workspace do not all say the same thing.",
      stage: "Series B",
      industry: "Ski travel",
      website: "https://ridgeline.example",
    })
    .returning();
  console.log("  • org:", org.name);

  const gl = xlsxSheets("finance/ridgeline-gl-2025Q4-2026Q3.xlsx");
  const users = xlsxSheets("data/users-export-2026-10-12.xlsx");
  const day = (d: string) => new Date(`${d}T12:00:00Z`);

  const docs: Omit<IngestInput, "orgId">[] = [
    { title: "Guest recovery — 3 Sep 2026", content: readText("notes/2026-09-03-guest-recovery.txt"), source: "note", docKind: "note", docDate: day("2026-09-03") },
    { title: "Group sales queue — 2 Oct 2026", content: readText("notes/2026-10-02-group-sales-fwd.txt"), source: "note", docKind: "note", docDate: day("2026-10-02") },
    { title: "Supply review — 8 Oct 2026", content: readText("notes/2026-10-08-supply.txt"), source: "note", docKind: "note", docDate: day("2026-10-08") },
    { title: "Rank standup — 16 Oct 2026", content: readText("notes/2026-10-16-rank-standup.txt"), source: "note", docKind: "note", docDate: day("2026-10-16") },
    { title: "Investor call — 12 Jan 2026", content: readText("notes/2026-01-12-investor-call.txt"), source: "note", docKind: "call", docDate: day("2026-01-12") },
    { title: "Investor call — 3 Jun 2026", content: readText("notes/2026-06-03-investor-call.txt"), source: "note", docKind: "call", docDate: day("2026-06-03") },
    { title: "Investor prep — 28 Sep 2026", content: readText("notes/2026-09-28-investor-prep.txt"), source: "note", docKind: "note", docDate: day("2026-09-28") },
    { title: "Roadmap, working copy — 13 Oct 2026", content: readText("notes/roadmap-working.txt"), source: "note", docKind: "roadmap", docDate: day("2026-10-13"), series: "roadmap" },
    { title: "Competitor scan — March 2026", content: readText("research/competitor-scan-2026-03.txt"), source: "upload", docKind: "scan", docDate: day("2026-03-01"), datePrecision: "month", series: "competitor-scan" },
    { title: "Competitor scan — August 2026", content: readText("research/competitor-scan-2026-08.txt"), source: "upload", docKind: "scan", docDate: day("2026-08-01"), datePrecision: "month", series: "competitor-scan" },
    { title: "Investor deck — January 2026", content: pptxText("decks/Ridgeline-investor-deck-2026-01.pptx"), source: "upload", docKind: "deck", docDate: day("2026-01-01"), datePrecision: "month", series: "investor-deck" },
    { title: "Investor deck — September 2026", content: pptxText("decks/Ridgeline-investor-deck-2026-09.pptx"), source: "upload", docKind: "deck", docDate: day("2026-09-01"), datePrecision: "month", series: "investor-deck" },
    { title: "GL export — Oct 2025 through Sep 2026", content: sheetsToText(gl), sheets: gl, source: "upload", docKind: "ledger", docDate: day("2026-10-16") },
    { title: "Users export — 12 Oct 2026", content: sheetsToText(users), sheets: users, source: "upload", docKind: "dataset", docDate: day("2026-10-12") },
  ];

  for (const d of docs) {
    const { chunkCount } = await ingestDocument({ ...d, orgId: org.id, mimeType: "text/plain" });
    console.log(`  • document: ${d.title} (${chunkCount} chunks)`);
  }

  await db.insert(competitors).values([
    {
      orgId: org.id,
      name: "WeSki",
      website: "https://www.weski.com",
      positioning: "Flight, stay, and ground transfer in one checkout. Thin resort pages.",
      strengths: "The flight is inside the package.",
      weaknesses: "No weather on the resort tab.",
      pricing: "August scan: estimated $5–6M. March scan said $8M.",
      fundingStage: "Raised $1.44M total. Feb 2023: $0.43M at $2.26M post.",
      notes: "Do not use the March revenue figure.",
    },
    {
      orgId: org.id,
      name: "Ski.com",
      website: "https://www.ski.com",
      positioning: "A person plans the trip. Lodging on the page via Expedia. Lifts, sometimes rentals.",
      strengths: "Expert planner.",
      weaknesses: "Not a snow-ranked search.",
      pricing: "Unresolved. August scan: under $5M, and other sources at $20M and $40M. March picked $15M and later called that a bad split.",
      fundingStage: "Bought Rocky Mountain Tours years ago.",
    },
    {
      orgId: org.id,
      name: "OnTheSnow",
      website: "https://www.onthesnow.com",
      positioning: "Search plus snow. App does favorite-resort alerts and cams.",
      strengths: "About 1.7M visits a month in the Crunchbase note.",
      weaknesses: "Not a package.",
      pricing: "Crunchbase revenue under $1M, which does not match the traffic. Both left as written.",
    },
    {
      orgId: org.id,
      name: "Skiresort.info",
      website: "https://www.skiresort.info",
      positioning: "Deep filters. Ads, not checkout.",
      strengths: "Snow depth, slope length, and a lot of other filters.",
      weaknesses: "The UI is a junk drawer.",
      pricing: "Crunchbase revenue under $1M. Visits were about 25k, then a large monthly jump.",
    },
    {
      orgId: org.id,
      name: "OpenSnow",
      website: "https://opensnow.com",
      positioning: "Forecast app. Not a booking site.",
      strengths: "Forecasts, cams, avalanche, local experts. Subscription after a trial.",
      weaknesses: "Does not sell the trip.",
      pricing: "Crunchbase revenue under $1M.",
      fundingStage: "$3M seed in 2022.",
    },
    {
      orgId: org.id,
      name: "Liftopia",
      website: "https://www.liftopia.com",
      positioning: "Lift tickets, then a redirect to the resort.",
      strengths: "Discounted tickets by region.",
      weaknesses: "Almost no resort information. Spotlio bought them.",
      pricing: "Revenue band $1–10M.",
      fundingStage: "Raised $12.68M. Valuation $21.5M in Sep 2018.",
    },
    {
      orgId: org.id,
      name: "Mindtrip",
      website: "https://mindtrip.ai",
      positioning: "General trip chatbot. Not a ski product.",
      strengths: "Map pins, then it sends you away to book.",
      weaknesses: "A ski request in the March scan came back as a beach.",
      fundingStage: "$20M raised. $55M post in 2024.",
      notes: "August scan says leave it off the competitor slide unless asked. The September deck still mentions it.",
    },
  ]);
  console.log("  • 7 competitors");

  await db.insert(marketNotes).values([
    {
      orgId: org.id,
      title: "March 2026 competitor scan",
      category: "Old",
      body: "WeSki about $8M. Ski.com $15M, with $20M and $40M also written in the same note. Flights still described as next. The file is still in the folder.",
      source: "research/competitor-scan-2026-03.txt",
    },
    {
      orgId: org.id,
      title: "August 2026 competitor scan",
      category: "Later",
      body: "WeSki $5–6M, estimated. Ski.com unresolved: under $5M, and other sources at $20M and $40M. March's $15M is called a bad split. Flight is not in the Ridgeline package.",
      source: "research/competitor-scan-2026-08.txt",
    },
  ]);

  await db.insert(objectives).values([
    {
      orgId: org.id,
      title: "Rank refresh out before Thanksgiving bookings",
      description:
        "Working roadmap, touched 13 Oct. Original date was 15 Sep. Product is saying 1 Nov. Ikon pass-days will not be in it.",
      quarter: "Nov 2026",
      progress: 50,
      status: "at_risk",
    },
    {
      orgId: org.id,
      title: "Ikon pass-day feed",
      description: "Our side is done. Sitting with their legal since August. No date they will sign.",
      quarter: "FY2027",
      progress: 20,
      status: "at_risk",
    },
    {
      orgId: org.id,
      title: "November 6 investor meeting",
      description:
        "Internal prep on 28 Sep: do not walk the September deck if the GL is closed. Q3 was not on that deck.",
      quarter: "Nov 2026",
      progress: 30,
      status: "on_track",
    },
  ]);

  await db.insert(meetings).values([
    {
      orgId: org.id,
      title: "Guest recovery",
      attendees: "CEO, Finance, Support",
      startsAt: new Date("2026-09-03T15:00:00Z"),
      summary: "Phone notes. Missed the first 10 minutes.",
      transcript: readText("notes/2026-09-03-guest-recovery.txt"),
      decisions: [
        "14 days out, they can move the trip. Inside 14 days it is a credit, not cash.",
      ],
    },
    {
      orgId: org.id,
      title: "Investor call",
      attendees: "CEO, an investor",
      startsAt: new Date("2026-01-12T18:00:00Z"),
      summary: "They read the January deck back. Nobody corrected it on the call.",
      transcript: readText("notes/2026-01-12-investor-call.txt"),
    },
    {
      orgId: org.id,
      title: "Investor call",
      attendees: "CEO, an investor",
      startsAt: new Date("2026-06-03T17:00:00Z"),
      summary: "Post-close update. Cash and subscriber figures were said from memory.",
      transcript: readText("notes/2026-06-03-investor-call.txt"),
    },
    {
      orgId: org.id,
      title: "Investor prep",
      attendees: "Internal",
      startsAt: new Date("2026-09-28T16:00:00Z"),
      summary: "Prep for November 6. Finance does not want the September deck walked in.",
      transcript: readText("notes/2026-09-28-investor-prep.txt"),
    },
    {
      orgId: org.id,
      title: "Supply review",
      attendees: "CEO, Head of Supply, Finance",
      startsAt: new Date("2026-10-08T17:00:00Z"),
      summary: "Late notes. Take rate not touched. Two things were actually handed out.",
      transcript: readText("notes/2026-10-08-supply.txt"),
      decisions: [
        "Do not touch the take rate before Thanksgiving.",
        "Snow Pass stays $39.",
        "12% on day-ticket-only packages was not decided.",
      ],
    },
    {
      orgId: org.id,
      title: "Rank standup",
      attendees: "Product, Head of Supply",
      startsAt: new Date("2026-10-16T22:00:00Z"),
      summary: "Twenty minutes. Refresh still 1 Nov. Ikon still blocked.",
      transcript: readText("notes/2026-10-16-rank-standup.txt"),
    },
    {
      orgId: org.id,
      title: "Growth investor meeting",
      attendees: "CEO, incoming growth investor",
      startsAt: new Date("2026-11-06T21:00:00Z"),
      summary: "Has not happened. No partner name. September deck was drafted for this meeting.",
      transcript: "No notes. The meeting is on 6 Nov 2026.",
    },
  ]);
  console.log("  • 7 meetings");

  await db.insert(tasks).values([
    {
      orgId: org.id,
      title: "Rank refresh",
      description: "Re-sort by travel time, what's open, and the forecast. Due 1 Nov. Ikon pass-days will not be in it.",
      priority: "urgent",
      status: "in_progress",
      owner: "Product",
      dueDate: new Date("2026-11-01T17:00:00Z"),
      source: "manual",
    },
    {
      orgId: org.id,
      title: "Ikon pass-day feed",
      description: "Blocked on Ikon's legal, not ours. Redlines went back in August.",
      priority: "high",
      status: "blocked",
      owner: "Supply",
      source: "manual",
    },
    {
      orgId: org.id,
      title: "Day-ticket commission options",
      description: "12% on day-ticket-only, pass-day unchanged. Not approved. No date.",
      priority: "low",
      status: "todo",
      owner: "Finance",
      source: "manual",
    },
  ]);
  console.log("  • 3 tasks");

  await db.insert(memories).values([
    {
      orgId: org.id,
      type: "follow_up",
      content: "Finance: get the July board pdf out of the data room before 22 Oct. Use the GL. The replacement figure is not written in the notes.",
      sourceRef: "2026-10-08-supply",
    },
    {
      orgId: org.id,
      type: "follow_up",
      content: "Head of Supply: short note to the CEO on the Ikon feed, including the legal block, by 24 Oct.",
      sourceRef: "2026-10-08-supply",
    },
    {
      orgId: org.id,
      type: "decision",
      content: "Do not touch the take rate before Thanksgiving. Snow Pass stays $39. The 12% day-ticket idea was not decided.",
      sourceRef: "2026-10-08-supply",
    },
    {
      orgId: org.id,
      type: "fact",
      content: "January deck still says flights are next and gear is this year. The 13 Oct roadmap says both are not doing.",
      sourceRef: "roadmap-working",
    },
  ]);
  console.log("  • 4 memories");

  console.log("Done. Reload the app and sign in with demo mode.");
  await sql.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  await sql.end().catch(() => {});
  process.exit(1);
});

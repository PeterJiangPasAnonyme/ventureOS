import { generateObject } from "ai";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { documents, chunks, metrics, datasetRows } from "@/lib/db/schema";
import { embedTexts } from "./embeddings";
import { chatModel, hasOpenAI } from "./provider";
import type { Document, DocKind } from "@/lib/db/schema";
import { formatDocDate } from "@/lib/utils";

const CHUNK_SIZE = 1200; // characters
const CHUNK_OVERLAP = 150;
const SECTION_SIZE = 900;
const TABLE_BLOCK_ROWS = 12;
/** Tabs with more rows than this are stored as dataset rows, not embedded. */
const DATASET_MIN_ROWS = 200;

/** Splits text into overlapping chunks on paragraph/sentence boundaries. */
export function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  if (clean.length <= CHUNK_SIZE) return [clean];

  const paragraphs = clean.split(/\n\n+/);
  const out: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length > CHUNK_SIZE && current) {
      out.push(current.trim());
      // start next chunk with a tail overlap of the previous one
      current = current.slice(-CHUNK_OVERLAP) + "\n\n" + para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
    // hard-split very long paragraphs
    while (current.length > CHUNK_SIZE * 1.5) {
      out.push(current.slice(0, CHUNK_SIZE).trim());
      current = current.slice(CHUNK_SIZE - CHUNK_OVERLAP);
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

export type Cell = string | number | null | { pct: number };

export interface SheetData {
  name: string;
  rows: Cell[][];
}

export interface Section {
  label?: string;
  text: string;
}

export interface IngestInput {
  orgId: string;
  title: string;
  content: string;
  source?: Document["source"];
  mimeType?: string;
  url?: string;
  metadata?: Record<string, unknown>;
  docDate?: Date;
  datePrecision?: "day" | "month";
  docKind?: DocKind;
  series?: string;
  /** Parsed spreadsheet tabs. When present, they drive chunking instead of `content`. */
  sheets?: SheetData[];
}

const KIND_LABEL: Record<DocKind, string> = {
  note: "meeting note",
  call: "investor call note",
  deck: "investor deck",
  scan: "competitor scan",
  roadmap: "roadmap",
  ledger: "general ledger",
  dataset: "data export",
  upload: "document",
};

function cellText(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "object") return `${(cell.pct * 100).toFixed(1)}%`;
  if (typeof cell === "number") {
    if (Math.abs(cell - Math.round(cell)) < 1e-6 && Math.abs(cell) >= 100) {
      return Math.round(cell).toLocaleString("en-US");
    }
    return String(Number(cell.toFixed(4)));
  }
  return String(cell).replace(/\n/g, " ");
}

function rowText(row: Cell[]): string {
  return row.map(cellText).join(" | ").replace(/(\s\|\s)+$/, "");
}

function nonEmpty(row: Cell[]) {
  return row.filter((c) => c !== null && c !== "").length;
}

function headerIndex(rows: Cell[][]): number {
  return rows.findIndex((r) => nonEmpty(r) >= 3);
}

/** Plain-text rendering of every tab, used as the document body. */
export function sheetsToText(sheets: SheetData[]): string {
  return sheets
    .map((s) => {
      const lines = s.rows.filter((r) => nonEmpty(r) > 0).map(rowText);
      return `## ${s.name}\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

/** Groups paragraphs into sections of at most SECTION_SIZE, splitting long ones on sentences. */
function paragraphSections(text: string): Section[] {
  const paras = text.replace(/\r\n/g, "\n").split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
  const pieces: string[] = [];
  for (const p of paras) {
    if (p.length <= SECTION_SIZE) {
      pieces.push(p);
      continue;
    }
    let cur = "";
    for (const sentence of p.split(/(?<=[.!?])\s+/)) {
      if ((cur + " " + sentence).length > SECTION_SIZE && cur) {
        pieces.push(cur.trim());
        cur = sentence;
      } else {
        cur = cur ? `${cur} ${sentence}` : sentence;
      }
      while (cur.length > SECTION_SIZE * 1.5) {
        pieces.push(cur.slice(0, SECTION_SIZE));
        cur = cur.slice(SECTION_SIZE);
      }
    }
    if (cur.trim()) pieces.push(cur.trim());
  }
  const out: Section[] = [];
  let cur = "";
  for (const piece of pieces) {
    if ((cur + "\n\n" + piece).length > SECTION_SIZE && cur) {
      out.push({ text: cur });
      cur = piece;
    } else {
      cur = cur ? `${cur}\n\n${piece}` : piece;
    }
  }
  if (cur) out.push({ text: cur });
  return out;
}

function slideSections(text: string): Section[] {
  const slides = text.split(/\n*(?=^Slide \d+\s*$)/m).map((s) => s.trim()).filter(Boolean);
  return slides.map((s) => {
    const label = s.match(/^Slide \d+/)?.[0];
    return { label, text: label ? s.slice(label.length).trim() : s };
  });
}

interface SheetSplit {
  sections: Section[];
  datasets: { sheet: string; columns: string[]; rows: Record<string, string | number | null>[] }[];
}

function sheetSections(sheets: SheetData[]): SheetSplit {
  const sections: Section[] = [];
  const datasets: SheetSplit["datasets"] = [];
  for (const sheet of sheets) {
    const rows = sheet.rows.filter((r) => nonEmpty(r) > 0);
    const h = headerIndex(rows);
    if (h < 0) {
      sections.push(...paragraphSections(rows.map(rowText).join("\n")).map((s) => ({ ...s, label: `tab ${sheet.name}` })));
      continue;
    }
    const preface = rows.slice(0, h).map(rowText).join("\n");
    const header = rows[h];
    const body = rows.slice(h + 1);

    if (body.length > DATASET_MIN_ROWS) {
      const columns = header.map((c, i) => cellText(c) || `col${i + 1}`);
      datasets.push({
        sheet: sheet.name,
        columns,
        rows: body.map((r) =>
          Object.fromEntries(
            columns.map((col, i) => {
              const v = r[i];
              return [col, v && typeof v === "object" ? v.pct : (v ?? null)];
            })
          )
        ),
      });
      sections.push({
        label: `tab ${sheet.name}`,
        text: `${preface ? preface + "\n" : ""}${body.length.toLocaleString("en-US")} rows stored as a table, not as text. Columns: ${columns.join(", ")}. Use query_dataset to count, filter, or group these rows.`,
      });
      continue;
    }

    const lead = [preface, rowText(header)].filter(Boolean).join("\n");
    let start = 0;
    while (start < body.length) {
      const lines: string[] = [];
      let end = start;
      while (
        end < body.length &&
        lines.length < TABLE_BLOCK_ROWS &&
        (lines.length === 0 || lead.length + lines.join("\n").length + rowText(body[end]).length < CHUNK_SIZE - 100)
      ) {
        lines.push(rowText(body[end]));
        end++;
      }
      sections.push({
        label: `tab ${sheet.name}, rows ${start + 1}–${end}`,
        text: `${lead}\n${lines.join("\n")}`,
      });
      start = end;
    }
  }
  return { sections, datasets };
}

/** Every labelled numeric cell in a table tab becomes a record: (row label, column header, value). */
function sheetMetrics(sheets: SheetData[]) {
  const out: { metric: string; period: string; value: number; unit: string }[] = [];
  for (const sheet of sheets) {
    const rows = sheet.rows.filter((r) => nonEmpty(r) > 0);
    const h = headerIndex(rows);
    if (h < 0) continue;
    const header = rows[h].map(cellText);
    const body = rows.slice(h + 1);
    if (body.length > DATASET_MIN_ROWS) continue;
    for (const row of body) {
      const label = typeof row[0] === "string" ? row[0].trim() : "";
      if (!label) continue;
      for (let j = 1; j < row.length; j++) {
        const cell = row[j];
        const period = header[j];
        if (!period) continue;
        if (typeof cell === "number") out.push({ metric: label, period, value: cell, unit: "number" });
        else if (cell && typeof cell === "object") out.push({ metric: label, period, value: cell.pct, unit: "pct" });
      }
    }
  }
  return out;
}

function sectionsFor(input: IngestInput): SheetSplit {
  if (input.sheets?.length) return sheetSections(input.sheets);
  if (input.docKind === "deck" || /^Slide \d+\s*$/m.test(input.content)) {
    return { sections: slideSections(input.content), datasets: [] };
  }
  return { sections: paragraphSections(input.content), datasets: [] };
}

function chunkHeader(input: IngestInput, label?: string) {
  const kind = KIND_LABEL[input.docKind ?? "upload"];
  const date = formatDocDate(input.docDate, input.datePrecision);
  return `[${[input.title, kind, `dated ${date}`, label].filter(Boolean).join(" | ")}]`;
}

const claimSchema = z.object({
  claims: z.array(
    z.object({
      metric: z.string().describe("What is measured, e.g. 'Gross bookings', 'Take rate', 'Cash', 'Snow Pass subscribers', 'WeSki revenue'"),
      period: z.string().describe("The period or date the figure refers to as written, e.g. 'Q4 2025', 'trailing', 'June 2026'. Use 'unstated' if none."),
      value: z.number().describe("The number as stated. Percentages as a fraction, e.g. 11% -> 0.11. Millions written out, e.g. $42M -> 42000000."),
      unit: z.enum(["usd", "pct", "count", "number"]),
      quote: z.string().describe("The exact words from the text that state the figure, copied verbatim."),
    })
  ),
});

function normalize(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Figures stated in a deck, call, or scan, kept only when the quote is verbatim in the text. */
async function extractClaims(input: IngestInput) {
  if (!hasOpenAI() || !["deck", "call", "scan"].includes(input.docKind ?? "")) return [];
  try {
    const { object } = await generateObject({
      model: chatModel(),
      schema: claimSchema,
      system:
        "Extract every numeric business figure stated in the text: bookings, revenue, take rate, cash, subscribers, users, valuations, funding, competitor revenue. Copy the quote exactly. Do not compute, infer, or correct anything.",
      prompt: input.content.slice(0, 20000),
    });
    const body = normalize(input.content);
    return object.claims.filter((c) => body.includes(normalize(c.quote)));
  } catch (err) {
    console.error("claim extraction failed:", err);
    return [];
  }
}

/**
 * Persists a document, splits it by its own structure (slides, tabs, paragraphs),
 * prefixes every chunk with the title, kind, and date, and embeds the result.
 * Ledger tabs also become metric records, large tabs become dataset rows, and
 * figures stated in decks, calls, and scans become claims.
 */
export async function ingestDocument(
  input: IngestInput
): Promise<{ document: Document; chunkCount: number }> {
  const db = getDb();
  const [doc] = await db
    .insert(documents)
    .values({
      orgId: input.orgId,
      title: input.title,
      content: input.content,
      source: input.source ?? "upload",
      mimeType: input.mimeType,
      url: input.url,
      metadata: input.metadata,
      docDate: input.docDate,
      datePrecision: input.datePrecision ?? "day",
      docKind: input.docKind ?? "upload",
      series: input.series,
    })
    .returning();

  const { sections, datasets } = sectionsFor(input);
  const pieces = sections.flatMap((s) =>
    chunkText(s.text).map((text) => `${chunkHeader(input, s.label)}\n${text}`)
  );

  for (const ds of datasets) {
    for (let i = 0; i < ds.rows.length; i += 500) {
      await db.insert(datasetRows).values(
        ds.rows.slice(i, i + 500).map((data, j) => ({
          orgId: input.orgId,
          documentId: doc.id,
          sheet: ds.sheet,
          rowIndex: i + j,
          data,
        }))
      );
    }
  }

  if (input.docKind === "ledger" && input.sheets) {
    const records = sheetMetrics(input.sheets);
    if (records.length) {
      await db.insert(metrics).values(
        records.map((r) => ({ ...r, orgId: input.orgId, documentId: doc.id, kind: "record" as const }))
      );
    }
  }

  const claims = await extractClaims(input);
  if (claims.length) {
    await db.insert(metrics).values(
      claims.map((c) => ({ ...c, orgId: input.orgId, documentId: doc.id, kind: "claim" as const }))
    );
  }

  if (pieces.length === 0) return { document: doc, chunkCount: 0 };

  const embeddings = await embedTexts(pieces);
  await db.insert(chunks).values(
    pieces.map((content, i) => ({
      orgId: input.orgId,
      documentId: doc.id,
      chunkIndex: i,
      content,
      embedding: embeddings[i],
    }))
  );

  return { document: doc, chunkCount: pieces.length };
}

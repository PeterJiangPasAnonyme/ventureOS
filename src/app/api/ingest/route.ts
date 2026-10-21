import { NextRequest, NextResponse } from "next/server";
import { requireOrg } from "@/lib/org";
import { ingestDocument } from "@/lib/ai/ingest";
import { docKindEnum } from "@/lib/db/schema";
import type { Document, DocKind } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function extractPdf(file: File): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const buffer = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocumentProxy(buffer);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n\n") : text;
}

export async function POST(req: NextRequest) {
  let org;
  try {
    org = await requireOrg();
  } catch (err) {
    const message = err instanceof Error ? err.message : "No organization";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const contentType = req.headers.get("content-type") || "";

  try {
    let title = "";
    let content = "";
    let mimeType: string | undefined;
    let source: Document["source"] = "upload";
    let docDateRaw: string | undefined;
    let docKindRaw: string | undefined;
    let series: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file") as File | null;
      title = (form.get("title") as string) || file?.name || "Untitled";
      docDateRaw = (form.get("docDate") as string) || undefined;
      docKindRaw = (form.get("docKind") as string) || undefined;
      series = (form.get("series") as string) || undefined;
      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      mimeType = file.type;
      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        content = await extractPdf(file);
      } else {
        content = await file.text();
      }
    } else {
      const body = await req.json();
      title = body.title || "Untitled note";
      content = body.content || "";
      source = body.source || "note";
      mimeType = "text/plain";
      docDateRaw = body.docDate || undefined;
      docKindRaw = body.docKind || undefined;
      series = body.series || undefined;
    }

    const docDate = docDateRaw ? new Date(`${docDateRaw}T12:00:00Z`) : undefined;
    if (docDate && Number.isNaN(docDate.getTime())) {
      return NextResponse.json({ error: "docDate must be YYYY-MM-DD" }, { status: 400 });
    }
    const docKind = (docKindEnum.enumValues as readonly string[]).includes(docKindRaw ?? "")
      ? (docKindRaw as DocKind)
      : source === "note"
        ? "note"
        : "upload";

    if (!content.trim()) {
      return NextResponse.json(
        { error: "Document has no extractable text" },
        { status: 400 }
      );
    }

    const { document, chunkCount } = await ingestDocument({
      orgId: org.id,
      title,
      content,
      source,
      mimeType,
      docDate,
      docKind,
      series: series?.trim() || undefined,
    });

    return NextResponse.json({
      ok: true,
      document: { id: document.id, title: document.title },
      chunkCount,
    });
  } catch (err) {
    console.error("ingest failed:", err);
    const message = err instanceof Error ? err.message : "Ingest failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

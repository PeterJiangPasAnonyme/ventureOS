"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, Plus } from "lucide-react";

export function DocumentUpload() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [docDate, setDocDate] = useState("");
  const [docKind, setDocKind] = useState("upload");
  const [series, setSeries] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setTitle("");
    setNote("");
    setDocDate("");
    setDocKind("upload");
    setSeries("");
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const file = fileRef.current?.files?.[0];
      let res: Response;
      if (file) {
        const form = new FormData();
        form.append("file", file);
        form.append("title", title || file.name);
        if (docDate) form.append("docDate", docDate);
        form.append("docKind", docKind);
        if (series.trim()) form.append("series", series.trim());
        res = await fetch("/api/ingest", { method: "POST", body: form });
      } else if (note.trim()) {
        res = await fetch("/api/ingest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: title || "Untitled note",
            content: note,
            source: "note",
            docDate: docDate || undefined,
            docKind: docKind === "upload" ? "note" : docKind,
            series: series.trim() || undefined,
          }),
        });
      } else {
        setError("Add a file or paste some text.");
        setBusy(false);
        return;
      }

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Upload failed");
      }
      reset();
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> Add knowledge
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to knowledge base</DialogTitle>
          <DialogDescription>
            Upload a document (PDF, TXT, MD) or paste text. It will be chunked,
            embedded, and made searchable by every copilot.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="doc-title">Title</Label>
            <Input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q3 board deck"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="doc-date">Document date</Label>
              <Input
                id="doc-date"
                type="date"
                value={docDate}
                onChange={(e) => setDocDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-kind">Kind</Label>
              <select
                id="doc-kind"
                value={docKind}
                onChange={(e) => setDocKind(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="upload">Document</option>
                <option value="note">Meeting note</option>
                <option value="call">Investor call note</option>
                <option value="deck">Deck</option>
                <option value="scan">Competitor scan</option>
                <option value="roadmap">Roadmap</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-series">Version of</Label>
            <Input
              id="doc-series"
              value={series}
              onChange={(e) => setSeries(e.target.value)}
              placeholder="Optional, e.g. investor-deck. Newest in a series is searched by default."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-file">File</Label>
            <Input
              id="doc-file"
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.md,.markdown,text/plain,application/pdf"
            />
          </div>
          <div className="relative text-center text-xs text-muted-foreground">
            <span className="bg-background px-2">or paste text</span>
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Paste meeting notes, research, company context…"
            rows={5}
          />
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Ingest
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

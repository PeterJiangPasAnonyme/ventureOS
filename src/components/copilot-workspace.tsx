"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AgentTrace, type TraceStep } from "@/components/agent-trace";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/icon";
import { cn, initials } from "@/lib/utils";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

export function CopilotWorkspace({
  copilotType,
  name,
  tagline,
  description,
  iconName,
  accent,
  examples,
}: {
  copilotType: string;
  name: string;
  tagline: string;
  description: string;
  iconName: string;
  accent: string;
  examples: string[];
}) {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streaming, setStreaming] = useState("");
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [turns, streaming, scrollToBottom]);

  const run = useCallback(
    async (prompt: string) => {
      const text = prompt.trim();
      if (!text || running) return;
      setError(null);
      setInput("");
      setTurns((t) => [...t, { role: "user", content: text }]);
      setSteps([]);
      setStreaming("");
      setRunning(true);

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input: text, copilotType }),
        });

        if (!res.ok || !res.body) {
          const msg = await res.json().catch(() => ({ error: "Request failed" }));
          throw new Error(msg.error || `Request failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finalBrief = "";

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            let event: {
              type: string;
              step?: TraceStep;
              text?: string;
              brief?: string;
              message?: string;
            };
            try {
              event = JSON.parse(line);
            } catch {
              continue;
            }
            if (event.type === "step" && event.step) {
              setSteps((s) => [...s, event.step as TraceStep]);
            } else if (event.type === "token" && event.text) {
              finalBrief += event.text;
              setStreaming(finalBrief);
            } else if (event.type === "final") {
              finalBrief = event.brief ?? finalBrief;
            } else if (event.type === "error") {
              setError(event.message ?? "Agent failed");
            }
          }
        }

        if (finalBrief.trim()) {
          setTurns((t) => [...t, { role: "assistant", content: finalBrief }]);
        }
        setStreaming("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setRunning(false);
      }
    },
    [copilotType, running]
  );

  const empty = turns.length === 0 && !streaming;

  return (
    <div className="flex h-full">
      {/* Center column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b px-6 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
            <Icon name={iconName} className={cn("h-5 w-5", accent)} />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight">{name}</h1>
            <p className="text-xs text-muted-foreground">{tagline}</p>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-6 py-6 scrollbar-thin"
        >
          <div className="mx-auto max-w-3xl space-y-6">
            {empty ? (
              <div className="mt-6">
                <div className="mb-6 rounded-xl border bg-muted/30 p-5">
                  <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="h-4 w-4" /> {name}
                  </div>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Try asking
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-1">
                  {examples.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => run(ex)}
                      className="rounded-lg border px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/50 hover:bg-accent"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {turns.map((turn, i) =>
                  turn.role === "user" ? (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                        {turn.content}
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="flex gap-3">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border bg-card px-4 py-3">
                        <Markdown content={turn.content} />
                      </div>
                    </div>
                  )
                )}
                {streaming ? (
                  <div className="flex gap-3">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border bg-card px-4 py-3">
                      <Markdown content={streaming} />
                    </div>
                  </div>
                ) : null}
                {running && !streaming ? (
                  <div className="flex items-center gap-2 pl-10 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Working through
                    the request…
                  </div>
                ) : null}
              </>
            )}

            {error ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t bg-background px-6 py-4">
          <div className="mx-auto max-w-3xl">
            <div className="relative flex items-end gap-2 rounded-xl border bg-background p-2 focus-within:ring-1 focus-within:ring-ring">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    run(input);
                  }
                }}
                placeholder={`Ask ${name}…`}
                disabled={running}
                className="min-h-[44px] resize-none border-0 shadow-none focus-visible:ring-0"
                rows={1}
              />
              <Button
                size="icon"
                disabled={running || !input.trim()}
                onClick={() => run(input)}
                className="shrink-0"
              >
                {running ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
              Enter to send · Shift+Enter for a new line
            </p>
          </div>
        </div>
      </div>

      {/* Trace panel */}
      <div className="hidden w-96 shrink-0 lg:block">
        <AgentTrace steps={steps} running={running} />
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Brain,
  Database,
  Wrench,
  Eye,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";

export interface TraceStep {
  order: number;
  type: "plan" | "retrieval" | "tool_call" | "observation" | "final" | "error";
  title: string;
  payload?: Record<string, unknown>;
}

const STEP_META: Record<
  TraceStep["type"],
  { icon: typeof Brain; label: string; color: string }
> = {
  plan: { icon: Brain, label: "Plan", color: "text-violet-500" },
  retrieval: { icon: Database, label: "Retrieval", color: "text-sky-500" },
  tool_call: { icon: Wrench, label: "Tool", color: "text-amber-500" },
  observation: { icon: Eye, label: "Observation", color: "text-emerald-500" },
  final: { icon: CheckCircle2, label: "Synthesis", color: "text-primary" },
  error: { icon: AlertTriangle, label: "Error", color: "text-destructive" },
};

export function AgentTrace({
  steps,
  running,
}: {
  steps: TraceStep[];
  running: boolean;
}) {
  return (
    <div className="flex h-full flex-col border-l bg-muted/20">
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Agent Trace</h3>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Transparent intermediate outputs
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
        {steps.length === 0 && !running ? (
          <p className="mt-8 text-center text-xs text-muted-foreground">
            The agent&apos;s plan, retrievals, and tool calls will appear here as
            it works.
          </p>
        ) : (
          <ol className="space-y-1">
            {steps.map((step) => (
              <TraceRow key={`${step.order}-${step.type}`} step={step} />
            ))}
            {running ? (
              <li className="flex items-center gap-2 py-2 pl-1 text-xs text-muted-foreground">
                <span className="flex gap-1">
                  <Dot delay="0ms" />
                  <Dot delay="150ms" />
                  <Dot delay="300ms" />
                </span>
                thinking…
              </li>
            ) : null}
          </ol>
        )}
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
      style={{ animationDelay: delay }}
    />
  );
}

function TraceRow({ step }: { step: TraceStep }) {
  const [open, setOpen] = useState(false);
  const meta = STEP_META[step.type];
  const Icon = meta.icon;
  const hasPayload = step.payload && Object.keys(step.payload).length > 0;

  return (
    <li className="animate-fade-in">
      <button
        onClick={() => hasPayload && setOpen((v) => !v)}
        className={cn(
          "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
          hasPayload && "hover:bg-accent"
        )}
      >
        <div className="mt-0.5 flex flex-col items-center">
          <Icon className={cn("h-4 w-4", meta.color)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {meta.label}
            </span>
            {hasPayload ? (
              <ChevronRight
                className={cn(
                  "h-3 w-3 text-muted-foreground transition-transform",
                  open && "rotate-90"
                )}
              />
            ) : null}
          </div>
          <div className="truncate font-medium">{step.title}</div>
        </div>
      </button>
      {open && hasPayload ? (
        <div className="ml-6 mb-2 mr-1">
          <TracePayload payload={step.payload!} />
        </div>
      ) : null}
    </li>
  );
}

function TracePayload({ payload }: { payload: Record<string, unknown> }) {
  // Render plan text nicely; otherwise show a scrollable JSON block.
  if (typeof payload.plan === "string") {
    return (
      <pre className="whitespace-pre-wrap rounded-md bg-background p-2 text-xs text-muted-foreground">
        {payload.plan}
      </pre>
    );
  }
  return (
    <pre className="max-h-64 overflow-auto rounded-md bg-background p-2 font-mono text-[11px] leading-relaxed text-muted-foreground scrollbar-thin">
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}

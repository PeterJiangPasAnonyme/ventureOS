"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/utils";
import { Plus, Loader2, Bot } from "lucide-react";

type Status = "todo" | "in_progress" | "blocked" | "done";
type Priority = "low" | "medium" | "high" | "urgent";

export interface TaskDTO {
  id: string;
  title: string;
  description?: string | null;
  status: Status;
  priority: Priority;
  owner?: string | null;
  dueDate?: string | Date | null;
  source?: string | null;
}

const COLUMNS: { key: Status; label: string }[] = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "blocked", label: "Blocked" },
  { key: "done", label: "Done" },
];

const PRIORITY_VARIANT: Record<
  Priority,
  "secondary" | "warning" | "destructive" | "outline"
> = {
  low: "outline",
  medium: "secondary",
  high: "warning",
  urgent: "destructive",
};

export function TaskBoard({ initialTasks }: { initialTasks: TaskDTO[] }) {
  const [tasks, setTasks] = useState<TaskDTO[]>(initialTasks);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [owner, setOwner] = useState("");

  const updateStatus = async (id: string, status: Status) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status } : t))
    );
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => {});
  };

  const addTask = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, priority, owner: owner || undefined }),
      });
      const data = await res.json();
      if (data.task) setTasks((prev) => [data.task as TaskDTO, ...prev]);
      setTitle("");
      setOwner("");
      setPriority("medium");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" /> New task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New task</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="t-title">Title</Label>
                <Input
                  id="t-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What needs to happen?"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="t-priority">Priority</Label>
                  <select
                    id="t-priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as Priority)}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="t-owner">Owner</Label>
                  <Input
                    id="t-owner"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button onClick={addTask} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Add
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.key);
          return (
            <div key={col.key} className="rounded-lg border bg-muted/20 p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium">{col.label}</span>
                <Badge variant="secondary">{items.length}</Badge>
              </div>
              <div className="space-y-2">
                {items.map((t) => (
                  <Card key={t.id}>
                    <CardContent className="space-y-2 p-3">
                      <div className="text-sm font-medium leading-snug">
                        {t.title}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={PRIORITY_VARIANT[t.priority]}>
                          {t.priority}
                        </Badge>
                        {t.owner ? (
                          <span className="text-xs text-muted-foreground">
                            {t.owner}
                          </span>
                        ) : null}
                        {t.source === "agent" ? (
                          <span
                            className="flex items-center gap-0.5 text-xs text-muted-foreground"
                            title="Created by an agent"
                          >
                            <Bot className="h-3 w-3" /> agent
                          </span>
                        ) : null}
                      </div>
                      {t.dueDate ? (
                        <div className="text-xs text-muted-foreground">
                          Due {formatDate(t.dueDate)}
                        </div>
                      ) : null}
                      <select
                        value={t.status}
                        onChange={(e) =>
                          updateStatus(t.id, e.target.value as Status)
                        }
                        className="mt-1 h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                      >
                        {COLUMNS.map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </CardContent>
                  </Card>
                ))}
                {items.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    Nothing here
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

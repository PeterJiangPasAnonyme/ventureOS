import Link from "next/link";
import { getCurrentOrg } from "@/lib/org";
import { getDashboardData } from "@/lib/db/queries";
import { SetupNotice } from "@/components/setup-notice";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { COPILOT_LIST } from "@/lib/constants";
import { Icon } from "@/components/icon";
import { formatDateTime, relativeTime, truncate } from "@/lib/utils";
import {
  Target,
  CalendarDays,
  BellRing,
  FileText,
  CheckSquare,
  ArrowRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const org = await getCurrentOrg();
  if (!org) return <SetupNotice />;

  const data = await getDashboardData(org.id);
  const openTasks =
    data.taskCounts.todo +
    data.taskCounts.in_progress +
    data.taskCounts.blocked;

  const stats = [
    { label: "Objectives", value: data.objectives.length, icon: Target },
    { label: "Open tasks", value: openTasks, icon: CheckSquare },
    {
      label: "Upcoming meetings",
      value: data.upcomingMeetings.length,
      icon: CalendarDays,
    },
    { label: "Documents indexed", value: data.docCount, icon: FileText },
  ];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={`Good to see you, ${org.name}`}
        description={org.oneLiner ?? "Your single source of truth and agent workspace."}
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Stat row */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {stats.map((s) => (
              <Card key={s.label}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <s.icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="text-2xl font-semibold">{s.value}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.label}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Copilots launcher */}
          <div>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              Launch a copilot
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {COPILOT_LIST.map((c) => (
                <Link key={c.slug} href={`/copilots/${c.slug}`}>
                  <Card className="h-full transition-colors hover:border-primary/50 hover:bg-accent/40">
                    <CardHeader className="pb-2">
                      <Icon name={c.icon} className={`h-5 w-5 ${c.accent}`} />
                      <CardTitle className="text-sm">{c.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">
                        {c.tagline}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Objectives */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="h-4 w-4" /> Priorities &amp; OKRs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.objectives.length === 0 ? (
                  <EmptyRow text="No objectives yet." />
                ) : (
                  data.objectives.map((o) => (
                    <div key={o.id}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium">{o.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {o.quarter} · {o.progress}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(100, o.progress)}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Follow ups */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BellRing className="h-4 w-4" /> Follow-ups
                </CardTitle>
                <CardDescription>Surfaced by agents</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.followUps.length === 0 ? (
                  <EmptyRow text="Nothing outstanding." />
                ) : (
                  data.followUps.map((f) => (
                    <div key={f.id} className="text-sm">
                      <div>{truncate(f.content, 120)}</div>
                      <div className="text-xs text-muted-foreground">
                        {relativeTime(f.createdAt)}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Upcoming meetings */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="h-4 w-4" /> Upcoming meetings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.upcomingMeetings.length === 0 ? (
                  <EmptyRow text="No upcoming meetings." />
                ) : (
                  data.upcomingMeetings.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="font-medium">{m.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(m.startsAt)}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Recent runs */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent agent runs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.recentRuns.length === 0 ? (
                  <EmptyRow text="No runs yet." />
                ) : (
                  data.recentRuns.map((r) => (
                    <div key={r.id} className="text-sm">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            r.status === "completed"
                              ? "success"
                              : r.status === "failed"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {r.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {relativeTime(r.createdAt)}
                        </span>
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        {truncate(r.input, 80)}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-center pt-2">
            <Link
              href="/copilots/investor-prep"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Try the Investor Prep copilot <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

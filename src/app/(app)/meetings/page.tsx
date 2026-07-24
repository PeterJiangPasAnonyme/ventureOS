import { getCurrentOrg } from "@/lib/org";
import { getMeetings } from "@/lib/db/queries";
import { SetupNotice } from "@/components/setup-notice";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { CalendarDays, Users } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  const org = await getCurrentOrg();
  if (!org) return <SetupNotice />;

  const meetings = await getMeetings(org.id);
  const now = Date.now();

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Meetings"
        description="Transcripts, summaries, and decisions — ready for the Meeting Synthesis copilot."
      >
        <Link
          href="/copilots/meeting-synthesis"
          className="text-sm text-primary hover:underline"
        >
          Open Meeting Synthesis →
        </Link>
      </PageHeader>
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="mx-auto max-w-4xl space-y-3">
          {meetings.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed py-12 text-center">
              <CalendarDays className="mb-2 h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No meetings yet.</p>
            </div>
          ) : (
            meetings.map((m) => {
              const upcoming =
                m.startsAt && new Date(m.startsAt).getTime() > now;
              return (
                <Card key={m.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{m.title}</CardTitle>
                      <Badge variant={upcoming ? "secondary" : "outline"}>
                        {upcoming ? "Upcoming" : "Past"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatDateTime(m.startsAt)}
                      </span>
                      {m.attendees ? (
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {m.attendees}
                        </span>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {m.summary ? (
                      <p className="text-sm text-muted-foreground">
                        {m.summary}
                      </p>
                    ) : null}
                    {m.decisions && m.decisions.length > 0 ? (
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Decisions
                        </div>
                        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                          {m.decisions.map((d, i) => (
                            <li key={i}>{d}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

import { getCurrentOrg } from "@/lib/org";
import { getMemories } from "@/lib/db/queries";
import { SetupNotice } from "@/components/setup-notice";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { hasOpenAI } from "@/lib/ai/provider";
import { hasTavily } from "@/lib/integrations/tavily";
import { isGoogleEnabled } from "@/lib/auth";
import { relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const org = await getCurrentOrg();
  if (!org) return <SetupNotice />;

  const memories = await getMemories(org.id);

  const env = [
    { label: "OpenAI (LLM + embeddings)", ok: hasOpenAI() },
    { label: "Tavily (web search)", ok: hasTavily() },
    { label: "Google OAuth (Gmail/Calendar)", ok: isGoogleEnabled },
    { label: "Inngest (workflows)", ok: Boolean(process.env.INNGEST_EVENT_KEY) },
  ];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Settings"
        description="Workspace configuration and shared agent memory."
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="mx-auto max-w-4xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workspace</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <Info label="Company" value={org.name} />
              <Info label="Stage" value={org.stage} />
              <Info label="Industry" value={org.industry} />
              <Info label="Website" value={org.website} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Environment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {env.map((e) => (
                <div
                  key={e.label}
                  className="flex items-center justify-between text-sm"
                >
                  <span>{e.label}</span>
                  <Badge variant={e.ok ? "success" : "outline"}>
                    {e.ok ? "Configured" : "Not set"}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Shared agent memory ({memories.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {memories.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Agents will save durable facts, decisions, and follow-ups here.
                </p>
              ) : (
                memories.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-start justify-between gap-3 border-b pb-2 text-sm last:border-0"
                  >
                    <div>
                      <Badge variant="secondary" className="mb-1">
                        {m.type}
                      </Badge>
                      <div>{m.content}</div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {relativeTime(m.createdAt)}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div>{value || "—"}</div>
    </div>
  );
}

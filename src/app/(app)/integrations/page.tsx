import { auth, isGoogleEnabled } from "@/lib/auth";
import { hasOpenAI } from "@/lib/ai/provider";
import { hasTavily } from "@/lib/integrations/tavily";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConnectGoogleButton } from "@/components/connect-google-button";
import { Mail, CalendarDays, Globe, Brain, Workflow } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const session = await auth();
  const googleConnected = Boolean(session?.accessToken);

  const items = [
    {
      icon: Mail,
      title: "Gmail",
      description:
        "Let copilots read your inbox to surface follow-ups and draft replies.",
      connected: googleConnected,
      action: (
        <ConnectGoogleButton
          connected={googleConnected}
          enabled={isGoogleEnabled}
        />
      ),
    },
    {
      icon: CalendarDays,
      title: "Google Calendar",
      description:
        "Pull upcoming meetings into Investor Prep and Task Management.",
      connected: googleConnected,
      action: (
        <ConnectGoogleButton
          connected={googleConnected}
          enabled={isGoogleEnabled}
        />
      ),
    },
    {
      icon: Globe,
      title: "Web Search (Tavily)",
      description:
        "External research for competitive analysis. Set TAVILY_API_KEY to enable live results.",
      connected: hasTavily(),
      action: null,
    },
    {
      icon: Brain,
      title: "OpenAI",
      description:
        "Powers embeddings and multi-step reasoning. Set OPENAI_API_KEY to enable full LLM mode.",
      connected: hasOpenAI(),
      action: null,
    },
    {
      icon: Workflow,
      title: "Inngest",
      description:
        "Durable background agent runs and recurring workflows (daily follow-up sweep).",
      connected: Boolean(process.env.INNGEST_EVENT_KEY),
      action: null,
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Integrations"
        description="Connect the sources your agents draw on for shared, live context."
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
          {items.map((it) => (
            <Card key={it.title}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <it.icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{it.title}</CardTitle>
                    </div>
                  </div>
                  <Badge variant={it.connected ? "success" : "outline"}>
                    {it.connected ? "Connected" : "Not connected"}
                  </Badge>
                </div>
                <CardDescription className="pt-2">
                  {it.description}
                </CardDescription>
              </CardHeader>
              {it.action ? <CardContent>{it.action}</CardContent> : null}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

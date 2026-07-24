import Link from "next/link";
import { COPILOT_LIST } from "@/lib/constants";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/icon";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default function CopilotsIndexPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Copilots"
        description="Role-specific agents that turn fragmented startup information into decisions."
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2">
          {COPILOT_LIST.map((c) => (
            <Link key={c.slug} href={`/copilots/${c.slug}`}>
              <Card className="h-full transition-colors hover:border-primary/50 hover:bg-accent/40">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <Icon name={c.icon} className={`h-5 w-5 ${c.accent}`} />
                    </div>
                    <div>
                      <CardTitle className="text-base">{c.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {c.tagline}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {c.description}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {c.tools.map((t) => (
                      <Badge key={t} variant="secondary">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

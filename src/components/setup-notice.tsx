import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database } from "lucide-react";

export function SetupNotice() {
  return (
    <div className="p-6">
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Finish setting up your workspace</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            No organization was found. Connect a Postgres database and seed the
            demo workspace to get started:
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Copy <code className="text-foreground">.env.example</code> to{" "}
              <code className="text-foreground">.env.local</code> and set{" "}
              <code className="text-foreground">DATABASE_URL</code> (a Neon
              Postgres URL with the pgvector extension).
            </li>
            <li>
              Run <code className="text-foreground">npm run db:push</code> to
              create the schema.
            </li>
            <li>
              Run <code className="text-foreground">npm run db:seed</code> to load
              the demo startup (Northwind AI).
            </li>
          </ol>
          <p>
            The app also runs fully offline: without an OpenAI key, agents use a
            deterministic mock so the trace and briefs still work.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

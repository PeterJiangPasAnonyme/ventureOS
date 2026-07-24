import { getCurrentOrg } from "@/lib/org";
import {
  getDocuments,
  getCompetitors,
  getMarketNotes,
} from "@/lib/db/queries";
import { SetupNotice } from "@/components/setup-notice";
import { PageHeader } from "@/components/page-header";
import { DocumentUpload } from "@/components/document-upload";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { FileText, Building2, Swords } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const org = await getCurrentOrg();
  if (!org) return <SetupNotice />;

  const [docs, comps, notes] = await Promise.all([
    getDocuments(org.id),
    getCompetitors(org.id),
    getMarketNotes(org.id),
  ]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Knowledge"
        description="Your persistent single source of truth — indexed and searchable by every agent."
      >
        <DocumentUpload />
      </PageHeader>
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="mx-auto max-w-5xl">
          <Tabs defaultValue="documents">
            <TabsList>
              <TabsTrigger value="documents">
                Documents ({docs.length})
              </TabsTrigger>
              <TabsTrigger value="company">Company</TabsTrigger>
              <TabsTrigger value="market">
                Market ({comps.length + notes.length})
              </TabsTrigger>
            </TabsList>

            {/* Documents */}
            <TabsContent value="documents" className="mt-4">
              {docs.length === 0 ? (
                <Empty
                  icon={FileText}
                  text="No documents yet. Click “Add knowledge” to ingest your first file."
                />
              ) : (
                <div className="space-y-2">
                  {docs.map((d) => (
                    <Card key={d.id}>
                      <CardContent className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-sm font-medium">{d.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatDate(d.createdAt)} · {d.chunkCount} chunks
                            </div>
                          </div>
                        </div>
                        <Badge variant="secondary">{d.source}</Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Company */}
            <TabsContent value="company" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Building2 className="h-4 w-4" /> {org.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <Field label="One-liner" value={org.oneLiner} />
                  <Field label="Stage" value={org.stage} />
                  <Field label="Industry" value={org.industry} />
                  <Field label="Website" value={org.website} />
                  <Field label="About" value={org.description} />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Market */}
            <TabsContent value="market" className="mt-4 space-y-6">
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Swords className="h-4 w-4" /> Competitors
                </h3>
                {comps.length === 0 ? (
                  <Empty icon={Swords} text="No competitors tracked yet." />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {comps.map((c) => (
                      <Card key={c.id}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">{c.name}</CardTitle>
                          {c.positioning ? (
                            <p className="text-xs text-muted-foreground">
                              {c.positioning}
                            </p>
                          ) : null}
                        </CardHeader>
                        <CardContent className="space-y-1.5 text-xs">
                          {c.strengths ? (
                            <p>
                              <span className="font-medium text-emerald-600">
                                Strengths:{" "}
                              </span>
                              {c.strengths}
                            </p>
                          ) : null}
                          {c.weaknesses ? (
                            <p>
                              <span className="font-medium text-rose-600">
                                Weaknesses:{" "}
                              </span>
                              {c.weaknesses}
                            </p>
                          ) : null}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium">Market notes</h3>
                {notes.length === 0 ? (
                  <Empty icon={FileText} text="No market notes yet." />
                ) : (
                  <div className="space-y-2">
                    {notes.map((n) => (
                      <Card key={n.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium">{n.title}</div>
                            {n.category ? (
                              <Badge variant="outline">{n.category}</Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {n.body}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div>{value}</div>
    </div>
  );
}

function Empty({
  icon: Icon,
  text,
}: {
  icon: typeof FileText;
  text: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
      <Icon className="mb-2 h-6 w-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

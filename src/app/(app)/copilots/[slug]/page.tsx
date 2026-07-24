import { notFound } from "next/navigation";
import { copilotBySlug } from "@/lib/constants";
import { getCurrentOrg } from "@/lib/org";
import { SetupNotice } from "@/components/setup-notice";
import { CopilotWorkspace } from "@/components/copilot-workspace";

export const dynamic = "force-dynamic";

export default async function CopilotPage({
  params,
}: {
  params: { slug: string };
}) {
  const meta = copilotBySlug(params.slug);
  if (!meta) notFound();

  const org = await getCurrentOrg();
  if (!org) return <SetupNotice />;

  return (
    <CopilotWorkspace
      copilotType={meta.type}
      name={meta.name}
      tagline={meta.tagline}
      description={meta.description}
      iconName={meta.icon}
      accent={meta.accent}
      examples={meta.examples}
    />
  );
}

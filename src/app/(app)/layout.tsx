import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCurrentOrg } from "@/lib/org";
import { AppSidebar } from "@/components/app-sidebar";
import { isDbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const org = await getCurrentOrg();

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <AppSidebar
        user={session.user}
        orgName={org?.name ?? (isDbConfigured() ? "Set up workspace" : "Demo")}
      />
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}

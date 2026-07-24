import { redirect } from "next/navigation";
import { auth, isGoogleEnabled } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">VentureOS</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The agentic operating system for early-stage teams.
          </p>
        </div>
        <LoginForm googleEnabled={isGoogleEnabled} />
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Demo mode signs you in instantly — no configuration required.
        </p>
      </div>
    </div>
  );
}

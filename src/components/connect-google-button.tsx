"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function ConnectGoogleButton({
  connected,
  enabled,
}: {
  connected: boolean;
  enabled: boolean;
}) {
  if (!enabled) {
    return (
      <Button size="sm" variant="outline" disabled>
        Set GOOGLE_CLIENT_ID to enable
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      variant={connected ? "outline" : "default"}
      onClick={() => signIn("google", { callbackUrl: "/integrations" })}
    >
      {connected ? "Reconnect" : "Connect Google"}
    </Button>
  );
}

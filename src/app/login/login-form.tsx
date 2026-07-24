"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [loading, setLoading] = useState<string | null>(null);

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        {googleEnabled && (
          <Button
            variant="outline"
            className="w-full"
            disabled={loading !== null}
            onClick={() => {
              setLoading("google");
              signIn("google", { callbackUrl: "/dashboard" });
            }}
          >
            {loading === "google" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Continue with Google
          </Button>
        )}
        <Button
          className="w-full"
          disabled={loading !== null}
          onClick={() => {
            setLoading("demo");
            signIn("demo", { callbackUrl: "/dashboard" });
          }}
        >
          {loading === "demo" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          Continue in demo mode
        </Button>
        {googleEnabled ? (
          <p className="text-center text-xs text-muted-foreground">
            Google login enables live Gmail &amp; Calendar context.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

import { Inngest } from "inngest";
import type { CopilotType } from "@/lib/db/schema";

export const inngest = new Inngest({ id: "ventureos" });

/** Payload for the background agent-run event. */
export interface AgentRunRequested {
  orgId: string;
  copilotType: CopilotType;
  input: string;
  triggeredBy?: string;
}

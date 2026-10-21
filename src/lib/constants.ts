import type { CopilotType } from "@/lib/db/schema";

export interface CopilotMeta {
  type: CopilotType;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  /** lucide-react icon name */
  icon: string;
  /** tools this copilot is allowed to use */
  tools: string[];
  /** starter prompts shown in the empty state */
  examples: string[];
  accent: string;
}

export const COPILOTS: Record<Exclude<CopilotType, "general">, CopilotMeta> = {
  competitive_analysis: {
    type: "competitive_analysis",
    slug: "competitive-analysis",
    name: "Competitive Analysis",
    tagline: "Know exactly where you stand",
    description:
      "Researches competitors and the market, cross-references your internal positioning, and produces a comparison brief with differentiation angles.",
    icon: "Swords",
    tools: ["retrieve_context", "web_search", "list_competitors", "save_memory"],
    examples: [
      "What do WeSki and Ski.com actually sell, and what revenue can we stand behind?",
      "What did Notion ship for ski trips this quarter?",
      "Where do the March and August competitor scans disagree?",
    ],
    accent: "text-rose-500",
  },
  investor_prep: {
    type: "investor_prep",
    slug: "investor-prep",
    name: "Investor Prep",
    tagline: "Walk into every raise ready",
    description:
      "Assembles your metrics, narrative, and upcoming meetings into an investor-ready brief, anticipated Q&A, and a crisp story.",
    icon: "Briefcase",
    tools: [
      "retrieve_context",
      "get_metric",
      "query_dataset",
      "list_meetings",
      "read_calendar",
      "list_objectives",
      "save_memory",
    ],
    examples: [
      "Prep me for the November 6 growth investor meeting. What should I walk in with?",
      "Which figures in the September deck are not in the general ledger?",
      "What should I not repeat from the January 12 investor call?",
    ],
    accent: "text-indigo-500",
  },
  meeting_synthesis: {
    type: "meeting_synthesis",
    slug: "meeting-synthesis",
    name: "Meeting Synthesis",
    tagline: "Every meeting becomes action",
    description:
      "Turns transcripts and notes into a clean summary, the decisions made, and action items — automatically creating tasks and follow-ups.",
    icon: "NotebookPen",
    tools: [
      "retrieve_context",
      "list_meetings",
      "create_task",
      "save_memory",
    ],
    examples: [
      "Go through the October 8 supply notes and make tasks only for what was actually handed to someone.",
      "Did we decide to raise the take rate?",
      "What's the deposit situation on the February school block, and is that the normal rule?",
    ],
    accent: "text-emerald-500",
  },
  task_management: {
    type: "task_management",
    slug: "task-management",
    name: "Executive Task Management",
    tagline: "Your operating chief of staff",
    description:
      "Reviews tasks, email, and shared memory to build a prioritized daily plan, surface what's slipping, and draft the follow-ups you owe.",
    icon: "ListChecks",
    tools: [
      "retrieve_context",
      "list_tasks",
      "create_task",
      "read_email",
      "list_objectives",
      "save_memory",
    ],
    examples: [
      "What is actually in motion before Thanksgiving bookings, and what is stuck?",
      "What is still open before the November 6 meeting?",
      "Which of today's tasks are drafts, and which were actually assigned?",
    ],
    accent: "text-amber-500",
  },
};

export const COPILOT_LIST = Object.values(COPILOTS);

export function copilotBySlug(slug: string): CopilotMeta | undefined {
  return COPILOT_LIST.find((c) => c.slug === slug);
}

export function copilotByType(type: CopilotType): CopilotMeta | undefined {
  if (type === "general") return undefined;
  return COPILOTS[type];
}

export const NAV_SECTIONS = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" }],
  },
  {
    label: "Copilots",
    items: COPILOT_LIST.map((c) => ({
      href: `/copilots/${c.slug}`,
      label: c.name,
      icon: c.icon,
    })),
  },
  {
    label: "Workspace",
    items: [
      { href: "/knowledge", label: "Knowledge", icon: "Library" },
      { href: "/meetings", label: "Meetings", icon: "CalendarDays" },
      { href: "/tasks", label: "Tasks", icon: "ListChecks" },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/integrations", label: "Integrations", icon: "Plug" },
      { href: "/settings", label: "Settings", icon: "Settings" },
    ],
  },
];

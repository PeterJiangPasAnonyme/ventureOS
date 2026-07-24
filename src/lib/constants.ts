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
      "Compare us against our top 3 competitors on pricing and positioning",
      "What is Notion shipping this quarter and how does it affect us?",
      "Draft a battlecard for our next sales call vs. Airtable",
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
      "list_meetings",
      "read_calendar",
      "list_objectives",
      "save_memory",
    ],
    examples: [
      "Prep me for the Sequoia partner meeting on Thursday",
      "Draft answers to the 10 hardest questions a Series A investor will ask",
      "Turn our metrics into a fundraising narrative",
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
      "Summarize the product sync and create tasks for the action items",
      "What did we decide about pricing across our last 3 meetings?",
      "Extract follow-ups I owe people from this week's meetings",
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
      "Build my prioritized plan for today given our Q3 objectives",
      "What's slipping and who is blocked?",
      "Draft the follow-up emails I owe from my inbox",
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

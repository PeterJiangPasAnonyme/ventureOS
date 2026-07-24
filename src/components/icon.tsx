import {
  LayoutDashboard,
  Swords,
  Briefcase,
  NotebookPen,
  ListChecks,
  Library,
  CalendarDays,
  Plug,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Swords,
  Briefcase,
  NotebookPen,
  ListChecks,
  Library,
  CalendarDays,
  Plug,
  Settings,
  Sparkles,
};

export function Icon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Cmp = ICONS[name] ?? Sparkles;
  return <Cmp className={className} />;
}

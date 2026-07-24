import { getCurrentOrg } from "@/lib/org";
import { getTasks } from "@/lib/db/queries";
import { SetupNotice } from "@/components/setup-notice";
import { PageHeader } from "@/components/page-header";
import { TaskBoard, type TaskDTO } from "@/components/task-board";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const org = await getCurrentOrg();
  if (!org) return <SetupNotice />;

  const tasks = await getTasks(org.id);
  const dto: TaskDTO[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    owner: t.owner,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    source: t.source,
  }));

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Tasks"
        description="Execution context — including action items your copilots create automatically."
      />
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="mx-auto max-w-6xl">
          <TaskBoard initialTasks={dto} />
        </div>
      </div>
    </div>
  );
}

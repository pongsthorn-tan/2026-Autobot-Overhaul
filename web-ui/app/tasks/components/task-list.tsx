'use client';

import { type StandaloneTask, type TaskServiceType, deleteTask } from '../../lib/api';

interface TaskListProps {
  tasks: StandaloneTask[];
  serviceType: TaskServiceType;
  onRefresh: () => void;
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'running':
      return 'badge badge-active';
    case 'completed':
      return 'badge badge-stopped';
    case 'scheduled':
      return 'badge badge-paused';
    case 'errored':
      return 'badge badge-errored';
    case 'pending':
    default:
      return 'badge badge-stopped';
  }
}

function getTaskSummary(task: StandaloneTask): string {
  const p = task.params as Record<string, unknown>;
  switch (task.serviceType) {
    case 'report':
      return String(p.prompt ?? '').slice(0, 80) || 'Report task';
    case 'research':
      return String(p.topic ?? '') || 'Research task';
    case 'code-task':
      return String(p.description ?? '').slice(0, 80) || 'Code task';
    case 'topic-tracker':
      return String(p.topic ?? '') || 'Topic tracker task';
    case 'self-improve':
      return `${p.maxIterations ?? 3} iterations`;
    default:
      return 'Task';
  }
}

export default function TaskList({ tasks, serviceType, onRefresh }: TaskListProps) {
  const handleDelete = async (taskId: string) => {
    try {
      await deleteTask(taskId);
      onRefresh();
    } catch {
      // ignore
    }
  };

  if (tasks.length === 0) {
    return (
      <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '16px 0' }}>
        No tasks created for this service yet.
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        {tasks.length} task{tasks.length !== 1 ? 's' : ''}
      </div>
      {tasks.map((task) => (
        <div
          key={task.taskId}
          style={{
            padding: '10px 12px',
            borderRadius: '6px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            marginBottom: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span className={getStatusBadgeClass(task.status)}>{task.status}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {getTaskSummary(task)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {task.model} &middot; ${task.costSpent.toFixed(2)} spent &middot; {new Date(task.createdAt).toLocaleString()}
              {task.error && (
                <span style={{ color: 'var(--accent-red)', marginLeft: '8px' }}>
                  Error: {task.error.slice(0, 60)}
                </span>
              )}
            </div>
          </div>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => handleDelete(task.taskId)}
            style={{ flexShrink: 0 }}
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}

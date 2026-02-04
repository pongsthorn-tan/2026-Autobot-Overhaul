'use client';

import { useState } from 'react';
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
    case 'topic-tracker': {
      const topic = String(p.topic ?? '') || 'Topic tracker task';
      const preset = p.preset ? ` [${p.preset}]` : '';
      return `${topic}${preset}`;
    }
    case 'self-improve':
      return `${p.maxIterations ?? 3} iterations`;
    default:
      return 'Task';
  }
}

function getCycleProgress(task: StandaloneTask): string | null {
  if (task.serviceType !== 'topic-tracker') return null;
  const schedule = task.schedule as Record<string, unknown> | undefined;
  if (!schedule || schedule.type !== 'interval') return null;
  const maxCycles = (schedule.maxCycles as number) ?? (task.params as Record<string, unknown>).maxCycles;
  const completed = task.cyclesCompleted ?? 0;
  if (maxCycles) return `Cycle ${completed}/${maxCycles}`;
  if (completed > 0) return `${completed} cycles`;
  return null;
}

export default function TaskList({ tasks, serviceType, onRefresh }: TaskListProps) {
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

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
      {tasks.map((task) => {
        const isExpanded = expandedTaskId === task.taskId;
        const hasOutput = task.status === 'completed' && task.output;

        return (
          <div key={task.taskId} style={{ marginBottom: '6px' }}>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: isExpanded ? '6px 6px 0 0' : '6px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderBottom: isExpanded ? 'none' : undefined,
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
                  {getCycleProgress(task) && (
                    <span style={{ marginLeft: '8px', color: 'var(--accent-blue, #3b82f6)' }}>
                      {getCycleProgress(task)}
                    </span>
                  )}
                  {task.error && (
                    <span style={{ color: 'var(--accent-red)', marginLeft: '8px' }}>
                      Error: {task.error.slice(0, 60)}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                {hasOutput && (task.serviceType === 'report' || task.serviceType === 'research' || task.serviceType === 'topic-tracker') && (
                  <a
                    href={`/tasks/${task.taskId}`}
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: '0.75rem', textDecoration: 'none' }}
                  >
                    View Report
                  </a>
                )}
                {hasOutput && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setExpandedTaskId(isExpanded ? null : task.taskId)}
                    style={{ fontSize: '0.75rem' }}
                  >
                    {isExpanded ? 'Hide Raw' : 'Raw'}
                  </button>
                )}
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDelete(task.taskId)}
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Expanded output panel */}
            {isExpanded && task.output && (
              <div
                style={{
                  padding: '16px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderTop: '1px solid var(--border-color)',
                  borderRadius: '0 0 6px 6px',
                  maxHeight: '500px',
                  overflow: 'auto',
                  fontSize: '0.85rem',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'inherit',
                }}
              >
                {task.output}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

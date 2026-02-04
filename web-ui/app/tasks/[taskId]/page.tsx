'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getTask, type StandaloneTask } from '../../lib/api';
import { formatDate } from '../../lib/format-date';
import ReportRenderer from '../../components/report-renderer';
import LiveLog from '../../components/live-log';

export default function TaskDetailPage() {
  const params = useParams();
  const taskId = params.taskId as string;
  const [task, setTask] = useState<StandaloneTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTask = useCallback(() => {
    if (!taskId) return;
    getTask(taskId)
      .then(setTask)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load task'))
      .finally(() => setLoading(false));
  }, [taskId]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  // Auto-refresh while task is running or pending
  useEffect(() => {
    if (!task || (task.status !== 'running' && task.status !== 'pending')) return;
    const interval = setInterval(fetchTask, 3000);
    return () => clearInterval(interval);
  }, [task?.status, fetchTask]);

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading">Loading task...</div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="page-container">
        <div className="error-message">{error || 'Task not found'}</div>
        <a href="/tasks" style={{ color: 'var(--accent-blue, #3b82f6)', fontSize: '0.85rem', marginTop: '12px', display: 'inline-block' }}>
          &larr; Back to Tasks
        </a>
      </div>
    );
  }

  const statusColor = task.status === 'completed' ? 'var(--accent-green)'
    : task.status === 'errored' ? 'var(--accent-red)'
    : task.status === 'running' ? 'var(--accent-blue, #3b82f6)'
    : 'var(--text-muted)';

  const isRunning = task.status === 'running' || task.status === 'pending';
  const p = task.params as Record<string, unknown>;
  const taskLabel = p.topic ?? p.prompt ?? p.description ?? task.serviceType;

  // Cycle info for interval tasks
  const schedule = task.schedule as Record<string, unknown> | undefined;
  const isInterval = schedule?.type === 'interval';
  const maxCycles = (schedule?.maxCycles ?? p.maxCycles) as number | undefined;
  const cycleInfo = isInterval
    ? maxCycles
      ? `Cycle ${task.cyclesCompleted ?? 0}/${maxCycles}`
      : task.cyclesCompleted
        ? `${task.cyclesCompleted} cycles completed`
        : null
    : null;

  return (
    <div className="page-container">
      {/* Navigation */}
      <div style={{ marginBottom: '20px' }}>
        <a href={`/tasks?service=${task.serviceType}`} style={{ color: 'var(--accent-blue, #3b82f6)', fontSize: '0.85rem', textDecoration: 'none' }}>
          &larr; Back to {task.serviceType} tasks
        </a>
      </div>

      {/* Task title */}
      <h1 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '8px' }}>
        {String(taskLabel).slice(0, 120)}
      </h1>

      {/* Task metadata */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '8px',
        flexWrap: 'wrap',
      }}>
        <span style={{
          padding: '3px 10px',
          borderRadius: '12px',
          fontSize: '0.75rem',
          fontWeight: 600,
          background: `color-mix(in srgb, ${statusColor} 15%, transparent)`,
          color: statusColor,
        }}>
          {task.status}
        </span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {task.serviceType} &middot; {task.model} &middot; ${task.costSpent.toFixed(2)} spent
        </span>
        {cycleInfo && (
          <span style={{ fontSize: '0.8rem', color: 'var(--accent-blue, #3b82f6)' }}>
            {cycleInfo}
          </span>
        )}
        {typeof p.preset === 'string' && (
          <span style={{
            padding: '2px 8px',
            borderRadius: '10px',
            fontSize: '0.7rem',
            background: 'var(--bg-tertiary, var(--bg-secondary))',
            color: 'var(--text-secondary)',
          }}>
            {p.preset}
          </span>
        )}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
        Created {formatDate(task.createdAt)}
        {task.completedAt && ` \u00B7 Completed ${formatDate(task.completedAt)}`}
      </div>

      {/* Error message */}
      {task.error && (
        <div className="error-message" style={{ marginBottom: '16px' }}>
          {task.error}
        </div>
      )}

      {/* Live log for running tasks */}
      {isRunning && (
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px' }}>Live Log</h2>
          <LiveLog
            taskId={task.taskId}
            onDone={() => fetchTask()}
          />
        </div>
      )}

      {/* Report content (after completion) */}
      {task.output ? (
        <div style={{
          padding: '24px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
        }}>
          <ReportRenderer output={task.output} />
        </div>
      ) : (
        !isRunning && (
          <div style={{
            padding: '24px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            textAlign: 'center',
            color: 'var(--text-secondary)',
          }}>
            No output available
          </div>
        )
      )}
    </div>
  );
}

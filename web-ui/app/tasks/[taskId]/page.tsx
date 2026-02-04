'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getTask, updateTask, pauseTask, resumeTask, type StandaloneTask, type ClaudeModel, type UpdateTaskInput } from '../../lib/api';
import { formatDate } from '../../lib/format-date';
import ReportRenderer from '../../components/report-renderer';
import LiveLog from '../../components/live-log';

interface EditFormState {
  model: ClaudeModel;
  budget: string;
  // report
  prompt: string;
  // research
  topic: string;
  maxSteps: string;
  maxRevisionsPerStep: string;
  // topic-tracker
  preset: string;
  maxCycles: string;
  maxPerWindow: string;
  windowHours: string;
  // code-task
  description: string;
  targetPath: string;
  maxIterations: string;
}

function buildEditState(task: StandaloneTask): EditFormState {
  const p = task.params as Record<string, unknown>;
  const sl = p.spendingLimit as Record<string, unknown> | undefined;
  return {
    model: task.model,
    budget: String(task.budget),
    prompt: String(p.prompt ?? ''),
    topic: String(p.topic ?? ''),
    maxSteps: String(p.maxSteps ?? ''),
    maxRevisionsPerStep: String(p.maxRevisionsPerStep ?? ''),
    preset: String(p.preset ?? 'custom'),
    maxCycles: String(p.maxCycles ?? ''),
    maxPerWindow: String(sl?.maxPerWindow ?? ''),
    windowHours: String(sl?.windowHours ?? ''),
    description: String(p.description ?? ''),
    targetPath: String(p.targetPath ?? ''),
    maxIterations: String(p.maxIterations ?? ''),
  };
}

export default function TaskDetailPage() {
  const params = useParams();
  const taskId = params.taskId as string;
  const [task, setTask] = useState<StandaloneTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

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

  const handleEdit = () => {
    if (!task) return;
    setEditForm(buildEditState(task));
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditForm(null);
  };

  const handleSave = async () => {
    if (!task || !editForm) return;
    setSaving(true);
    try {
      const updates: UpdateTaskInput = {};

      if (editForm.model !== task.model) {
        updates.model = editForm.model;
      }

      const newBudget = parseFloat(editForm.budget);
      if (!isNaN(newBudget) && newBudget !== task.budget) {
        updates.budget = newBudget;
      }

      // Build params update based on service type
      const paramUpdates: Record<string, unknown> = {};
      const p = task.params as Record<string, unknown>;

      if (task.serviceType === 'report') {
        if (editForm.prompt && editForm.prompt !== p.prompt) paramUpdates.prompt = editForm.prompt;
      } else if (task.serviceType === 'research') {
        if (editForm.topic && editForm.topic !== p.topic) paramUpdates.topic = editForm.topic;
        const ms = editForm.maxSteps ? parseInt(editForm.maxSteps) : undefined;
        if (ms && ms !== p.maxSteps) paramUpdates.maxSteps = ms;
        const mr = editForm.maxRevisionsPerStep ? parseInt(editForm.maxRevisionsPerStep) : undefined;
        if (mr && mr !== p.maxRevisionsPerStep) paramUpdates.maxRevisionsPerStep = mr;
      } else if (task.serviceType === 'topic-tracker') {
        if (editForm.topic && editForm.topic !== p.topic) paramUpdates.topic = editForm.topic;
        if (editForm.preset && editForm.preset !== p.preset) paramUpdates.preset = editForm.preset;
        const mc = editForm.maxCycles ? parseInt(editForm.maxCycles) : undefined;
        if (mc && mc !== p.maxCycles) paramUpdates.maxCycles = mc;
        const mpw = editForm.maxPerWindow ? parseFloat(editForm.maxPerWindow) : undefined;
        const wh = editForm.windowHours ? parseInt(editForm.windowHours) : undefined;
        if (mpw && wh) {
          paramUpdates.spendingLimit = { maxPerWindow: mpw, windowHours: wh };
        }
      } else if (task.serviceType === 'code-task') {
        if (editForm.description && editForm.description !== p.description) paramUpdates.description = editForm.description;
        if (editForm.targetPath && editForm.targetPath !== p.targetPath) paramUpdates.targetPath = editForm.targetPath;
        const mi = editForm.maxIterations ? parseInt(editForm.maxIterations) : undefined;
        if (mi && mi !== p.maxIterations) paramUpdates.maxIterations = mi;
      } else if (task.serviceType === 'self-improve') {
        const mi = editForm.maxIterations ? parseInt(editForm.maxIterations) : undefined;
        if (mi && mi !== p.maxIterations) paramUpdates.maxIterations = mi;
      }

      if (Object.keys(paramUpdates).length > 0) {
        updates.params = paramUpdates;
      }

      await updateTask(taskId, updates);
      setEditing(false);
      setEditForm(null);
      fetchTask();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handlePause = async () => {
    setActionLoading(true);
    try {
      await pauseTask(taskId);
      fetchTask();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async () => {
    setActionLoading(true);
    try {
      await resumeTask(taskId);
      fetchTask();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveSchedule = async () => {
    setActionLoading(true);
    try {
      await updateTask(taskId, { schedule: null });
      fetchTask();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove schedule');
    } finally {
      setActionLoading(false);
    }
  };

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
    : task.status === 'paused' ? 'var(--accent-orange, #f59e0b)'
    : 'var(--text-muted)';

  const isRunning = task.status === 'running' || task.status === 'pending';
  const canEdit = !isRunning;
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

  const hasSchedule = !!task.schedule;
  const showPause = task.status === 'scheduled';
  const showResume = task.status === 'paused';
  const showRemoveSchedule = hasSchedule && (task.status === 'scheduled' || task.status === 'paused');

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
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
        Created {formatDate(task.createdAt)}
        {task.completedAt && ` \u00B7 Completed ${formatDate(task.completedAt)}`}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {canEdit && !editing && (
          <button className="btn btn-secondary btn-sm" onClick={handleEdit}>
            Edit
          </button>
        )}
        {showPause && (
          <button className="btn btn-secondary btn-sm" onClick={handlePause} disabled={actionLoading}>
            {actionLoading ? 'Pausing...' : 'Pause Schedule'}
          </button>
        )}
        {showResume && (
          <button className="btn btn-primary btn-sm" onClick={handleResume} disabled={actionLoading}>
            {actionLoading ? 'Resuming...' : 'Resume Schedule'}
          </button>
        )}
        {showRemoveSchedule && (
          <button className="btn btn-danger btn-sm" onClick={handleRemoveSchedule} disabled={actionLoading}>
            Remove Schedule
          </button>
        )}
      </div>

      {/* Edit form */}
      {editing && editForm && (
        <div style={{
          padding: '16px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          marginBottom: '24px',
        }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '12px' }}>Edit Task</h3>
          <div style={{ display: 'grid', gap: '12px', maxWidth: '500px' }}>
            {/* Model selector */}
            <label style={{ fontSize: '0.8rem' }}>
              Model
              <select
                value={editForm.model}
                onChange={(e) => setEditForm({ ...editForm, model: e.target.value as ClaudeModel })}
                style={{
                  display: 'block', width: '100%', padding: '6px 8px', marginTop: '4px',
                  background: 'var(--bg-primary)', color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.85rem',
                }}
              >
                <option value="haiku">Haiku</option>
                <option value="sonnet">Sonnet</option>
                <option value="opus">Opus</option>
              </select>
            </label>

            {/* Budget */}
            <label style={{ fontSize: '0.8rem' }}>
              Budget ($)
              <input
                type="number"
                step="0.1"
                value={editForm.budget}
                onChange={(e) => setEditForm({ ...editForm, budget: e.target.value })}
                style={{
                  display: 'block', width: '100%', padding: '6px 8px', marginTop: '4px',
                  background: 'var(--bg-primary)', color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.85rem',
                }}
              />
            </label>

            {/* Service-specific fields */}
            {task.serviceType === 'report' && (
              <label style={{ fontSize: '0.8rem' }}>
                Prompt
                <textarea
                  value={editForm.prompt}
                  onChange={(e) => setEditForm({ ...editForm, prompt: e.target.value })}
                  rows={4}
                  style={{
                    display: 'block', width: '100%', padding: '6px 8px', marginTop: '4px',
                    background: 'var(--bg-primary)', color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.85rem',
                    resize: 'vertical', fontFamily: 'inherit',
                  }}
                />
              </label>
            )}

            {task.serviceType === 'research' && (
              <>
                <label style={{ fontSize: '0.8rem' }}>
                  Topic
                  <input
                    type="text"
                    value={editForm.topic}
                    onChange={(e) => setEditForm({ ...editForm, topic: e.target.value })}
                    style={{
                      display: 'block', width: '100%', padding: '6px 8px', marginTop: '4px',
                      background: 'var(--bg-primary)', color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.85rem',
                    }}
                  />
                </label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <label style={{ fontSize: '0.8rem', flex: 1 }}>
                    Max Steps
                    <input
                      type="number"
                      value={editForm.maxSteps}
                      onChange={(e) => setEditForm({ ...editForm, maxSteps: e.target.value })}
                      style={{
                        display: 'block', width: '100%', padding: '6px 8px', marginTop: '4px',
                        background: 'var(--bg-primary)', color: 'var(--text-primary)',
                        border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.85rem',
                      }}
                    />
                  </label>
                  <label style={{ fontSize: '0.8rem', flex: 1 }}>
                    Max Revisions/Step
                    <input
                      type="number"
                      value={editForm.maxRevisionsPerStep}
                      onChange={(e) => setEditForm({ ...editForm, maxRevisionsPerStep: e.target.value })}
                      style={{
                        display: 'block', width: '100%', padding: '6px 8px', marginTop: '4px',
                        background: 'var(--bg-primary)', color: 'var(--text-primary)',
                        border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.85rem',
                      }}
                    />
                  </label>
                </div>
              </>
            )}

            {task.serviceType === 'topic-tracker' && (
              <>
                <label style={{ fontSize: '0.8rem' }}>
                  Topic
                  <input
                    type="text"
                    value={editForm.topic}
                    onChange={(e) => setEditForm({ ...editForm, topic: e.target.value })}
                    style={{
                      display: 'block', width: '100%', padding: '6px 8px', marginTop: '4px',
                      background: 'var(--bg-primary)', color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.85rem',
                    }}
                  />
                </label>
                <label style={{ fontSize: '0.8rem' }}>
                  Preset
                  <select
                    value={editForm.preset}
                    onChange={(e) => setEditForm({ ...editForm, preset: e.target.value })}
                    style={{
                      display: 'block', width: '100%', padding: '6px 8px', marginTop: '4px',
                      background: 'var(--bg-primary)', color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.85rem',
                    }}
                  >
                    <option value="custom">Custom</option>
                    <option value="company-news">Company News</option>
                    <option value="market-crypto">Market / Crypto</option>
                    <option value="election-politics">Election / Politics</option>
                    <option value="tech-launch">Tech Launch</option>
                  </select>
                </label>
                <label style={{ fontSize: '0.8rem' }}>
                  Max Cycles
                  <input
                    type="number"
                    value={editForm.maxCycles}
                    onChange={(e) => setEditForm({ ...editForm, maxCycles: e.target.value })}
                    style={{
                      display: 'block', width: '100%', padding: '6px 8px', marginTop: '4px',
                      background: 'var(--bg-primary)', color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.85rem',
                    }}
                  />
                </label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <label style={{ fontSize: '0.8rem', flex: 1 }}>
                    Max $/Window
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.maxPerWindow}
                      onChange={(e) => setEditForm({ ...editForm, maxPerWindow: e.target.value })}
                      style={{
                        display: 'block', width: '100%', padding: '6px 8px', marginTop: '4px',
                        background: 'var(--bg-primary)', color: 'var(--text-primary)',
                        border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.85rem',
                      }}
                    />
                  </label>
                  <label style={{ fontSize: '0.8rem', flex: 1 }}>
                    Window (hours)
                    <input
                      type="number"
                      value={editForm.windowHours}
                      onChange={(e) => setEditForm({ ...editForm, windowHours: e.target.value })}
                      style={{
                        display: 'block', width: '100%', padding: '6px 8px', marginTop: '4px',
                        background: 'var(--bg-primary)', color: 'var(--text-primary)',
                        border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.85rem',
                      }}
                    />
                  </label>
                </div>
              </>
            )}

            {task.serviceType === 'code-task' && (
              <>
                <label style={{ fontSize: '0.8rem' }}>
                  Description
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    rows={3}
                    style={{
                      display: 'block', width: '100%', padding: '6px 8px', marginTop: '4px',
                      background: 'var(--bg-primary)', color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.85rem',
                      resize: 'vertical', fontFamily: 'inherit',
                    }}
                  />
                </label>
                <label style={{ fontSize: '0.8rem' }}>
                  Target Path
                  <input
                    type="text"
                    value={editForm.targetPath}
                    onChange={(e) => setEditForm({ ...editForm, targetPath: e.target.value })}
                    style={{
                      display: 'block', width: '100%', padding: '6px 8px', marginTop: '4px',
                      background: 'var(--bg-primary)', color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.85rem',
                    }}
                  />
                </label>
                <label style={{ fontSize: '0.8rem' }}>
                  Max Iterations
                  <input
                    type="number"
                    value={editForm.maxIterations}
                    onChange={(e) => setEditForm({ ...editForm, maxIterations: e.target.value })}
                    style={{
                      display: 'block', width: '100%', padding: '6px 8px', marginTop: '4px',
                      background: 'var(--bg-primary)', color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.85rem',
                    }}
                  />
                </label>
              </>
            )}

            {task.serviceType === 'self-improve' && (
              <label style={{ fontSize: '0.8rem' }}>
                Max Iterations
                <input
                  type="number"
                  value={editForm.maxIterations}
                  onChange={(e) => setEditForm({ ...editForm, maxIterations: e.target.value })}
                  style={{
                    display: 'block', width: '100%', padding: '6px 8px', marginTop: '4px',
                    background: 'var(--bg-primary)', color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '0.85rem',
                  }}
                />
              </label>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleCancelEdit}>
              Cancel
            </button>
          </div>
        </div>
      )}

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

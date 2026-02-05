'use client';

import { useState } from 'react';
import {
  type StandaloneTask,
  type ScheduleSlot,
  pauseTask,
  resumeTask,
  updateTask,
  deleteTask,
} from '../../lib/api';
import { formatDate } from '../../lib/format-date';
import ScheduleTaskEditor from './schedule-task-editor';

interface ScheduleViewProps {
  tasks: StandaloneTask[];
  onRefresh: () => void;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface HeatmapCell {
  count: number;
  taskNames: string[];
}

function getTaskLabel(task: StandaloneTask): string {
  const p = task.params as Record<string, unknown>;
  const raw = String(p.prompt ?? p.topic ?? p.description ?? task.serviceType);
  return raw.slice(0, 60);
}

function buildHeatmapData(tasks: StandaloneTask[]): HeatmapCell[][] {
  // 7 days x 24 hours
  const grid: HeatmapCell[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ count: 0, taskNames: [] }))
  );

  for (const task of tasks) {
    const schedule = task.schedule as Record<string, unknown> | undefined;
    if (!schedule) continue;
    const label = getTaskLabel(task);

    if (schedule.type === 'scheduled' && Array.isArray(schedule.slots)) {
      const slots = schedule.slots as ScheduleSlot[];
      for (const slot of slots) {
        const hour = parseInt(slot.timeOfDay.split(':')[0], 10);
        for (const day of slot.daysOfWeek) {
          if (day >= 0 && day < 7 && hour >= 0 && hour < 24) {
            grid[day][hour].count++;
            grid[day][hour].taskNames.push(label);
          }
        }
      }
    } else if (schedule.type === 'interval') {
      // Interval tasks run across all days/hours — mark all cells
      for (let d = 0; d < 7; d++) {
        for (let h = 0; h < 24; h++) {
          grid[d][h].count++;
          grid[d][h].taskNames.push(`${label} (interval)`);
        }
      }
    }
  }

  return grid;
}

function getCellColor(count: number): string {
  if (count === 0) return 'var(--bg-tertiary, rgba(255,255,255,0.03))';
  if (count === 1) return 'rgba(59, 130, 246, 0.25)';
  if (count === 2) return 'rgba(59, 130, 246, 0.45)';
  if (count === 3) return 'rgba(59, 130, 246, 0.6)';
  return 'rgba(59, 130, 246, 0.8)';
}

function getScheduleDescription(task: StandaloneTask): string {
  const schedule = task.schedule as Record<string, unknown> | undefined;
  if (!schedule) return 'No schedule';

  if (schedule.type === 'scheduled' && Array.isArray(schedule.slots)) {
    const slots = schedule.slots as ScheduleSlot[];
    return slots.map((slot) => {
      const days = slot.daysOfWeek.map((d) => DAY_LABELS[d]).join(', ');
      return `${slot.timeOfDay} on ${days}`;
    }).join(' | ');
  }

  if (schedule.type === 'interval') {
    const hours = schedule.intervalHours as number;
    const maxCycles = schedule.maxCycles as number | undefined;
    let desc = `Every ${hours}h`;
    if (maxCycles) desc += ` (max ${maxCycles} cycles)`;
    return desc;
  }

  return 'Unknown schedule';
}

function getCycleProgress(task: StandaloneTask): string | null {
  const schedule = task.schedule as Record<string, unknown> | undefined;
  if (!schedule || schedule.type !== 'interval') return null;
  const maxCycles = (schedule.maxCycles as number) ?? (task.params as Record<string, unknown>).maxCycles;
  const completed = task.cyclesCompleted ?? 0;
  if (maxCycles) return `${completed}/${maxCycles}`;
  if (completed > 0) return `${completed} cycles`;
  return null;
}

const SERVICE_BADGES: Record<string, { label: string; color: string }> = {
  'report': { label: 'Report', color: 'var(--accent-blue, #3b82f6)' },
  'research': { label: 'Research', color: 'var(--accent-purple, #8b5cf6)' },
  'topic-tracker': { label: 'Tracker', color: 'var(--accent-orange, #f59e0b)' },
  'code-task': { label: 'Code', color: 'var(--accent-green, #22c55e)' },
  'self-improve': { label: 'Self-Imp', color: 'var(--accent-red, #ef4444)' },
};

export default function ScheduleView({ tasks, onRefresh }: ScheduleViewProps) {
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ day: number; hour: number } | null>(null);

  const heatmap = buildHeatmapData(tasks);

  const handlePause = async (taskId: string) => {
    await pauseTask(taskId);
    onRefresh();
  };

  const handleResume = async (taskId: string) => {
    await resumeTask(taskId);
    onRefresh();
  };

  const handleRemoveSchedule = async (taskId: string) => {
    await updateTask(taskId, { schedule: null });
    onRefresh();
  };

  const handleDelete = async (taskId: string) => {
    await deleteTask(taskId);
    onRefresh();
  };

  return (
    <div>
      {/* 24x7 Heatmap Grid */}
      <div className="section">
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '12px' }}>
          Weekly Schedule Heatmap
        </h2>
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '700px' }}>
            <thead>
              <tr>
                <th style={{ padding: '4px 8px', fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'left', width: '50px' }} />
                {HOURS.map((h) => (
                  <th key={h} style={{
                    padding: '4px 0',
                    fontSize: '0.65rem',
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                    fontWeight: 400,
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAY_LABELS.map((dayLabel, dayIdx) => (
                <tr key={dayIdx}>
                  <td style={{
                    padding: '4px 8px',
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                    fontWeight: 500,
                  }}>
                    {dayLabel}
                  </td>
                  {HOURS.map((h) => {
                    const cell = heatmap[dayIdx][h];
                    const isHovered = hoveredCell?.day === dayIdx && hoveredCell?.hour === h;
                    return (
                      <td
                        key={h}
                        onMouseEnter={() => setHoveredCell({ day: dayIdx, hour: h })}
                        onMouseLeave={() => setHoveredCell(null)}
                        style={{
                          padding: '2px',
                          position: 'relative',
                        }}
                      >
                        <div style={{
                          width: '100%',
                          aspectRatio: '1',
                          minHeight: '18px',
                          borderRadius: '3px',
                          background: getCellColor(cell.count),
                          border: isHovered && cell.count > 0 ? '1px solid var(--accent-blue, #3b82f6)' : '1px solid transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.6rem',
                          color: cell.count > 0 ? 'var(--text-primary)' : 'transparent',
                          cursor: cell.count > 0 ? 'default' : undefined,
                        }}>
                          {cell.count > 0 ? cell.count : ''}
                        </div>
                        {/* Tooltip */}
                        {isHovered && cell.count > 0 && (
                          <div style={{
                            position: 'absolute',
                            bottom: '100%',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            fontSize: '0.72rem',
                            whiteSpace: 'nowrap',
                            zIndex: 100,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                            color: 'var(--text-primary)',
                          }}>
                            <div style={{ fontWeight: 600, marginBottom: '2px' }}>
                              {dayLabel} {String(h).padStart(2, '0')}:00
                            </div>
                            {cell.taskNames.map((name, i) => (
                              <div key={i} style={{ color: 'var(--text-secondary)' }}>{name}</div>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Scheduled Tasks List */}
      <div className="section">
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '12px' }}>
          Scheduled Tasks ({tasks.length})
        </h2>
        {tasks.length === 0 ? (
          <div className="card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            No scheduled tasks. Create a task with a schedule from the Intel, Code Task, or Self-Improve tabs.
          </div>
        ) : (
          <div>
            {tasks.map((task) => {
              const isEditing = editingTaskId === task.taskId;
              const badge = SERVICE_BADGES[task.serviceType];
              const statusColor = task.status === 'scheduled' ? 'var(--accent-blue, #3b82f6)'
                : task.status === 'paused' ? 'var(--accent-orange, #f59e0b)'
                : 'var(--text-muted)';
              const cycleProgress = getCycleProgress(task);

              return (
                <div key={task.taskId} style={{ marginBottom: '6px' }}>
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: isEditing ? '6px 6px 0 0' : '6px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderBottom: isEditing ? 'none' : undefined,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      cursor: 'pointer',
                    }}
                    onClick={() => setEditingTaskId(isEditing ? null : task.taskId)}
                  >
                    {/* Status badge */}
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '12px',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      background: `color-mix(in srgb, ${statusColor} 15%, transparent)`,
                      color: statusColor,
                      flexShrink: 0,
                    }}>
                      {task.status}
                    </span>

                    {/* Service type badge */}
                    {badge && (
                      <span style={{
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        padding: '1px 6px',
                        borderRadius: '3px',
                        color: badge.color,
                        background: 'var(--bg-tertiary)',
                        border: `1px solid ${badge.color}`,
                        opacity: 0.85,
                        flexShrink: 0,
                      }}>
                        {badge.label}
                      </span>
                    )}

                    {/* Task info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {getTaskLabel(task)}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        {task.model} &middot; {getScheduleDescription(task)}
                        {cycleProgress && (
                          <span style={{ marginLeft: '8px', color: 'var(--accent-blue, #3b82f6)' }}>
                            {cycleProgress}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      {task.status === 'scheduled' && (
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.72rem' }}
                          onClick={() => handlePause(task.taskId)}
                        >
                          Pause
                        </button>
                      )}
                      {task.status === 'paused' && (
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ fontSize: '0.72rem' }}
                          onClick={() => handleResume(task.taskId)}
                        >
                          Resume
                        </button>
                      )}
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.72rem', color: 'var(--accent-orange, #f59e0b)' }}
                        onClick={() => handleRemoveSchedule(task.taskId)}
                      >
                        Unschedule
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        style={{ fontSize: '0.72rem' }}
                        onClick={() => handleDelete(task.taskId)}
                      >
                        Delete
                      </button>
                      <a
                        href={`/tasks/${task.taskId}`}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.72rem', textDecoration: 'none' }}
                      >
                        Detail
                      </a>
                    </div>
                  </div>

                  {/* Inline editor */}
                  {isEditing && (
                    <div style={{
                      padding: '16px',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderTop: '1px solid var(--border-color)',
                      borderRadius: '0 0 6px 6px',
                    }}>
                      <ScheduleTaskEditor
                        task={task}
                        onSave={() => {
                          setEditingTaskId(null);
                          onRefresh();
                        }}
                        onCancel={() => setEditingTaskId(null)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

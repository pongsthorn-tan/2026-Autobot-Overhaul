'use client';

import { useState } from 'react';
import {
  type StandaloneTask,
  type ClaudeModel,
  type ScheduleSlot,
  type UpdateTaskInput,
  updateTask,
} from '../../lib/api';

interface ScheduleTaskEditorProps {
  task: StandaloneTask;
  onSave: () => void;
  onCancel: () => void;
}

const ALL_DAYS = [
  { label: 'SUN', value: 0 },
  { label: 'MON', value: 1 },
  { label: 'TUE', value: 2 },
  { label: 'WED', value: 3 },
  { label: 'THU', value: 4 },
  { label: 'FRI', value: 5 },
  { label: 'SAT', value: 6 },
];

interface EditState {
  model: ClaudeModel;
  budget: string;
  prompt: string;
  topic: string;
  maxSteps: string;
  maxRevisionsPerStep: string;
  preset: string;
  maxCycles: string;
  maxPerWindow: string;
  windowHours: string;
  description: string;
  targetPath: string;
  maxIterations: string;
  // Schedule fields
  scheduleType: 'scheduled' | 'interval';
  slots: ScheduleSlot[];
  intervalHours: string;
  intervalMaxCycles: string;
}

function buildEditState(task: StandaloneTask): EditState {
  const p = task.params as Record<string, unknown>;
  const sl = p.spendingLimit as Record<string, unknown> | undefined;
  const schedule = task.schedule as Record<string, unknown> | undefined;

  const scheduleType = (schedule?.type === 'interval' ? 'interval' : 'scheduled') as 'scheduled' | 'interval';
  const slots: ScheduleSlot[] = schedule?.type === 'scheduled' && Array.isArray(schedule.slots)
    ? (schedule.slots as ScheduleSlot[])
    : [{ timeOfDay: '09:00', daysOfWeek: [1, 2, 3, 4, 5] }];

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
    scheduleType,
    slots,
    intervalHours: String(schedule?.intervalHours ?? '3'),
    intervalMaxCycles: String(schedule?.maxCycles ?? ''),
  };
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '6px 8px',
  marginTop: '4px',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-color)',
  borderRadius: '4px',
  fontSize: '0.85rem',
};

export default function ScheduleTaskEditor({ task, onSave, onCancel }: ScheduleTaskEditorProps) {
  const [form, setForm] = useState<EditState>(() => buildEditState(task));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateSlot = (index: number, update: Partial<ScheduleSlot>) => {
    const updated = form.slots.map((slot, i) =>
      i === index ? { ...slot, ...update } : slot
    );
    setForm({ ...form, slots: updated });
  };

  const toggleSlotDay = (index: number, day: number) => {
    const slot = form.slots[index];
    const days = slot.daysOfWeek.includes(day)
      ? slot.daysOfWeek.filter((d) => d !== day)
      : [...slot.daysOfWeek, day];
    updateSlot(index, { daysOfWeek: days });
  };

  const addSlot = () => {
    setForm({ ...form, slots: [...form.slots, { timeOfDay: '09:00', daysOfWeek: [1, 2, 3, 4, 5] }] });
  };

  const removeSlot = (index: number) => {
    setForm({ ...form, slots: form.slots.filter((_, i) => i !== index) });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updates: UpdateTaskInput = {};

      if (form.model !== task.model) {
        updates.model = form.model;
      }

      const newBudget = parseFloat(form.budget);
      if (!isNaN(newBudget) && newBudget !== task.budget) {
        updates.budget = newBudget;
      }

      // Build params update
      const paramUpdates: Record<string, unknown> = {};
      const p = task.params as Record<string, unknown>;

      if (task.serviceType === 'report') {
        if (form.prompt && form.prompt !== p.prompt) paramUpdates.prompt = form.prompt;
      } else if (task.serviceType === 'research') {
        if (form.topic && form.topic !== p.topic) paramUpdates.topic = form.topic;
        const ms = form.maxSteps ? parseInt(form.maxSteps) : undefined;
        if (ms && ms !== p.maxSteps) paramUpdates.maxSteps = ms;
        const mr = form.maxRevisionsPerStep ? parseInt(form.maxRevisionsPerStep) : undefined;
        if (mr && mr !== p.maxRevisionsPerStep) paramUpdates.maxRevisionsPerStep = mr;
      } else if (task.serviceType === 'topic-tracker') {
        if (form.topic && form.topic !== p.topic) paramUpdates.topic = form.topic;
        if (form.preset && form.preset !== p.preset) paramUpdates.preset = form.preset;
        const mc = form.maxCycles ? parseInt(form.maxCycles) : undefined;
        if (mc && mc !== p.maxCycles) paramUpdates.maxCycles = mc;
        const mpw = form.maxPerWindow ? parseFloat(form.maxPerWindow) : undefined;
        const wh = form.windowHours ? parseInt(form.windowHours) : undefined;
        if (mpw && wh) {
          paramUpdates.spendingLimit = { maxPerWindow: mpw, windowHours: wh };
        }
      } else if (task.serviceType === 'code-task') {
        if (form.description && form.description !== p.description) paramUpdates.description = form.description;
        if (form.targetPath && form.targetPath !== p.targetPath) paramUpdates.targetPath = form.targetPath;
        const mi = form.maxIterations ? parseInt(form.maxIterations) : undefined;
        if (mi && mi !== p.maxIterations) paramUpdates.maxIterations = mi;
      } else if (task.serviceType === 'self-improve') {
        const mi = form.maxIterations ? parseInt(form.maxIterations) : undefined;
        if (mi && mi !== p.maxIterations) paramUpdates.maxIterations = mi;
      }

      if (Object.keys(paramUpdates).length > 0) {
        updates.params = paramUpdates;
      }

      // Build schedule update
      if (form.scheduleType === 'scheduled') {
        updates.schedule = { type: 'scheduled', slots: form.slots };
      } else {
        const intervalHours = parseFloat(form.intervalHours) || 3;
        const maxCycles = form.intervalMaxCycles ? parseInt(form.intervalMaxCycles) : undefined;
        updates.schedule = { type: 'interval', intervalHours, ...(maxCycles ? { maxCycles } : {}) };
      }

      await updateTask(task.taskId, updates);
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '12px' }}>Edit Task</h3>

      {error && <div className="error-message" style={{ marginBottom: '12px' }}>{error}</div>}

      <div style={{ display: 'grid', gap: '12px', maxWidth: '600px' }}>
        {/* Model + Budget row */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <label style={{ fontSize: '0.8rem', flex: 1 }}>
            Model
            <select
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value as ClaudeModel })}
              style={inputStyle}
            >
              <option value="haiku">Haiku</option>
              <option value="sonnet">Sonnet</option>
              <option value="opus">Opus</option>
            </select>
          </label>
          <label style={{ fontSize: '0.8rem', width: '120px' }}>
            Budget ($)
            <input
              type="number"
              step="0.1"
              value={form.budget}
              onChange={(e) => setForm({ ...form, budget: e.target.value })}
              style={inputStyle}
            />
          </label>
        </div>

        {/* Service-specific fields */}
        {task.serviceType === 'report' && (
          <label style={{ fontSize: '0.8rem' }}>
            Prompt
            <textarea
              value={form.prompt}
              onChange={(e) => setForm({ ...form, prompt: e.target.value })}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </label>
        )}

        {task.serviceType === 'research' && (
          <>
            <label style={{ fontSize: '0.8rem' }}>
              Topic
              <input type="text" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} style={inputStyle} />
            </label>
            <div style={{ display: 'flex', gap: '12px' }}>
              <label style={{ fontSize: '0.8rem', flex: 1 }}>
                Max Steps
                <input type="number" value={form.maxSteps} onChange={(e) => setForm({ ...form, maxSteps: e.target.value })} style={inputStyle} />
              </label>
              <label style={{ fontSize: '0.8rem', flex: 1 }}>
                Max Revisions/Step
                <input type="number" value={form.maxRevisionsPerStep} onChange={(e) => setForm({ ...form, maxRevisionsPerStep: e.target.value })} style={inputStyle} />
              </label>
            </div>
          </>
        )}

        {task.serviceType === 'topic-tracker' && (
          <>
            <label style={{ fontSize: '0.8rem' }}>
              Topic
              <input type="text" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} style={inputStyle} />
            </label>
            <label style={{ fontSize: '0.8rem' }}>
              Preset
              <select value={form.preset} onChange={(e) => setForm({ ...form, preset: e.target.value })} style={inputStyle}>
                <option value="custom">Custom</option>
                <option value="company-news">Company News</option>
                <option value="market-crypto">Market / Crypto</option>
                <option value="election-politics">Election / Politics</option>
                <option value="tech-launch">Tech Launch</option>
              </select>
            </label>
            <label style={{ fontSize: '0.8rem' }}>
              Max Cycles
              <input type="number" value={form.maxCycles} onChange={(e) => setForm({ ...form, maxCycles: e.target.value })} style={inputStyle} />
            </label>
            <div style={{ display: 'flex', gap: '12px' }}>
              <label style={{ fontSize: '0.8rem', flex: 1 }}>
                Max $/Window
                <input type="number" step="0.01" value={form.maxPerWindow} onChange={(e) => setForm({ ...form, maxPerWindow: e.target.value })} style={inputStyle} />
              </label>
              <label style={{ fontSize: '0.8rem', flex: 1 }}>
                Window (hours)
                <input type="number" value={form.windowHours} onChange={(e) => setForm({ ...form, windowHours: e.target.value })} style={inputStyle} />
              </label>
            </div>
          </>
        )}

        {task.serviceType === 'code-task' && (
          <>
            <label style={{ fontSize: '0.8rem' }}>
              Description
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </label>
            <label style={{ fontSize: '0.8rem' }}>
              Target Path
              <input type="text" value={form.targetPath} onChange={(e) => setForm({ ...form, targetPath: e.target.value })} style={inputStyle} />
            </label>
            <label style={{ fontSize: '0.8rem' }}>
              Max Iterations
              <input type="number" value={form.maxIterations} onChange={(e) => setForm({ ...form, maxIterations: e.target.value })} style={inputStyle} />
            </label>
          </>
        )}

        {task.serviceType === 'self-improve' && (
          <label style={{ fontSize: '0.8rem' }}>
            Max Iterations
            <input type="number" value={form.maxIterations} onChange={(e) => setForm({ ...form, maxIterations: e.target.value })} style={inputStyle} />
          </label>
        )}

        {/* Schedule editor */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 500 }}>
            Schedule
          </div>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input
                type="radio"
                checked={form.scheduleType === 'scheduled'}
                onChange={() => setForm({ ...form, scheduleType: 'scheduled' })}
              />
              Time Slots
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input
                type="radio"
                checked={form.scheduleType === 'interval'}
                onChange={() => setForm({ ...form, scheduleType: 'interval' })}
              />
              Interval
            </label>
          </div>

          {form.scheduleType === 'scheduled' && (
            <div style={{ paddingLeft: '8px', borderLeft: '2px solid var(--border)' }}>
              {form.slots.map((slot, index) => (
                <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <input
                    type="time"
                    value={slot.timeOfDay}
                    onChange={(e) => updateSlot(index, { timeOfDay: e.target.value })}
                    style={{ width: '110px', ...inputStyle, marginTop: 0 }}
                  />
                  <div style={{ display: 'flex', gap: '3px' }}>
                    {ALL_DAYS.map((day) => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleSlotDay(index, day.value)}
                        className={slot.daysOfWeek.includes(day.value) ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                        style={{ minWidth: '36px', padding: '2px 4px', fontSize: '0.65rem' }}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                  {form.slots.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSlot(index)}
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '2px 8px', fontSize: '0.75rem', color: 'var(--accent-red)' }}
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addSlot}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.72rem' }}
              >
                + Add Slot
              </button>
            </div>
          )}

          {form.scheduleType === 'interval' && (
            <div style={{ display: 'flex', gap: '12px' }}>
              <label style={{ fontSize: '0.8rem', flex: 1 }}>
                Interval (hours)
                <input
                  type="number"
                  step="0.5"
                  value={form.intervalHours}
                  onChange={(e) => setForm({ ...form, intervalHours: e.target.value })}
                  style={inputStyle}
                />
              </label>
              <label style={{ fontSize: '0.8rem', flex: 1 }}>
                Max Cycles
                <input
                  type="number"
                  value={form.intervalMaxCycles}
                  onChange={(e) => setForm({ ...form, intervalMaxCycles: e.target.value })}
                  style={inputStyle}
                  placeholder="Unlimited"
                />
              </label>
            </div>
          )}
        </div>

        {/* Cycle info (read-only) */}
        {task.cyclesCompleted !== undefined && task.cyclesCompleted > 0 && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            {task.cyclesCompleted} cycles completed (preserved on save)
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

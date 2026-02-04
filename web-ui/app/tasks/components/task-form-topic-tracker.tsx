'use client';

import { useState } from 'react';
import LiveLog from '../../components/live-log';
import {
  type ClaudeModel,
  type CreateTaskInput,
  type ScheduleSlot,
  type ScheduleConfig,
  type TopicPreset,
  type SpendingLimit,
} from '../../lib/api';

interface TaskFormTopicTrackerProps {
  onSubmit: (input: CreateTaskInput) => Promise<{ taskId: string } | void>;
  loading: boolean;
  activeTaskId?: string | null;
}

interface PresetDef {
  label: string;
  description: string;
  defaultSchedule: 'weekly' | 'interval' | 'once';
  defaultDay?: number | null;
  defaultTime?: string;
  defaultIntervalHours?: number;
  defaultModel: ClaudeModel;
  defaultBudget: string;
  defaultMaxCycles?: number;
  defaultSpendingLimit?: SpendingLimit;
}

const TOPIC_PRESETS: Record<TopicPreset, PresetDef> = {
  'company-news': {
    label: 'Company News',
    description: 'Weekly digest of company announcements, earnings, leadership changes',
    defaultSchedule: 'weekly',
    defaultDay: 0,
    defaultTime: '20:00',
    defaultModel: 'haiku',
    defaultBudget: '0.50',
  },
  'market-crypto': {
    label: 'Market & Crypto',
    description: 'Daily market movements, regulatory news, notable transactions',
    defaultSchedule: 'weekly',
    defaultDay: null,
    defaultTime: '07:00',
    defaultModel: 'haiku',
    defaultBudget: '2.00',
  },
  'election-politics': {
    label: 'Election & Politics',
    description: 'High-frequency tracking of election results, polls, breaking political news',
    defaultSchedule: 'interval',
    defaultIntervalHours: 1,
    defaultModel: 'haiku',
    defaultBudget: '5.00',
    defaultMaxCycles: 48,
    defaultSpendingLimit: { maxPerWindow: 0.50, windowHours: 3 },
  },
  'tech-launch': {
    label: 'Tech / Product Launch',
    description: 'Track a product launch — reviews, availability, user reactions',
    defaultSchedule: 'interval',
    defaultIntervalHours: 4,
    defaultModel: 'haiku',
    defaultBudget: '3.00',
    defaultMaxCycles: 42,
    defaultSpendingLimit: { maxPerWindow: 0.30, windowHours: 3 },
  },
  'custom': {
    label: 'Custom',
    description: 'Configure your own tracking frequency and parameters',
    defaultSchedule: 'once',
    defaultModel: 'sonnet',
    defaultBudget: '1.00',
  },
};

const ALL_DAYS = [
  { label: 'SUN', value: 0 },
  { label: 'MON', value: 1 },
  { label: 'TUE', value: 2 },
  { label: 'WED', value: 3 },
  { label: 'THU', value: 4 },
  { label: 'FRI', value: 5 },
  { label: 'SAT', value: 6 },
];

export default function TaskFormTopicTracker({ onSubmit, loading, activeTaskId }: TaskFormTopicTrackerProps) {
  const [topic, setTopic] = useState('');
  const [preset, setPreset] = useState<TopicPreset>('custom');
  const [model, setModel] = useState<ClaudeModel>('sonnet');
  const [budget, setBudget] = useState('1.00');
  const [scheduleMode, setScheduleMode] = useState<'once' | 'weekly' | 'interval'>('once');

  // Weekly fields
  const [timeOfDay, setTimeOfDay] = useState('09:00');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);

  // Interval fields
  const [intervalHours, setIntervalHours] = useState('1');
  const [maxCycles, setMaxCycles] = useState('');

  // Spending limit
  const [spendingEnabled, setSpendingEnabled] = useState(false);
  const [spendMaxPerWindow, setSpendMaxPerWindow] = useState('0.50');
  const [spendWindowHours, setSpendWindowHours] = useState('3');

  const [submittedTaskId, setSubmittedTaskId] = useState<string | null>(null);

  const applyPreset = (p: TopicPreset) => {
    setPreset(p);
    const def = TOPIC_PRESETS[p];
    setModel(def.defaultModel);
    setBudget(def.defaultBudget);
    setScheduleMode(def.defaultSchedule);

    if (def.defaultTime) setTimeOfDay(def.defaultTime);
    if (def.defaultDay !== undefined) {
      setDaysOfWeek(def.defaultDay === null ? [0, 1, 2, 3, 4, 5, 6] : [def.defaultDay]);
    }
    if (def.defaultIntervalHours) setIntervalHours(String(def.defaultIntervalHours));
    if (def.defaultMaxCycles) {
      setMaxCycles(String(def.defaultMaxCycles));
    } else {
      setMaxCycles('');
    }
    if (def.defaultSpendingLimit) {
      setSpendingEnabled(true);
      setSpendMaxPerWindow(String(def.defaultSpendingLimit.maxPerWindow));
      setSpendWindowHours(String(def.defaultSpendingLimit.windowHours));
    } else {
      setSpendingEnabled(false);
    }
  };

  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const buildSchedule = (): ScheduleConfig | undefined => {
    if (scheduleMode === 'once') return undefined;
    if (scheduleMode === 'weekly') {
      const slot: ScheduleSlot = { timeOfDay, daysOfWeek };
      return { type: 'scheduled', slots: [slot] };
    }
    if (scheduleMode === 'interval') {
      return {
        type: 'interval',
        intervalHours: parseFloat(intervalHours) || 1,
        maxCycles: maxCycles ? parseInt(maxCycles, 10) : undefined,
      };
    }
    return undefined;
  };

  const buildSpendingLimit = (): SpendingLimit | undefined => {
    if (!spendingEnabled) return undefined;
    return {
      maxPerWindow: parseFloat(spendMaxPerWindow) || 0.50,
      windowHours: parseFloat(spendWindowHours) || 3,
    };
  };

  const handleSubmit = async (runNow: boolean) => {
    if (!topic.trim()) return;
    const schedule = buildSchedule();

    const input: CreateTaskInput = {
      serviceType: 'topic-tracker',
      params: {
        serviceType: 'topic-tracker',
        topic: topic.trim(),
        preset,
        maxCycles: maxCycles ? parseInt(maxCycles, 10) : undefined,
        spendingLimit: buildSpendingLimit(),
      },
      model,
      budget: parseFloat(budget) || 1.0,
      runNow,
      schedule,
    };

    await onSubmit(input);
  };

  const currentTaskId = activeTaskId ?? submittedTaskId;
  const presetDef = TOPIC_PRESETS[preset];

  const sectionStyle = {
    padding: '12px',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    marginBottom: '16px',
  };

  const sectionHeaderStyle = {
    fontSize: '0.75rem',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: '10px',
    fontWeight: 600,
  };

  const labelStyle = {
    display: 'block' as const,
    fontSize: '0.8rem',
    color: 'var(--text-secondary)',
    marginBottom: '4px',
  };

  return (
    <div>
      {/* Topic input */}
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Topic</label>
        <textarea
          placeholder="What do you want to track?"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={2}
          style={{ width: '100%', resize: 'vertical' }}
        />
      </div>

      {/* Presets */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>Presets</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
          {(Object.entries(TOPIC_PRESETS) as [TopicPreset, PresetDef][]).map(([key, def]) => (
            <button
              key={key}
              type="button"
              className={preset === key ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
              onClick={() => applyPreset(key)}
              style={{ fontSize: '0.78rem' }}
            >
              {def.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {presetDef.description}
          {presetDef.defaultSchedule === 'weekly' && presetDef.defaultTime && (
            <span style={{ marginLeft: '8px', opacity: 0.7 }}>
              Suggested: {presetDef.defaultDay !== null && presetDef.defaultDay !== undefined
                ? `Every ${ALL_DAYS[presetDef.defaultDay]?.label ?? ''} at ${presetDef.defaultTime}`
                : `Every day at ${presetDef.defaultTime}`}
            </span>
          )}
          {presetDef.defaultSchedule === 'interval' && presetDef.defaultIntervalHours && (
            <span style={{ marginLeft: '8px', opacity: 0.7 }}>
              Suggested: Every {presetDef.defaultIntervalHours}h{presetDef.defaultMaxCycles ? `, max ${presetDef.defaultMaxCycles} cycles` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Schedule */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>Schedule</div>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
          {(['once', 'weekly', 'interval'] as const).map((mode) => (
            <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input
                type="radio"
                name="topicScheduleMode"
                checked={scheduleMode === mode}
                onChange={() => setScheduleMode(mode)}
              />
              {mode === 'once' ? 'Run Once' : mode === 'weekly' ? 'Weekly' : 'Interval'}
            </label>
          ))}
        </div>

        {scheduleMode === 'weekly' && (
          <div style={{ paddingLeft: '8px', borderLeft: '2px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <input
                type="time"
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
                style={{ width: '120px' }}
              />
              <div style={{ display: 'flex', gap: '4px' }}>
                {ALL_DAYS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    className={daysOfWeek.includes(day.value) ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                    style={{ minWidth: '38px', padding: '2px 6px', fontSize: '0.7rem' }}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {scheduleMode === 'interval' && (
          <div style={{ paddingLeft: '8px', borderLeft: '2px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.85rem' }}>Every</span>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={intervalHours}
                onChange={(e) => setIntervalHours(e.target.value)}
                style={{ width: '70px' }}
              />
              <span style={{ fontSize: '0.85rem' }}>hours</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.85rem' }}>Max cycles:</span>
              <input
                type="number"
                min="1"
                placeholder="unlimited"
                value={maxCycles}
                onChange={(e) => setMaxCycles(e.target.value)}
                style={{ width: '90px' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>(empty = unlimited)</span>
            </div>
          </div>
        )}
      </div>

      {/* Global Controls: Model, Budget, Spending */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>Global Controls</div>
        <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Model</label>
            <select value={model} onChange={(e) => setModel(e.target.value as ClaudeModel)} style={{ width: '100%' }}>
              <option value="haiku">Haiku (Fast, Low Cost)</option>
              <option value="sonnet">Sonnet (Balanced)</option>
              <option value="opus">Opus (Most Capable)</option>
            </select>
          </div>
          <div style={{ width: '140px' }}>
            <label style={labelStyle}>Total Budget ($)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* Spending limit */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem', marginBottom: '8px' }}>
            <input
              type="checkbox"
              checked={spendingEnabled}
              onChange={(e) => setSpendingEnabled(e.target.checked)}
            />
            Spending Limit
          </label>
          {spendingEnabled && (
            <div style={{ paddingLeft: '8px', borderLeft: '2px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.85rem' }}>Max $</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={spendMaxPerWindow}
                  onChange={(e) => setSpendMaxPerWindow(e.target.value)}
                  style={{ width: '80px' }}
                />
                <span style={{ fontSize: '0.85rem' }}>per</span>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={spendWindowHours}
                  onChange={(e) => setSpendWindowHours(e.target.value)}
                  style={{ width: '60px' }}
                />
                <span style={{ fontSize: '0.85rem' }}>hours</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Prevents runaway spending on high-frequency topics
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button type="button" className="btn btn-primary" onClick={() => handleSubmit(true)} disabled={loading || !topic.trim()}>
          {loading ? 'Creating...' : 'Run Now'}
        </button>
        {scheduleMode !== 'once' && (
          <button type="button" className="btn btn-secondary" onClick={() => handleSubmit(false)} disabled={loading || !topic.trim()}>
            {loading ? 'Scheduling...' : 'Start Tracking'}
          </button>
        )}
      </div>

      {/* LiveLog */}
      {currentTaskId && (
        <LiveLog
          taskId={currentTaskId}
          onDone={() => setSubmittedTaskId(null)}
        />
      )}
    </div>
  );
}

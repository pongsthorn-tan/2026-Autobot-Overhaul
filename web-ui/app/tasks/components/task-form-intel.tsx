'use client';

import { useState } from 'react';
import CommonFields from './common-fields';
import LiveLog from '../../components/live-log';
import ReportRenderer from '../../components/report-renderer';
import {
  type ClaudeModel,
  type CreateTaskInput,
  type ScheduleSlot,
  type ScheduleConfig,
  type TaskStreamEvent,
  type RefineStreamEvent,
  type TopicPreset,
  type SpendingLimit,
  startRefinePrompt,
} from '../../lib/api';

type IntelStyle = 'report' | 'research' | 'topic-tracker';

interface TaskFormIntelProps {
  onSubmit: (input: CreateTaskInput) => Promise<{ taskId: string } | void>;
  loading: boolean;
  activeTaskId?: string | null;
  initialStyle?: IntelStyle;
}

// ============================================================
// Report: step machine types
// ============================================================

type ReportStep = 'input' | 'refining' | 'review' | 'configure' | 'running' | 'done';

interface PromptVersion {
  prompt: string;
  cost: number;
}

const REPORT_STEP_LABELS: { key: ReportStep; label: string }[] = [
  { key: 'input', label: 'Describe' },
  { key: 'review', label: 'Review' },
  { key: 'configure', label: 'Configure' },
];

function StepIndicator({ current }: { current: ReportStep }) {
  const activeIndex = current === 'refining'
    ? 0
    : current === 'running' || current === 'done'
      ? 3
      : REPORT_STEP_LABELS.findIndex((s) => s.key === current);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0',
      marginBottom: '24px',
      padding: '0 4px',
    }}>
      {REPORT_STEP_LABELS.map((s, i) => {
        const isActive = i === activeIndex;
        const isDone = i < activeIndex;
        const color = isActive ? 'var(--accent-blue)' : isDone ? 'var(--accent-green)' : 'var(--text-muted)';

        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: i < REPORT_STEP_LABELS.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.7rem',
                fontWeight: 700,
                background: isActive ? 'var(--accent-blue)' : isDone ? 'var(--accent-green)' : 'var(--bg-tertiary)',
                color: isActive || isDone ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.2s',
              }}>
                {isDone ? '\u2713' : i + 1}
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: isActive ? 600 : 400, color, transition: 'color 0.2s' }}>
                {s.label}
              </span>
            </div>
            {i < REPORT_STEP_LABELS.length - 1 && (
              <div style={{
                flex: 1,
                height: '1px',
                margin: '0 12px',
                background: isDone ? 'var(--accent-green)' : 'var(--border-color)',
                transition: 'background 0.2s',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Topic Tracker: presets
// ============================================================

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

// ============================================================
// Style selector pill styles
// ============================================================

const STYLES: { key: IntelStyle; label: string }[] = [
  { key: 'report', label: 'Report' },
  { key: 'research', label: 'Research' },
  { key: 'topic-tracker', label: 'Topic Tracker' },
];

// ============================================================
// Main component
// ============================================================

export default function TaskFormIntel({ onSubmit, loading, activeTaskId, initialStyle }: TaskFormIntelProps) {
  const [style, setStyle] = useState<IntelStyle>(initialStyle ?? 'report');

  // Shared: topic/prompt
  const [rawPrompt, setRawPrompt] = useState('');

  // --- Report state ---
  const [reportStep, setReportStep] = useState<ReportStep>('input');
  const [refineModel, setRefineModel] = useState<ClaudeModel>('sonnet');
  const [promptHistory, setPromptHistory] = useState<PromptVersion[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [totalRefinementCost, setTotalRefinementCost] = useState(0);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [refineJobId, setRefineJobId] = useState<string | null>(null);
  const [refineChunks, setRefineChunks] = useState('');

  // --- Research state ---
  const [plannerModel, setPlannerModel] = useState<ClaudeModel>('sonnet');
  const [executorModel, setExecutorModel] = useState<ClaudeModel>('haiku');
  const [maxSteps, setMaxSteps] = useState(5);
  const [maxRevisions, setMaxRevisions] = useState(1);

  // --- Topic Tracker state ---
  const [preset, setPreset] = useState<TopicPreset>('custom');
  const [ttScheduleMode, setTtScheduleMode] = useState<'once' | 'weekly' | 'interval'>('once');
  const [timeOfDay, setTimeOfDay] = useState('09:00');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);
  const [intervalHours, setIntervalHours] = useState('1');
  const [maxCycles, setMaxCycles] = useState('');
  const [spendingEnabled, setSpendingEnabled] = useState(false);
  const [spendMaxPerWindow, setSpendMaxPerWindow] = useState('0.50');
  const [spendWindowHours, setSpendWindowHours] = useState('3');
  const [ttSubmittedTaskId, setTtSubmittedTaskId] = useState<string | null>(null);

  // --- Common fields (report + research) ---
  const [model, setModel] = useState<ClaudeModel>('sonnet');
  const [budget, setBudget] = useState('1.00');
  const [scheduleMode, setScheduleMode] = useState<'once' | 'scheduled'>('once');
  const [slots, setSlots] = useState<ScheduleSlot[]>([{ timeOfDay: '09:00', daysOfWeek: [1, 2, 3, 4, 5] }]);

  // --- Running / done state (report + research) ---
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [taskOutput, setTaskOutput] = useState<string | null>(null);
  const [runningStyle, setRunningStyle] = useState<IntelStyle>('report');

  // Is the form in running/done state? (report or research)
  const isRunning = (style === 'report' && reportStep === 'running') ||
    ((style === 'report' || style === 'research') && runningTaskId !== null && taskOutput === null);
  const isDone = (style === 'report' && reportStep === 'done') ||
    ((style === 'report' || style === 'research') && taskOutput !== null);

  // ── Schedule builders ──

  const buildSchedule = (): ScheduleConfig | undefined => {
    if (style === 'topic-tracker') {
      if (ttScheduleMode === 'once') return undefined;
      if (ttScheduleMode === 'weekly') {
        return { type: 'scheduled', slots: [{ timeOfDay, daysOfWeek }] };
      }
      if (ttScheduleMode === 'interval') {
        return {
          type: 'interval',
          intervalHours: parseFloat(intervalHours) || 1,
          maxCycles: maxCycles ? parseInt(maxCycles, 10) : undefined,
        };
      }
      return undefined;
    }
    // report / research
    if (scheduleMode === 'once') return undefined;
    return { type: 'scheduled', slots };
  };

  const buildSpendingLimit = (): SpendingLimit | undefined => {
    if (!spendingEnabled) return undefined;
    return {
      maxPerWindow: parseFloat(spendMaxPerWindow) || 0.50,
      windowHours: parseFloat(spendWindowHours) || 3,
    };
  };

  // ── Topic tracker preset ──

  const applyPreset = (p: TopicPreset) => {
    setPreset(p);
    const def = TOPIC_PRESETS[p];
    setModel(def.defaultModel);
    setBudget(def.defaultBudget);
    setTtScheduleMode(def.defaultSchedule);
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

  // ── Report refinement ──

  const handleRefine = async (prompt: string) => {
    setRefineError(null);
    setRefineChunks('');
    try {
      const result = await startRefinePrompt(prompt, refineModel);
      if (!result.jobId) throw new Error('No jobId returned');
      setRefineJobId(result.jobId);
      setReportStep('refining');
    } catch (err) {
      setRefineError(err instanceof Error ? err.message : 'Failed to start refinement');
    }
  };

  const handleRefineStreamEvent = (event: RefineStreamEvent) => {
    if (event.type === 'chunk') {
      setRefineChunks((prev) => prev + (event.text ?? ''));
    } else if (event.type === 'done') {
      const version: PromptVersion = {
        prompt: event.refinedPrompt || refineChunks,
        cost: event.cost || 0,
      };
      setPromptHistory((prev) => [...prev, version]);
      setCurrentPrompt(event.refinedPrompt || refineChunks);
      setTotalRefinementCost((prev) => prev + (event.cost || 0));
      setRefineJobId(null);
      setReportStep('review');
    } else if (event.type === 'error') {
      setRefineError(event.error || 'Refinement failed');
      setRefineJobId(null);
      setReportStep(promptHistory.length > 0 ? 'review' : 'input');
    }
  };

  const handleUseAsIs = () => {
    setCurrentPrompt(rawPrompt.trim());
    setReportStep('configure');
  };

  const handleRevert = (index: number) => {
    setCurrentPrompt(promptHistory[index].prompt);
  };

  const handleUsePrompt = () => {
    setReportStep('configure');
  };

  // ── Submit ──

  const handleSubmitReport = async (runNow: boolean) => {
    if (!currentPrompt.trim()) return;
    const input: CreateTaskInput = {
      serviceType: 'report',
      params: { serviceType: 'report', prompt: currentPrompt.trim() },
      model,
      budget: parseFloat(budget) || 1.0,
      runNow,
      schedule: buildSchedule(),
    };
    try {
      const result = await onSubmit(input);
      if (runNow && result?.taskId) {
        setRunningTaskId(result.taskId);
        setRunningStyle('report');
        setReportStep('running');
      }
    } catch {
      // onSubmit handles errors
    }
  };

  const handleSubmitResearch = async (runNow: boolean) => {
    if (!rawPrompt.trim()) return;
    const input: CreateTaskInput = {
      serviceType: 'research',
      params: {
        serviceType: 'research',
        topic: rawPrompt.trim(),
        plannerModel,
        executorModel,
        maxSteps,
        maxRevisionsPerStep: maxRevisions,
      },
      model,
      budget: parseFloat(budget) || 2.0,
      runNow,
      schedule: buildSchedule(),
    };
    try {
      const task = await onSubmit(input) as unknown as { taskId?: string };
      if (runNow && task && typeof task === 'object' && 'taskId' in task) {
        setRunningTaskId((task as { taskId: string }).taskId);
        setRunningStyle('research');
      }
    } catch {
      // onSubmit handles errors
    }
  };

  const handleSubmitTopicTracker = async (runNow: boolean) => {
    if (!rawPrompt.trim()) return;
    const input: CreateTaskInput = {
      serviceType: 'topic-tracker',
      params: {
        serviceType: 'topic-tracker',
        topic: rawPrompt.trim(),
        preset,
        maxCycles: maxCycles ? parseInt(maxCycles, 10) : undefined,
        spendingLimit: buildSpendingLimit(),
      },
      model,
      budget: parseFloat(budget) || 1.0,
      runNow,
      schedule: buildSchedule(),
    };
    await onSubmit(input);
  };

  const handleTaskDone = (event: TaskStreamEvent | RefineStreamEvent) => {
    if ('output' in event && event.output) {
      setTaskOutput(event.output);
    }
    if (style === 'report') setReportStep('done');
  };

  const resetForm = () => {
    setRunningTaskId(null);
    setTaskOutput(null);
    setRawPrompt('');
    setCurrentPrompt('');
    setPromptHistory([]);
    setReportStep('input');
  };

  // ── Style selector ──

  const renderStyleSelector = () => (
    <div style={{
      display: 'flex',
      gap: '4px',
      marginBottom: '20px',
      padding: '4px',
      background: 'var(--bg-tertiary)',
      borderRadius: 'var(--radius-md)',
      width: 'fit-content',
    }}>
      {STYLES.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => setStyle(s.key)}
          style={{
            padding: '6px 16px',
            fontSize: '0.82rem',
            fontWeight: style === s.key ? 600 : 400,
            color: style === s.key ? '#fff' : 'var(--text-secondary)',
            background: style === s.key ? 'var(--accent-blue, #3b82f6)' : 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {s.label}
        </button>
      ))}
    </div>
  );

  // ── Shared prompt textarea ──

  const renderPromptTextarea = (label: string, placeholder: string, rows: number) => (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
        {label}
      </label>
      <textarea
        placeholder={placeholder}
        value={rawPrompt}
        onChange={(e) => setRawPrompt(e.target.value)}
        rows={rows}
        style={{
          width: '100%',
          resize: 'vertical',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          padding: '12px',
          color: 'var(--text-primary)',
          fontSize: '0.875rem',
          lineHeight: '1.6',
        }}
      />
    </div>
  );

  // ============================================================
  // Running / Done states (shared between report & research)
  // ============================================================

  if ((style === 'report' && reportStep === 'running' && runningTaskId) ||
      (style === 'research' && runningTaskId && !taskOutput)) {
    return (
      <div>
        {renderStyleSelector()}
        <div style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '12px' }}>
          {runningStyle === 'report' ? 'Generating report...' : `Researching: ${rawPrompt}`}
        </div>
        <LiveLog taskId={runningTaskId} onDone={handleTaskDone} />
      </div>
    );
  }

  if ((style === 'report' && reportStep === 'done') ||
      (style === 'research' && taskOutput)) {
    return (
      <div>
        {renderStyleSelector()}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}>
          <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--accent-green)' }}>
            {runningStyle === 'report' ? 'Report complete' : 'Research complete'}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {runningTaskId && (
              <a
                href={`/tasks/${runningTaskId}`}
                className="btn btn-primary"
                style={{ textDecoration: 'none' }}
              >
                View Full Report
              </a>
            )}
            <button type="button" className="btn btn-secondary" onClick={resetForm}>
              {runningStyle === 'report' ? 'New Report' : 'New Research'}
            </button>
          </div>
        </div>
        {taskOutput && (
          <div style={{
            padding: '24px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
          }}>
            <ReportRenderer output={taskOutput} />
          </div>
        )}
      </div>
    );
  }

  // ============================================================
  // Report: multi-step flow
  // ============================================================

  if (style === 'report') {
    // Refining step
    if (reportStep === 'refining' && refineJobId) {
      return (
        <div>
          {renderStyleSelector()}
          <StepIndicator current="refining" />
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '12px' }}>
              Refining your prompt...
            </div>
            <LiveLog
              refineJobId={refineJobId}
              onDone={handleRefineStreamEvent as (e: TaskStreamEvent | RefineStreamEvent) => void}
            />
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setRefineJobId(null);
              setReportStep(promptHistory.length > 0 ? 'review' : 'input');
            }}
            style={{ marginTop: '12px' }}
          >
            Cancel
          </button>
        </div>
      );
    }

    // Review step
    if (reportStep === 'review') {
      return (
        <div>
          {renderStyleSelector()}
          <StepIndicator current="review" />
          <div style={{
            padding: '20px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            marginBottom: '16px',
          }}>
            <div style={{ display: 'flex', gap: '20px' }}>
              <div style={{ flex: 1 }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  marginBottom: '6px',
                }}>
                  Refined Prompt (editable)
                </label>
                <textarea
                  value={currentPrompt}
                  onChange={(e) => setCurrentPrompt(e.target.value)}
                  rows={10}
                  style={{
                    width: '100%',
                    resize: 'vertical',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px',
                    color: 'var(--text-primary)',
                    fontSize: '0.875rem',
                    lineHeight: '1.6',
                  }}
                />
              </div>
              {promptHistory.length > 1 && (
                <div style={{ width: '180px', flexShrink: 0 }}>
                  <label style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '10px',
                  }}>
                    Versions
                  </label>
                  {promptHistory.map((version, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleRevert(idx)}
                      style={{
                        display: 'block',
                        width: '100%',
                        marginBottom: '6px',
                        padding: '8px 10px',
                        textAlign: 'left',
                        fontSize: '0.78rem',
                        background: currentPrompt === version.prompt ? 'var(--bg-hover)' : 'var(--bg-tertiary)',
                        border: currentPrompt === version.prompt ? '1px solid var(--accent-blue)' : '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        transition: 'border-color 0.15s',
                      }}
                    >
                      <div style={{ fontWeight: 500 }}>v{idx + 1}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        ${version.cost.toFixed(4)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {totalRefinementCost > 0 && `Refinement cost: $${totalRefinementCost.toFixed(4)}`}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setReportStep('input')}>
                Back
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => handleRefine(currentPrompt)}>
                Refine Again
              </button>
              <button type="button" className="btn btn-primary" onClick={handleUsePrompt}>
                Use This Prompt
              </button>
            </div>
          </div>
          {refineError && (
            <div className="error-message" style={{ marginTop: '12px' }}>{refineError}</div>
          )}
        </div>
      );
    }

    // Configure step
    if (reportStep === 'configure') {
      return (
        <div>
          {renderStyleSelector()}
          <StepIndicator current="configure" />
          <div style={{
            marginBottom: '20px',
            padding: '16px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '10px',
            }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
                Final Prompt
              </label>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setReportStep(promptHistory.length > 0 ? 'review' : 'input')}
                style={{ fontSize: '0.75rem' }}
              >
                Edit
              </button>
            </div>
            <div
              style={{
                padding: '12px',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.85rem',
                whiteSpace: 'pre-wrap',
                maxHeight: '200px',
                overflow: 'auto',
                lineHeight: '1.6',
                color: 'var(--text-primary)',
              }}
            >
              {currentPrompt}
            </div>
          </div>
          <CommonFields
            model={model}
            setModel={setModel}
            budget={budget}
            setBudget={setBudget}
            scheduleMode={scheduleMode}
            setScheduleMode={setScheduleMode}
            slots={slots}
            setSlots={setSlots}
            onRunNow={() => handleSubmitReport(true)}
            onSchedule={() => handleSubmitReport(false)}
            loading={loading}
          />
        </div>
      );
    }

    // Input step (default for report)
    return (
      <div>
        {renderStyleSelector()}
        <StepIndicator current="input" />
        {renderPromptTextarea(
          'What do you want from this report?',
          "Describe your report idea in rough terms... e.g. 'summarize the latest AI research papers on autonomous agents'",
          5,
        )}
        <div style={{
          padding: '16px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          marginBottom: '16px',
        }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            AI can refine your rough idea into a detailed, structured prompt — or you can use it as-is.
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Refine Model
              </label>
              <select
                value={refineModel}
                onChange={(e) => setRefineModel(e.target.value as ClaudeModel)}
                style={{ width: '200px' }}
              >
                <option value="haiku">Haiku (Fast)</option>
                <option value="sonnet">Sonnet (Balanced)</option>
                <option value="opus">Opus (Best)</option>
              </select>
            </div>
          </div>
        </div>
        {refineError && (
          <div className="error-message" style={{ marginBottom: '12px' }}>{refineError}</div>
        )}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => handleRefine(rawPrompt)}
            disabled={!rawPrompt.trim()}
          >
            Refine with AI
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleUseAsIs}
            disabled={!rawPrompt.trim()}
          >
            Use As-Is
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // Research form
  // ============================================================

  if (style === 'research') {
    return (
      <div>
        {renderStyleSelector()}
        {renderPromptTextarea('What do you want to research?', 'Describe your research topic...', 3)}

        {/* Research Parameters */}
        <div style={{
          padding: '16px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          marginBottom: '16px',
        }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '12px', color: 'var(--text-primary)' }}>
            Research Parameters
          </div>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Planner Model
              </label>
              <select
                value={plannerModel}
                onChange={(e) => setPlannerModel(e.target.value as ClaudeModel)}
                style={{ width: '100%' }}
              >
                <option value="haiku">Haiku (Fast)</option>
                <option value="sonnet">Sonnet (Balanced)</option>
                <option value="opus">Opus (Best)</option>
              </select>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Plans steps, revises, synthesizes
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Executor Model
              </label>
              <select
                value={executorModel}
                onChange={(e) => setExecutorModel(e.target.value as ClaudeModel)}
                style={{ width: '100%' }}
              >
                <option value="haiku">Haiku (Fast)</option>
                <option value="sonnet">Sonnet (Balanced)</option>
                <option value="opus">Opus (Best)</option>
              </select>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Executes each research step
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Max Steps
              </label>
              <select
                value={maxSteps}
                onChange={(e) => setMaxSteps(Number(e.target.value))}
                style={{ width: '100%' }}
              >
                {[3, 5, 7, 10, 15].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Revisions / Step
              </label>
              <select
                value={maxRevisions}
                onChange={(e) => setMaxRevisions(Number(e.target.value))}
                style={{ width: '100%' }}
              >
                {[0, 1, 2, 3].map((n) => (
                  <option key={n} value={n}>{n === 0 ? 'None' : n}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <CommonFields
          model={model}
          setModel={setModel}
          budget={budget}
          setBudget={setBudget}
          scheduleMode={scheduleMode}
          setScheduleMode={setScheduleMode}
          slots={slots}
          setSlots={setSlots}
          onRunNow={() => handleSubmitResearch(true)}
          onSchedule={() => handleSubmitResearch(false)}
          loading={loading}
        />
      </div>
    );
  }

  // ============================================================
  // Topic Tracker form
  // ============================================================

  const presetDef = TOPIC_PRESETS[preset];
  const currentTtTaskId = activeTaskId ?? ttSubmittedTaskId;

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
      {renderStyleSelector()}

      {/* Topic input */}
      {renderPromptTextarea('Topic', 'What do you want to track?', 2)}

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
                checked={ttScheduleMode === mode}
                onChange={() => setTtScheduleMode(mode)}
              />
              {mode === 'once' ? 'Run Once' : mode === 'weekly' ? 'Weekly' : 'Interval'}
            </label>
          ))}
        </div>

        {ttScheduleMode === 'weekly' && (
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

        {ttScheduleMode === 'interval' && (
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

      {/* Global Controls */}
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
        <button type="button" className="btn btn-primary" onClick={() => handleSubmitTopicTracker(true)} disabled={loading || !rawPrompt.trim()}>
          {loading ? 'Creating...' : 'Run Now'}
        </button>
        {ttScheduleMode !== 'once' && (
          <button type="button" className="btn btn-secondary" onClick={() => handleSubmitTopicTracker(false)} disabled={loading || !rawPrompt.trim()}>
            {loading ? 'Scheduling...' : 'Start Tracking'}
          </button>
        )}
      </div>

      {/* LiveLog */}
      {currentTtTaskId && (
        <LiveLog
          taskId={currentTtTaskId}
          onDone={() => setTtSubmittedTaskId(null)}
        />
      )}
    </div>
  );
}

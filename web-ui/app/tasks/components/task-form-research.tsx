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
} from '../../lib/api';

interface TaskFormResearchProps {
  onSubmit: (input: CreateTaskInput) => Promise<{ taskId: string } | void>;
  loading: boolean;
}

type Step = 'input' | 'running' | 'done';

export default function TaskFormResearch({ onSubmit, loading }: TaskFormResearchProps) {
  const [step, setStep] = useState<Step>('input');

  // Input
  const [topic, setTopic] = useState('');
  const [plannerModel, setPlannerModel] = useState<ClaudeModel>('sonnet');
  const [executorModel, setExecutorModel] = useState<ClaudeModel>('haiku');
  const [maxSteps, setMaxSteps] = useState(5);
  const [maxRevisions, setMaxRevisions] = useState(1);

  // Common fields
  const [model, setModel] = useState<ClaudeModel>('sonnet');
  const [budget, setBudget] = useState('2.00');
  const [scheduleMode, setScheduleMode] = useState<'once' | 'scheduled'>('once');
  const [slots, setSlots] = useState<ScheduleSlot[]>([{ timeOfDay: '09:00', daysOfWeek: [1, 2, 3, 4, 5] }]);

  // Running
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [taskOutput, setTaskOutput] = useState<string | null>(null);

  const buildSchedule = (): ScheduleConfig | undefined => {
    if (scheduleMode === 'once') return undefined;
    return { type: 'scheduled', slots };
  };

  const handleSubmit = async (runNow: boolean) => {
    if (!topic.trim()) return;

    const input: CreateTaskInput = {
      serviceType: 'research',
      params: {
        serviceType: 'research',
        topic: topic.trim(),
        plannerModel,
        executorModel,
        maxSteps,
        maxRevisionsPerStep: maxRevisions,
      },
      model, // fallback model
      budget: parseFloat(budget) || 2.0,
      runNow,
      schedule: buildSchedule(),
    };

    try {
      const task = await onSubmit(input) as unknown as { taskId?: string };
      if (runNow && task && typeof task === 'object' && 'taskId' in task) {
        setRunningTaskId((task as { taskId: string }).taskId);
        setStep('running');
      }
    } catch {
      // onSubmit handles errors
    }
  };

  const handleTaskDone = (event: TaskStreamEvent | RefineStreamEvent) => {
    if ('output' in event && event.output) {
      setTaskOutput(event.output);
    }
    setStep('done');
  };

  // Step: running
  if (step === 'running' && runningTaskId) {
    return (
      <div>
        <div style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '12px' }}>
          Researching: {topic}
        </div>
        <LiveLog taskId={runningTaskId} onDone={handleTaskDone} />
      </div>
    );
  }

  // Step: done
  if (step === 'done') {
    return (
      <div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}>
          <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--accent-green)' }}>
            Research complete
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
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setStep('input');
                setRunningTaskId(null);
                setTaskOutput(null);
                setTopic('');
              }}
            >
              New Research
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

  // Step: input
  return (
    <div>
      {/* Topic */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
          What do you want to research?
        </label>
        <textarea
          placeholder="Describe your research topic..."
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={3}
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

        {/* Dual model pickers */}
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

        {/* Steps and revisions */}
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

      {/* Budget / Schedule */}
      <CommonFields
        model={model}
        setModel={setModel}
        budget={budget}
        setBudget={setBudget}
        scheduleMode={scheduleMode}
        setScheduleMode={setScheduleMode}
        slots={slots}
        setSlots={setSlots}
        onRunNow={() => handleSubmit(true)}
        onSchedule={() => handleSubmit(false)}
        loading={loading}
      />
    </div>
  );
}

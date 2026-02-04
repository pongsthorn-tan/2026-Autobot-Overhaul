'use client';

import { useState, useEffect, useRef } from 'react';
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
  startRefinePrompt,
  streamRefinePrompt,
} from '../../lib/api';

interface TaskFormReportProps {
  onSubmit: (input: CreateTaskInput) => Promise<{ taskId: string } | void>;
  loading: boolean;
}

type Step = 'input' | 'refining' | 'review' | 'configure' | 'running' | 'done';

interface PromptVersion {
  prompt: string;
  cost: number;
}

// ---------- Step Indicator ----------

const STEP_LABELS: { key: Step; label: string }[] = [
  { key: 'input', label: 'Describe' },
  { key: 'review', label: 'Review' },
  { key: 'configure', label: 'Configure' },
];

function StepIndicator({ current }: { current: Step }) {
  const activeIndex = current === 'refining'
    ? 0
    : current === 'running' || current === 'done'
      ? 3
      : STEP_LABELS.findIndex((s) => s.key === current);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0',
      marginBottom: '24px',
      padding: '0 4px',
    }}>
      {STEP_LABELS.map((s, i) => {
        const isActive = i === activeIndex;
        const isDone = i < activeIndex;
        const color = isActive ? 'var(--accent-blue)' : isDone ? 'var(--accent-green)' : 'var(--text-muted)';

        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: i < STEP_LABELS.length - 1 ? 1 : 'none' }}>
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
            {i < STEP_LABELS.length - 1 && (
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

// ---------- Report Form ----------

export default function TaskFormReport({ onSubmit, loading }: TaskFormReportProps) {
  const [step, setStep] = useState<Step>('input');

  // Input step
  const [rawPrompt, setRawPrompt] = useState('');
  const [refineModel, setRefineModel] = useState<ClaudeModel>('sonnet');

  // Review step
  const [promptHistory, setPromptHistory] = useState<PromptVersion[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [totalRefinementCost, setTotalRefinementCost] = useState(0);
  const [refineError, setRefineError] = useState<string | null>(null);

  // Refining step — SSE
  const [refineJobId, setRefineJobId] = useState<string | null>(null);
  const [refineChunks, setRefineChunks] = useState('');

  // Running step
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [taskOutput, setTaskOutput] = useState<string | null>(null);

  // Configure step
  const [model, setModel] = useState<ClaudeModel>('sonnet');
  const [budget, setBudget] = useState('1.00');
  const [scheduleMode, setScheduleMode] = useState<'once' | 'scheduled'>('once');
  const [slots, setSlots] = useState<ScheduleSlot[]>([{ timeOfDay: '09:00', daysOfWeek: [1, 2, 3, 4, 5] }]);

  const buildSchedule = (): ScheduleConfig | undefined => {
    if (scheduleMode === 'once') return undefined;
    return { type: 'scheduled', slots };
  };

  const handleRefine = async (prompt: string) => {
    setRefineError(null);
    setRefineChunks('');

    try {
      const result = await startRefinePrompt(prompt, refineModel);
      if (!result.jobId) throw new Error('No jobId returned');

      setRefineJobId(result.jobId);
      setStep('refining');
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
      setStep('review');
    } else if (event.type === 'error') {
      setRefineError(event.error || 'Refinement failed');
      setRefineJobId(null);
      setStep(promptHistory.length > 0 ? 'review' : 'input');
    }
  };

  const handleUseAsIs = () => {
    setCurrentPrompt(rawPrompt.trim());
    setStep('configure');
  };

  const handleRevert = (index: number) => {
    setCurrentPrompt(promptHistory[index].prompt);
  };

  const handleUsePrompt = () => {
    setStep('configure');
  };

  const handleSubmit = async (runNow: boolean) => {
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

  // Step: input
  if (step === 'input') {
    return (
      <div>
        <StepIndicator current="input" />

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
            What do you want from this report?
          </label>
          <textarea
            placeholder="Describe your report idea in rough terms... e.g. 'summarize the latest AI research papers on autonomous agents'"
            value={rawPrompt}
            onChange={(e) => setRawPrompt(e.target.value)}
            rows={5}
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

  // Step: refining — SSE streaming
  if (step === 'refining' && refineJobId) {
    return (
      <div>
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
            setStep(promptHistory.length > 0 ? 'review' : 'input');
          }}
          style={{ marginTop: '12px' }}
        >
          Cancel
        </button>
      </div>
    );
  }

  // Step: review
  if (step === 'review') {
    return (
      <div>
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
            <button type="button" className="btn btn-secondary" onClick={() => setStep('input')}>
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

  // Step: running — live log
  if (step === 'running' && runningTaskId) {
    return (
      <div>
        <div style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '12px' }}>
          Generating report...
        </div>
        <LiveLog taskId={runningTaskId} onDone={handleTaskDone} />
      </div>
    );
  }

  // Step: done — show rendered report
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
            Report complete
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
                setRawPrompt('');
                setCurrentPrompt('');
                setPromptHistory([]);
              }}
            >
              New Report
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

  // Step: configure
  return (
    <div>
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
            onClick={() => setStep(promptHistory.length > 0 ? 'review' : 'input')}
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
        onRunNow={() => handleSubmit(true)}
        onSchedule={() => handleSubmit(false)}
        loading={loading}
      />
    </div>
  );
}

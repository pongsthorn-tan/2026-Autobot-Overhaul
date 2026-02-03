'use client';

import { useState } from 'react';
import CommonFields from './common-fields';
import {
  type ClaudeModel,
  type CreateTaskInput,
  type ScheduleSlot,
  type ScheduleConfig,
  refinePrompt,
} from '../../lib/api';

interface TaskFormReportProps {
  onSubmit: (input: CreateTaskInput) => Promise<void>;
  loading: boolean;
}

type Step = 'input' | 'refining' | 'review' | 'configure';

interface PromptVersion {
  prompt: string;
  cost: number;
}

export default function TaskFormReport({ onSubmit, loading }: TaskFormReportProps) {
  // Step state
  const [step, setStep] = useState<Step>('input');

  // Input step
  const [rawPrompt, setRawPrompt] = useState('');
  const [refineModel, setRefineModel] = useState<ClaudeModel>('sonnet');

  // Review step
  const [promptHistory, setPromptHistory] = useState<PromptVersion[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [totalRefinementCost, setTotalRefinementCost] = useState(0);
  const [refineError, setRefineError] = useState<string | null>(null);

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
    setStep('refining');
    setRefineError(null);
    try {
      const result = await refinePrompt(prompt, refineModel);
      const version: PromptVersion = {
        prompt: result.refinedPrompt,
        cost: result.cost,
      };
      setPromptHistory((prev) => [...prev, version]);
      setCurrentPrompt(result.refinedPrompt);
      setTotalRefinementCost((prev) => prev + result.cost);
      setStep('review');
    } catch (err) {
      setRefineError(err instanceof Error ? err.message : 'Refinement failed');
      setStep(promptHistory.length > 0 ? 'review' : 'input');
    }
  };

  const handleRevert = (index: number) => {
    setCurrentPrompt(promptHistory[index].prompt);
  };

  const handleUsePrompt = () => {
    setStep('configure');
  };

  const handleSubmit = (runNow: boolean) => {
    if (!currentPrompt.trim()) return;
    onSubmit({
      serviceType: 'report',
      params: { serviceType: 'report', prompt: currentPrompt.trim() },
      model,
      budget: parseFloat(budget) || 1.0,
      runNow,
      schedule: buildSchedule(),
    });
  };

  // Step: input
  if (step === 'input') {
    return (
      <div>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            What do you want from this report?
          </label>
          <textarea
            placeholder="Describe your report idea in rough terms..."
            value={rawPrompt}
            onChange={(e) => setRawPrompt(e.target.value)}
            rows={4}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Refinement Model
            </label>
            <select value={refineModel} onChange={(e) => setRefineModel(e.target.value as ClaudeModel)} style={{ width: '200px' }}>
              <option value="haiku">Haiku (Fast, Low Cost)</option>
              <option value="sonnet">Sonnet (Balanced)</option>
              <option value="opus">Opus (Most Capable)</option>
            </select>
          </div>
        </div>
        {refineError && (
          <div className="error-message" style={{ marginBottom: '12px' }}>{refineError}</div>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => handleRefine(rawPrompt)}
          disabled={!rawPrompt.trim()}
        >
          Refine Prompt
        </button>
      </div>
    );
  }

  // Step: refining
  if (step === 'refining') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '24px 0' }}>
        <div className="loading">Refining prompt...</div>
      </div>
    );
  }

  // Step: review
  if (step === 'review') {
    return (
      <div>
        <div style={{ display: 'flex', gap: '16px' }}>
          {/* Main area */}
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Refined Prompt (editable)
            </label>
            <textarea
              value={currentPrompt}
              onChange={(e) => setCurrentPrompt(e.target.value)}
              rows={8}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>

          {/* Version history sidebar */}
          {promptHistory.length > 1 && (
            <div style={{ width: '200px', flexShrink: 0 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Version History
              </label>
              {promptHistory.map((version, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleRevert(idx)}
                  className="btn btn-secondary btn-sm"
                  style={{
                    display: 'block',
                    width: '100%',
                    marginBottom: '4px',
                    textAlign: 'left',
                    fontSize: '0.75rem',
                  }}
                >
                  v{idx + 1} — ${version.cost.toFixed(4)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Total refinement cost: ${totalRefinementCost.toFixed(4)}
        </div>

        {refineError && (
          <div className="error-message" style={{ marginTop: '8px' }}>{refineError}</div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <button type="button" className="btn btn-secondary" onClick={() => handleRefine(currentPrompt)}>
            Refine Again
          </button>
          <button type="button" className="btn btn-primary" onClick={handleUsePrompt}>
            Use This Prompt
          </button>
        </div>
      </div>
    );
  }

  // Step: configure
  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
          Final Prompt
        </label>
        <div
          style={{
            padding: '12px',
            background: 'var(--bg-secondary)',
            borderRadius: '6px',
            fontSize: '0.85rem',
            whiteSpace: 'pre-wrap',
            maxHeight: '200px',
            overflow: 'auto',
          }}
        >
          {currentPrompt}
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setStep('review')}
          style={{ marginTop: '8px', fontSize: '0.75rem' }}
        >
          &larr; Edit Prompt
        </button>
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

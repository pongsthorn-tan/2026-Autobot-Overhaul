'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import CommonFields from './common-fields';
import {
  type ClaudeModel,
  type CreateTaskInput,
  type ScheduleSlot,
  type ScheduleConfig,
  type RefineProvider,
  type OpenAIModel,
  startRefinePrompt,
  pollRefinePrompt,
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

// ---------- Simon Says Mini-Game ----------

const SIMON_COLORS = [
  { name: 'green', idle: '#1a4a2e', active: '#22c55e', light: '#4ade80' },
  { name: 'red', idle: '#4a1a1a', active: '#ef4444', light: '#f87171' },
  { name: 'yellow', idle: '#4a4a1a', active: '#eab308', light: '#facc15' },
  { name: 'blue', idle: '#1a2a4a', active: '#3b82f6', light: '#60a5fa' },
];

type SimonPhase = 'watching' | 'playing' | 'gameover';

function SimonSaysGame() {
  const [sequence, setSequence] = useState<number[]>([]);
  const [playerIndex, setPlayerIndex] = useState(0);
  const [phase, setPhase] = useState<SimonPhase>('watching');
  const [activeColor, setActiveColor] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const playSequence = useCallback((seq: number[]) => {
    setPhase('watching');
    let i = 0;
    const playNext = () => {
      if (i < seq.length) {
        setActiveColor(seq[i]);
        timeoutRef.current = setTimeout(() => {
          setActiveColor(null);
          i++;
          timeoutRef.current = setTimeout(playNext, 250);
        }, 500);
      } else {
        setPhase('playing');
        setPlayerIndex(0);
      }
    };
    timeoutRef.current = setTimeout(playNext, 400);
  }, []);

  const startNewGame = useCallback(() => {
    clearTimer();
    const first = Math.floor(Math.random() * 4);
    const newSeq = [first];
    setSequence(newSeq);
    setScore(0);
    setPlayerIndex(0);
    playSequence(newSeq);
  }, [clearTimer, playSequence]);

  useEffect(() => {
    startNewGame();
    return clearTimer;
  }, [startNewGame, clearTimer]);

  const handlePress = (colorIndex: number) => {
    if (phase !== 'playing') return;

    setActiveColor(colorIndex);
    setTimeout(() => setActiveColor(null), 200);

    if (colorIndex !== sequence[playerIndex]) {
      setPhase('gameover');
      setHighScore((prev) => Math.max(prev, score));
      return;
    }

    const nextIndex = playerIndex + 1;
    if (nextIndex >= sequence.length) {
      const newScore = score + 1;
      setScore(newScore);
      const next = Math.floor(Math.random() * 4);
      const newSeq = [...sequence, next];
      setSequence(newSeq);
      setPhase('watching');
      timeoutRef.current = setTimeout(() => playSequence(newSeq), 600);
    } else {
      setPlayerIndex(nextIndex);
    }
  };

  const SIZE = 120;
  const GAP = 4;
  const HALF = (SIZE - GAP) / 2;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${HALF}px ${HALF}px`,
          gap: `${GAP}px`,
          width: SIZE,
          height: SIZE,
        }}
      >
        {SIMON_COLORS.map((c, i) => (
          <button
            key={c.name}
            type="button"
            onClick={() => handlePress(i)}
            disabled={phase !== 'playing'}
            style={{
              width: HALF,
              height: HALF,
              borderRadius: '8px',
              border: 'none',
              cursor: phase === 'playing' ? 'pointer' : 'default',
              background: activeColor === i ? c.active : c.idle,
              boxShadow: activeColor === i ? `0 0 12px ${c.light}` : 'none',
              transition: 'background 0.1s, box-shadow 0.1s',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: SIZE, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        <span>Score: {score}</span>
        <span>Best: {highScore}</span>
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
        {phase === 'watching' && 'Watch the pattern...'}
        {phase === 'playing' && 'Your turn! Repeat the pattern'}
        {phase === 'gameover' && (
          <span>
            Wrong!{' '}
            <button
              type="button"
              onClick={startNewGame}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-blue)',
                cursor: 'pointer',
                textDecoration: 'underline',
                fontSize: '0.7rem',
                padding: 0,
              }}
            >
              Play again
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

// ---------- Report Form ----------

export default function TaskFormReport({ onSubmit, loading }: TaskFormReportProps) {
  // Step state
  const [step, setStep] = useState<Step>('input');

  // Input step
  const [rawPrompt, setRawPrompt] = useState('');
  const [refineProvider, setRefineProvider] = useState<RefineProvider>('openai');
  const [refineModel, setRefineModel] = useState<ClaudeModel>('sonnet');
  const [openaiModel, setOpenaiModel] = useState<OpenAIModel>('gpt-5-mini');

  // Review step
  const [promptHistory, setPromptHistory] = useState<PromptVersion[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [totalRefinementCost, setTotalRefinementCost] = useState(0);
  const [refineError, setRefineError] = useState<string | null>(null);

  // Refining step
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Configure step
  const [model, setModel] = useState<ClaudeModel>('sonnet');
  const [budget, setBudget] = useState('1.00');
  const [scheduleMode, setScheduleMode] = useState<'once' | 'scheduled'>('once');
  const [slots, setSlots] = useState<ScheduleSlot[]>([{ timeOfDay: '09:00', daysOfWeek: [1, 2, 3, 4, 5] }]);

  const buildSchedule = (): ScheduleConfig | undefined => {
    if (scheduleMode === 'once') return undefined;
    return { type: 'scheduled', slots };
  };

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleRefine = async (prompt: string) => {
    setRefineError(null);

    const provider = refineProvider;
    const selectedModel = provider === 'openai' ? openaiModel : refineModel;

    try {
      const result = await startRefinePrompt(prompt, provider, selectedModel);

      // OpenAI: instant response — skip straight to review
      if (result.provider === 'openai' && result.refinedPrompt) {
        const version: PromptVersion = {
          prompt: result.refinedPrompt,
          cost: result.cost ?? 0,
        };
        setPromptHistory((prev) => [...prev, version]);
        setCurrentPrompt(result.refinedPrompt);
        setTotalRefinementCost((prev) => prev + (result.cost ?? 0));
        setStep('review');
        return;
      }

      // Claude: async job — start polling + Snake game
      if (!result.jobId) throw new Error('No jobId returned from Claude provider');

      setStep('refining');
      setElapsedSeconds(0);

      timerRef.current = setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1000);

      const jobId = result.jobId;

      pollRef.current = setInterval(async () => {
        try {
          const pollResult = await pollRefinePrompt(jobId);

          if (pollResult.status === 'completed') {
            if (pollRef.current) clearInterval(pollRef.current);
            if (timerRef.current) clearInterval(timerRef.current);
            pollRef.current = null;
            timerRef.current = null;

            const version: PromptVersion = {
              prompt: pollResult.refinedPrompt || '',
              cost: pollResult.cost || 0,
            };
            setPromptHistory((prev) => [...prev, version]);
            setCurrentPrompt(pollResult.refinedPrompt || '');
            setTotalRefinementCost((prev) => prev + (pollResult.cost || 0));
            setStep('review');
          } else if (pollResult.status === 'errored') {
            if (pollRef.current) clearInterval(pollRef.current);
            if (timerRef.current) clearInterval(timerRef.current);
            pollRef.current = null;
            timerRef.current = null;

            setRefineError(pollResult.error || 'Refinement failed');
            setStep(promptHistory.length > 0 ? 'review' : 'input');
          }
        } catch {
          // Poll network error — keep trying
        }
      }, 2000);
    } catch (err) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setRefineError(err instanceof Error ? err.message : 'Failed to start refinement');
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
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '16px', flexWrap: 'wrap' }}>
          {/* Provider toggle */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Provider
            </label>
            <div style={{ display: 'inline-flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
              <button
                type="button"
                onClick={() => setRefineProvider('openai')}
                style={{
                  padding: '6px 14px',
                  fontSize: '0.8rem',
                  border: 'none',
                  cursor: 'pointer',
                  background: refineProvider === 'openai' ? 'var(--accent-blue)' : 'var(--bg-secondary)',
                  color: refineProvider === 'openai' ? '#fff' : 'var(--text-secondary)',
                  fontWeight: refineProvider === 'openai' ? 600 : 400,
                }}
              >
                Faster (OpenAI)
              </button>
              <button
                type="button"
                onClick={() => setRefineProvider('claude')}
                style={{
                  padding: '6px 14px',
                  fontSize: '0.8rem',
                  border: 'none',
                  borderLeft: '1px solid var(--border-color)',
                  cursor: 'pointer',
                  background: refineProvider === 'claude' ? 'var(--accent-blue)' : 'var(--bg-secondary)',
                  color: refineProvider === 'claude' ? '#fff' : 'var(--text-secondary)',
                  fontWeight: refineProvider === 'claude' ? 600 : 400,
                }}
              >
                Wait (Claude)
              </button>
            </div>
          </div>

          {/* Model picker — changes based on provider */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Model
            </label>
            {refineProvider === 'openai' ? (
              <select value={openaiModel} onChange={(e) => setOpenaiModel(e.target.value as OpenAIModel)} style={{ width: '220px' }}>
                <option value="gpt-5-mini">GPT-5 Mini (Fastest)</option>
                <option value="gpt-5">GPT-5 (Balanced)</option>
                <option value="gpt-5-pro">GPT-5 Pro (Best)</option>
              </select>
            ) : (
              <select value={refineModel} onChange={(e) => setRefineModel(e.target.value as ClaudeModel)} style={{ width: '220px' }}>
                <option value="haiku">Haiku (Fast, Low Cost)</option>
                <option value="sonnet">Sonnet (Balanced)</option>
                <option value="opus">Opus (Most Capable)</option>
              </select>
            )}
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

  // Step: refining — async polling with mini-game + process detail
  if (step === 'refining') {
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    // Phase detail based on elapsed time
    const isWarning = elapsedSeconds >= 120;
    const phaseLabel =
      elapsedSeconds < 5 ? 'Spawning Claude CLI...' :
      elapsedSeconds < 15 ? 'Claude is reading your prompt...' :
      elapsedSeconds < 60 ? 'Claude is refining...' :
      elapsedSeconds < 120 ? 'Still working, almost there...' :
      'Taking longer than expected — something may be wrong';

    // Progress steps
    const steps = [
      { label: 'Start job', done: elapsedSeconds >= 1 },
      { label: 'Spawn Claude', done: elapsedSeconds >= 5 },
      { label: 'Refine prompt', done: false },
      { label: 'Calculate cost', done: false },
    ];

    return (
      <div style={{ padding: '16px 0' }}>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
          {/* Left: status detail */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '4px' }}>
              Refining your prompt...
            </div>
            <div style={{ fontSize: '0.85rem', color: isWarning ? 'var(--accent-yellow)' : 'var(--text-secondary)', marginBottom: '12px' }}>
              {phaseLabel}
            </div>

            {/* Process steps */}
            <div style={{ marginBottom: '16px' }}>
              {steps.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontSize: '0.8rem' }}>
                  <span style={{ width: '16px', textAlign: 'center', color: s.done ? 'var(--accent-green, #22c55e)' : 'var(--text-secondary)' }}>
                    {s.done ? '\u2713' : '\u00B7'}
                  </span>
                  <span style={{ color: s.done ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Timer */}
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Elapsed: {timeStr}
            </div>

            {/* Progress bar */}
            <div
              style={{
                width: '100%',
                maxWidth: '240px',
                height: '3px',
                background: 'var(--bg-tertiary)',
                borderRadius: '2px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  background: isWarning ? 'var(--accent-yellow, #eab308)' : 'var(--accent-blue)',
                  borderRadius: '2px',
                  animation: 'pulse-bar 2s ease-in-out infinite',
                }}
              />
            </div>

            {/* Warning message */}
            {isWarning && (
              <div style={{
                marginTop: '12px',
                padding: '8px 12px',
                background: 'rgba(234, 179, 8, 0.1)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                borderRadius: '6px',
                fontSize: '0.78rem',
                color: 'var(--accent-yellow, #eab308)',
              }}>
                This is taking unusually long. The Claude CLI process or cost
                calculation may be stuck. You can wait or go back and try the
                Faster (OpenAI) provider instead.
                <div style={{ marginTop: '6px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      if (pollRef.current) clearInterval(pollRef.current);
                      if (timerRef.current) clearInterval(timerRef.current);
                      pollRef.current = null;
                      timerRef.current = null;
                      setRefineError('Cancelled — refinement was taking too long');
                      setStep(promptHistory.length > 0 ? 'review' : 'input');
                    }}
                    style={{ fontSize: '0.75rem' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right: mini-game */}
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '6px' }}>
              Play while you wait
            </div>
            <SimonSaysGame />
          </div>
        </div>

        <style>{`
          @keyframes pulse-bar {
            0%, 100% { width: 20%; margin-left: 0; }
            50% { width: 60%; margin-left: 20%; }
          }
        `}</style>
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

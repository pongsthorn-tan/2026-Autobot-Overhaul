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

// ---------- Snake Mini-Game ----------

type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
interface Pos { x: number; y: number; }

const GRID = 20;
const CELL = 14;
const TICK = 120;

function SnakeGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dirRef = useRef<Direction>('RIGHT');
  const snakeRef = useRef<Pos[]>([{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }]);
  const foodRef = useRef<Pos>({ x: 15, y: 10 });
  const scoreRef = useRef(0);
  const gameOverRef = useRef(false);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  const spawnFood = useCallback(() => {
    const snake = snakeRef.current;
    let pos: Pos;
    do {
      pos = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
    } while (snake.some((s) => s.x === pos.x && s.y === pos.y));
    foodRef.current = pos;
  }, []);

  const resetGame = useCallback(() => {
    snakeRef.current = [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }];
    dirRef.current = 'RIGHT';
    scoreRef.current = 0;
    gameOverRef.current = false;
    setScore(0);
    setGameOver(false);
    spawnFood();
  }, [spawnFood]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const dir = dirRef.current;
      if ((e.key === 'ArrowUp' || e.key === 'w') && dir !== 'DOWN') dirRef.current = 'UP';
      if ((e.key === 'ArrowDown' || e.key === 's') && dir !== 'UP') dirRef.current = 'DOWN';
      if ((e.key === 'ArrowLeft' || e.key === 'a') && dir !== 'RIGHT') dirRef.current = 'LEFT';
      if ((e.key === 'ArrowRight' || e.key === 'd') && dir !== 'LEFT') dirRef.current = 'RIGHT';
      if (e.key === ' ' && gameOverRef.current) resetGame();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [resetGame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const interval = setInterval(() => {
      if (gameOverRef.current) return;

      const snake = snakeRef.current;
      const head = { ...snake[0] };
      const dir = dirRef.current;

      if (dir === 'UP') head.y--;
      if (dir === 'DOWN') head.y++;
      if (dir === 'LEFT') head.x--;
      if (dir === 'RIGHT') head.x++;

      // Wall or self collision
      if (
        head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID ||
        snake.some((s) => s.x === head.x && s.y === head.y)
      ) {
        gameOverRef.current = true;
        setGameOver(true);
        return;
      }

      snake.unshift(head);

      // Eat food
      const food = foodRef.current;
      if (head.x === food.x && head.y === food.y) {
        scoreRef.current++;
        setScore(scoreRef.current);
        spawnFood();
      } else {
        snake.pop();
      }

      // Draw
      ctx.fillStyle = '#0f1117';
      ctx.fillRect(0, 0, GRID * CELL, GRID * CELL);

      // Grid lines
      ctx.strokeStyle = '#1a1d27';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= GRID; i++) {
        ctx.beginPath();
        ctx.moveTo(i * CELL, 0);
        ctx.lineTo(i * CELL, GRID * CELL);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * CELL);
        ctx.lineTo(GRID * CELL, i * CELL);
        ctx.stroke();
      }

      // Food
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL / 2 - 1, 0, Math.PI * 2);
      ctx.fill();

      // Snake
      snake.forEach((seg, i) => {
        ctx.fillStyle = i === 0 ? '#3b82f6' : '#22c55e';
        ctx.fillRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2);
      });
    }, TICK);

    return () => clearInterval(interval);
  }, [spawnFood]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <canvas
        ref={canvasRef}
        width={GRID * CELL}
        height={GRID * CELL}
        style={{ borderRadius: '8px', border: '1px solid var(--border-color)' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', width: GRID * CELL, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <span>Score: {score}</span>
        <span>WASD or Arrow Keys</span>
      </div>
      {gameOver && (
        <div style={{ fontSize: '0.85rem', color: 'var(--accent-yellow)' }}>
          Game Over! Press Space to restart
        </div>
      )}
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

  // Step: refining — async polling with mini-game
  if (step === 'refining') {
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    return (
      <div style={{ padding: '16px 0' }}>
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '4px' }}>
            Refining your prompt...
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Claude is thinking ({timeStr}) — play a game while you wait!
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <SnakeGame />
        </div>

        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-block',
              width: '200px',
              height: '3px',
              background: 'var(--bg-tertiary)',
              borderRadius: '2px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                background: 'var(--accent-blue)',
                borderRadius: '2px',
                animation: 'pulse-bar 2s ease-in-out infinite',
              }}
            />
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

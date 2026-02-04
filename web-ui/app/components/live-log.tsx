'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { streamTask, streamRefinePrompt, type TaskStreamEvent, type RefineStreamEvent } from '../lib/api';

interface LiveLogProps {
  taskId?: string;
  refineJobId?: string;
  onDone?: (event: TaskStreamEvent | RefineStreamEvent) => void;
}

interface StepInfo {
  index: number;
  label: string;
  status: string;
}

export default function LiveLog({ taskId, refineJobId, onDone }: LiveLogProps) {
  const [promptSent, setPromptSent] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [chunks, setChunks] = useState('');
  const [steps, setSteps] = useState<StepInfo[]>([]);
  const [cost, setCost] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Auto-scroll
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [chunks, steps]);

  const handleTaskEvent = useCallback((event: TaskStreamEvent) => {
    switch (event.type) {
      case 'prompt':
        setPromptSent(event.prompt ?? null);
        setModel(event.model ?? null);
        break;
      case 'chunk':
        setChunks((prev) => prev + (event.text ?? ''));
        break;
      case 'step':
        if (event.step) {
          setSteps((prev) => {
            const existing = prev.findIndex((s) => s.index === event.step!.index && s.label === event.step!.label);
            if (existing !== -1) {
              const updated = [...prev];
              updated[existing] = event.step!;
              return updated;
            }
            return [...prev, event.step!];
          });
        }
        break;
      case 'cost':
        setCost(event.cost ?? null);
        break;
      case 'done':
        setDone(true);
        if (onDoneRef.current) onDoneRef.current(event);
        break;
      case 'error':
        setError(event.error ?? 'Unknown error');
        setDone(true);
        if (onDoneRef.current) onDoneRef.current(event);
        break;
    }
  }, []);

  const handleRefineEvent = useCallback((event: RefineStreamEvent) => {
    switch (event.type) {
      case 'chunk':
        setChunks((prev) => prev + (event.text ?? ''));
        break;
      case 'done':
        setDone(true);
        if (onDoneRef.current) onDoneRef.current(event);
        break;
      case 'error':
        setError(event.error ?? 'Unknown error');
        setDone(true);
        if (onDoneRef.current) onDoneRef.current(event);
        break;
    }
  }, []);

  useEffect(() => {
    if (taskId) {
      return streamTask(taskId, handleTaskEvent);
    }
    if (refineJobId) {
      return streamRefinePrompt(refineJobId, handleRefineEvent);
    }
  }, [taskId, refineJobId, handleTaskEvent, handleRefineEvent]);

  if (!taskId && !refineJobId) return null;

  return (
    <div style={{
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      background: 'var(--bg-secondary)',
    }}>
      {/* Step progress */}
      {steps.length > 0 && (
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-tertiary)',
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Steps
          </div>
          {steps.map((s, i) => (
            <div key={`${s.index}-${s.label}-${i}`} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '4px',
              fontSize: '0.82rem',
            }}>
              <span style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.65rem',
                background: s.status === 'completed'
                  ? 'rgba(34, 197, 94, 0.15)'
                  : s.status === 'running'
                    ? 'rgba(59, 130, 246, 0.15)'
                    : 'var(--bg-tertiary)',
                color: s.status === 'completed'
                  ? 'var(--accent-green)'
                  : s.status === 'running'
                    ? 'var(--accent-blue, #3b82f6)'
                    : 'var(--text-muted)',
              }}>
                {s.status === 'completed' ? '\u2713' : s.status === 'running' ? '\u25CF' : '\u00B7'}
              </span>
              <span style={{
                color: s.status === 'completed' ? 'var(--text-primary)' : s.status === 'running' ? 'var(--accent-blue, #3b82f6)' : 'var(--text-muted)',
                fontWeight: s.status === 'running' ? 500 : 400,
              }}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Prompt sent (collapsible) */}
      {promptSent && (
        <div style={{ borderBottom: '1px solid var(--border-color)' }}>
          <button
            type="button"
            onClick={() => setShowPrompt(!showPrompt)}
            style={{
              width: '100%',
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.78rem',
              textAlign: 'left',
            }}
          >
            <span style={{
              fontSize: '0.7rem',
              transition: 'transform 0.15s',
              transform: showPrompt ? 'rotate(90deg)' : 'rotate(0)',
            }}>{'\u25B6'}</span>
            Prompt sent{model ? ` (${model})` : ''}
          </button>
          {showPrompt && (
            <div style={{
              padding: '0 16px 12px',
              fontFamily: "'SF Mono', 'Fira Code', monospace",
              fontSize: '0.75rem',
              lineHeight: '1.7',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: 'var(--text-primary)',
              maxHeight: '200px',
              overflow: 'auto',
            }}>
              {promptSent}
            </div>
          )}
        </div>
      )}

      {/* AI Response stream */}
      <div style={{ padding: '12px 16px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {done ? (error ? 'Error' : 'Complete') : 'AI Response'}
          </div>
          {cost !== null && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Cost: ${cost.toFixed(4)}
            </div>
          )}
        </div>
        <div
          ref={outputRef}
          style={{
            padding: '12px',
            background: 'var(--bg-primary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            fontFamily: "'SF Mono', 'Fira Code', monospace",
            fontSize: '0.8rem',
            lineHeight: '1.6',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: '400px',
            overflow: 'auto',
            color: error ? 'var(--accent-red)' : 'var(--text-primary)',
            minHeight: '80px',
          }}
        >
          {error ? error : chunks || (done ? '(no output)' : '')}
          {!done && !error && (
            <span style={{
              display: 'inline-block',
              width: '7px',
              height: '14px',
              background: 'var(--accent-blue, #3b82f6)',
              marginLeft: '2px',
              animation: 'blink-cursor 1s step-end infinite',
              verticalAlign: 'text-bottom',
            }} />
          )}
        </div>
      </div>

      <style>{`
        @keyframes blink-cursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch, type RunRecord } from '../../../lib/api';

export default function ExecutionHistoryPage() {
  const params = useParams();
  const serviceId = params.id as string;

  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    try {
      const data = await apiFetch<RunRecord[]>(`/api/services/${serviceId}/runs`);
      setRuns(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch runs');
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed':
        return 'var(--accent-green)';
      case 'running':
        return 'var(--accent-blue, #3b82f6)';
      case 'errored':
        return 'var(--accent-red)';
      default:
        return 'var(--text-secondary)';
    }
  };

  const getStatusBadgeClass = (status: string): string => {
    switch (status) {
      case 'completed':
        return 'badge badge-active';
      case 'running':
        return 'badge badge-active';
      case 'errored':
        return 'badge badge-errored';
      default:
        return 'badge badge-stopped';
    }
  };

  const toggleExpand = (runId: string) => {
    setExpandedRun((prev) => (prev === runId ? null : runId));
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading">Loading execution history...</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div style={{ marginBottom: '8px' }}>
        <a href={`/services/${serviceId}`} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          &larr; Back to {serviceId}
        </a>
      </div>

      <h1 className="page-title">Execution History: {serviceId}</h1>

      {error && <div className="error-message">{error}</div>}

      {runs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          No execution runs recorded yet. Start the service to create a run.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {runs.map((run) => (
            <div key={run.runId} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Run Header - Clickable */}
              <div
                onClick={() => toggleExpand(run.runId)}
                style={{
                  padding: '16px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: expandedRun === run.runId ? '1px solid var(--border)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontWeight: 600, fontSize: '1rem' }}>
                    Cycle #{run.cycleNumber}
                  </span>
                  <span className={getStatusBadgeClass(run.status)}>
                    {run.status}
                  </span>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: 'var(--bg-secondary)',
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                  }}>
                    {run.model}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <span>{run.tasks.length} task{run.tasks.length !== 1 ? 's' : ''}</span>
                  <span>{run.totalTokens.toLocaleString()} tokens</span>
                  <span>${run.totalCost.toFixed(4)}</span>
                  <span>{new Date(run.startedAt).toLocaleString()}</span>
                  <span style={{ fontSize: '1rem' }}>{expandedRun === run.runId ? '\u25B2' : '\u25BC'}</span>
                </div>
              </div>

              {/* Expanded Task Details */}
              {expandedRun === run.runId && (
                <div style={{ padding: '16px', background: 'var(--bg-secondary)' }}>
                  {run.completedAt && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                      Duration: {run.completedAt
                        ? `${((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000).toFixed(1)}s`
                        : 'In progress'}
                    </div>
                  )}

                  {run.tasks.length === 0 ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      No tasks recorded for this run.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {run.tasks.map((task, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '12px',
                            borderRadius: '6px',
                            background: 'var(--bg-primary, #1a1a2e)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>
                              {task.label}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              Iteration {task.iteration}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                            <span>{task.tokensUsed.toLocaleString()} tokens</span>
                            <span>${task.costEstimate.toFixed(4)}</span>
                            <span>{new Date(task.completedAt).toLocaleTimeString()}</span>
                          </div>
                          {task.output && (
                            <details>
                              <summary style={{
                                fontSize: '0.75rem',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                marginBottom: '4px',
                              }}>
                                Output ({task.output.length} chars)
                              </summary>
                              <pre style={{
                                fontSize: '0.75rem',
                                padding: '8px',
                                borderRadius: '4px',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border)',
                                overflow: 'auto',
                                maxHeight: '300px',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                              }}>
                                {task.output.length > 2000 ? task.output.slice(0, 2000) + '\n\n... (truncated)' : task.output}
                              </pre>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

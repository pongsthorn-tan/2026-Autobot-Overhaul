'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch, type CostSummary, type TaskCost } from '../../lib/api';
import { formatDate } from '../../lib/format-date';

export default function ServiceCostPage() {
  const params = useParams();
  const serviceId = params.serviceId as string;

  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [tasks, setTasks] = useState<TaskCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [summaryData, tasksData] = await Promise.all([
        apiFetch<CostSummary>(`/api/costs/${serviceId}`).catch(() => null),
        apiFetch<TaskCost[]>(`/api/costs/${serviceId}/tasks`).catch(() => []),
      ]);
      setSummary(summaryData);
      setTasks(tasksData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch cost data');
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading">Loading cost data...</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div style={{ marginBottom: '8px' }}>
        <a href="/costs" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          &larr; Back to Costs
        </a>
      </div>
      <h1 className="page-title">
        Cost Report: {summary?.serviceName || serviceId}
      </h1>

      {error && <div className="error-message">{error}</div>}

      {/* Summary Cards */}
      {summary && (
        <div className="section">
          <div className="grid-3">
            <div className="card">
              <div className="stat-label">Total Cost</div>
              <div className="stat-value">${summary.totalCost.toFixed(4)}</div>
            </div>
            <div className="card">
              <div className="stat-label">Total Tokens</div>
              <div className="stat-value">{summary.totalTokens.toLocaleString()}</div>
            </div>
            <div className="card">
              <div className="stat-label">Tasks / Iterations</div>
              <div className="stat-value">
                {summary.taskCount} / {summary.iterationCount}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Per-Task Table */}
      <div className="section">
        <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '16px' }}>
          Per-Task Breakdown
        </h2>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {tasks.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No task data available
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Task</th>
                    <th style={{ textAlign: 'right' }}>Iterations</th>
                    <th style={{ textAlign: 'right' }}>Tokens</th>
                    <th style={{ textAlign: 'right' }}>Cost</th>
                    <th style={{ textAlign: 'right' }}>Cost / Iteration</th>
                    <th style={{ textAlign: 'right' }}>Last Run</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr key={task.taskId}>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {task.taskName || task.taskId}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {task.taskId}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>{task.iterations}</td>
                      <td style={{ textAlign: 'right' }}>{task.tokens.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        ${task.cost.toFixed(4)}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                        ${task.iterations > 0 ? (task.cost / task.iterations).toFixed(4) : '0.0000'}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontSize: '0.8rem',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {task.lastRun ? formatDate(task.lastRun) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

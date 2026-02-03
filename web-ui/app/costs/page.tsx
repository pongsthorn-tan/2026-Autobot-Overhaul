'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch, type CostSummary } from '../lib/api';

export default function CostsPage() {
  const [costs, setCosts] = useState<CostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCosts = useCallback(async () => {
    try {
      const data = await apiFetch<CostSummary[]>('/api/costs');
      setCosts(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch costs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCosts();
    const interval = setInterval(fetchCosts, 15000);
    return () => clearInterval(interval);
  }, [fetchCosts]);

  const totalCost = costs.reduce((sum, c) => sum + (c.totalCost || 0), 0);
  const totalTokens = costs.reduce((sum, c) => sum + (c.totalTokens || 0), 0);
  const totalTasks = costs.reduce((sum, c) => sum + (c.taskCount || 0), 0);

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading">Loading cost data...</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Cost Overview</h1>

      {error && <div className="error-message">{error}</div>}

      {/* Summary Stats */}
      <div className="section">
        <div className="grid-3">
          <div className="card">
            <div className="stat-label">Total Cost</div>
            <div className="stat-value">${totalCost.toFixed(4)}</div>
          </div>
          <div className="card">
            <div className="stat-label">Total Tokens</div>
            <div className="stat-value">{totalTokens.toLocaleString()}</div>
          </div>
          <div className="card">
            <div className="stat-label">Total Tasks</div>
            <div className="stat-value">{totalTasks}</div>
          </div>
        </div>
      </div>

      {/* Per-Service Table */}
      <div className="section">
        <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '16px' }}>
          Cost by Service
        </h2>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {costs.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No cost data available
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Service</th>
                    <th style={{ textAlign: 'right' }}>Tasks</th>
                    <th style={{ textAlign: 'right' }}>Iterations</th>
                    <th style={{ textAlign: 'right' }}>Tokens</th>
                    <th style={{ textAlign: 'right' }}>Cost</th>
                    <th style={{ textAlign: 'right' }}>% of Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {costs.map((cost) => (
                    <tr key={cost.serviceId}>
                      <td>
                        <span style={{ fontWeight: 600 }}>
                          {cost.serviceName || cost.serviceId}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>{cost.taskCount}</td>
                      <td style={{ textAlign: 'right' }}>{cost.iterationCount}</td>
                      <td style={{ textAlign: 'right' }}>{cost.totalTokens.toLocaleString()}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        ${cost.totalCost.toFixed(4)}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {totalCost > 0
                          ? ((cost.totalCost / totalCost) * 100).toFixed(1)
                          : '0.0'}
                        %
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <a href={`/costs/${cost.serviceId}`} className="btn btn-secondary btn-sm">
                          Details
                        </a>
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

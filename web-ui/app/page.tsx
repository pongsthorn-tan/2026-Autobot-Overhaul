'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch, type Service, type Budget, type LogEntry } from './lib/api';

export default function DashboardPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [servicesData, budgetsData, logsData] = await Promise.all([
        apiFetch<Service[]>('/api/services').catch(() => []),
        apiFetch<Budget[]>('/api/budgets').catch(() => []),
        apiFetch<LogEntry[]>('/api/logs').catch(() => []),
      ]);
      setServices(servicesData);
      setBudgets(budgetsData);
      setLogs(logsData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const totalAllocated = budgets.reduce((sum, b) => sum + (b.allocated || 0), 0);
  const totalSpent = budgets.reduce((sum, b) => sum + (b.spent || 0), 0);
  const totalRemaining = budgets.reduce((sum, b) => sum + (b.remaining || 0), 0);

  const getBudgetForService = (serviceId: string): Budget | undefined => {
    return budgets.find((b) => b.serviceId === serviceId);
  };

  const getStatusBadgeClass = (status: string): string => {
    switch (status) {
      case 'active':
      case 'running':
        return 'badge badge-active';
      case 'paused':
        return 'badge badge-paused';
      case 'stopped':
        return 'badge badge-stopped';
      case 'errored':
        return 'badge badge-errored';
      default:
        return 'badge badge-stopped';
    }
  };

  const getBudgetBarColor = (budget: Budget): string => {
    const usage = budget.allocated > 0 ? budget.spent / budget.allocated : 0;
    if (usage > 0.9) return 'var(--accent-red)';
    if (usage > 0.7) return 'var(--accent-yellow)';
    return 'var(--accent-green)';
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Dashboard</h1>

      {error && <div className="error-message">{error}</div>}

      {/* Budget Overview */}
      <div className="section">
        <div className="grid-3">
          <div className="card">
            <div className="stat-label">Total Allocated</div>
            <div className="stat-value">${totalAllocated.toFixed(2)}</div>
          </div>
          <div className="card">
            <div className="stat-label">Total Spent</div>
            <div className="stat-value" style={{ color: 'var(--accent-yellow)' }}>
              ${totalSpent.toFixed(2)}
            </div>
          </div>
          <div className="card">
            <div className="stat-label">Remaining</div>
            <div className="stat-value" style={{ color: 'var(--accent-green)' }}>
              ${totalRemaining.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Service Status Grid */}
      <div className="section">
        <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '16px' }}>
          Services
        </h2>
        {services.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
            No services registered
          </div>
        ) : (
          <div className="grid-2">
            {services.map((service) => {
              const budget = getBudgetForService(service.id);
              return (
                <a
                  key={service.id}
                  href={`/services/${service.id}`}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div className="card">
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '12px',
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: '1rem' }}>
                        {service.name || service.id}
                      </span>
                      <span className={getStatusBadgeClass(service.status)}>
                        {service.status}
                      </span>
                    </div>

                    {budget && (
                      <>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '0.8rem',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <span>Budget remaining</span>
                          <span>${budget.remaining.toFixed(2)} / ${budget.allocated.toFixed(2)}</span>
                        </div>
                        <div className="budget-bar-container">
                          <div
                            className="budget-bar"
                            style={{
                              width: `${budget.allocated > 0 ? Math.min((budget.spent / budget.allocated) * 100, 100) : 0}%`,
                              background: getBudgetBarColor(budget),
                            }}
                          />
                        </div>
                      </>
                    )}

                    {service.nextRun && (
                      <div
                        style={{
                          marginTop: '10px',
                          fontSize: '0.75rem',
                          color: 'var(--text-muted)',
                        }}
                      >
                        Next run: {new Date(service.nextRun).toLocaleString()}
                      </div>
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Activity Feed */}
      <div className="section">
        <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '16px' }}>
          Recent Activity
        </h2>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {logs.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No recent activity
            </div>
          ) : (
            logs.slice(0, 20).map((log, idx) => (
              <div key={idx} className="log-entry">
                <span className="log-timestamp">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className="log-service">{log.service}</span>
                <span className={`log-level-${log.level}`} style={{ marginRight: '8px' }}>
                  [{log.level}]
                </span>
                <span>{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

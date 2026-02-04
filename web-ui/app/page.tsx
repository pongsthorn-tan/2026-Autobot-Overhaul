'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch, type Service, type Budget, type StandaloneTask } from './lib/api';
import { formatDateShort } from './lib/format-date';
import LiveLog from './components/live-log';
import ReportRenderer, { parseReport } from './components/report-renderer';

export default function DashboardPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [tasks, setTasks] = useState<StandaloneTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPreview, setExpandedPreview] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [servicesData, budgetsData, tasksData] = await Promise.all([
        apiFetch<Service[]>('/api/services').catch(() => []),
        apiFetch<Budget[]>('/api/budgets').catch(() => []),
        apiFetch<StandaloneTask[]>('/api/tasks').catch(() => []),
      ]);
      setServices(servicesData);
      setBudgets(budgetsData);
      setTasks(tasksData);
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
  const budgetPercent = totalAllocated > 0 ? Math.round((totalRemaining / totalAllocated) * 100) : 100;

  const runningTasks = tasks.filter((t) => t.status === 'running');
  const scheduledCount = services.filter((s) => s.schedule && s.status !== 'stopped').length;
  const todaySpent = tasks
    .filter((t) => t.completedAt && new Date(t.completedAt).toDateString() === new Date().toDateString())
    .reduce((sum, t) => sum + t.costSpent, 0);

  const recentCompleted = tasks
    .filter((t) => t.status === 'completed' || t.status === 'errored')
    .sort((a, b) => new Date(b.completedAt ?? b.createdAt).getTime() - new Date(a.completedAt ?? a.createdAt).getTime())
    .slice(0, 5);

  const getStatusBadgeClass = (status: string): string => {
    switch (status) {
      case 'active': case 'running': return 'badge badge-active';
      case 'idle': return 'badge badge-idle';
      case 'paused': return 'badge badge-paused';
      case 'stopped': return 'badge badge-stopped';
      case 'errored': return 'badge badge-errored';
      default: return 'badge badge-stopped';
    }
  };

  const getBudgetForService = (serviceId: string): Budget | undefined =>
    budgets.find((b) => b.serviceId === serviceId);

  const getTaskSummary = (task: StandaloneTask): string => {
    const p = task.params as Record<string, unknown>;
    switch (task.serviceType) {
      case 'report': return String(p.prompt ?? '').slice(0, 60) || 'Report';
      case 'research': return String(p.topic ?? '').slice(0, 60) || 'Research';
      case 'code-task': return String(p.description ?? '').slice(0, 60) || 'Code task';
      default: return task.serviceType;
    }
  };

  const timeAgo = (date: string): string => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
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
      {error && <div className="error-message" style={{ marginBottom: '16px' }}>{error}</div>}

      {/* System Status Bar */}
      <div style={{
        padding: '12px 16px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
        marginBottom: '20px',
        fontSize: '0.85rem',
        color: 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <span style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: runningTasks.length > 0 ? 'var(--accent-green)' : 'var(--text-muted)',
          flexShrink: 0,
        }} />
        {scheduledCount} service{scheduledCount !== 1 ? 's' : ''} scheduled
        {' \u00B7 '}
        {runningTasks.length} task{runningTasks.length !== 1 ? 's' : ''} running
        {' \u00B7 '}
        ${todaySpent.toFixed(2)} today
      </div>

      {/* Live Activity */}
      <div className="section">
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '12px' }}>Live Activity</h2>
        {runningTasks.length > 0 ? (
          <div>
            {runningTasks.map((task) => (
              <div key={task.taskId} style={{ marginBottom: '12px' }}>
                <div style={{
                  fontSize: '0.82rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  <span className="badge badge-active">running</span>
                  <span>{task.serviceType}: {getTaskSummary(task)}</span>
                </div>
                <LiveLog taskId={task.taskId} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            padding: '24px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '0.85rem',
          }}>
            No active tasks. Start one from the quick actions below.
          </div>
        )}
      </div>

      {/* Quick Actions + Budget Health */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        {/* Quick Actions */}
        <div style={{
          padding: '16px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
            Quick Actions
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <a href="/tasks?service=report" className="btn btn-primary" style={{ textDecoration: 'none', textAlign: 'center' }}>
              + New Report
            </a>
            <a href="/tasks?service=research" className="btn btn-primary" style={{ textDecoration: 'none', textAlign: 'center' }}>
              + New Research
            </a>
            <a href="/tasks" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center' }}>
              View All Tasks
            </a>
          </div>
        </div>

        {/* Budget Health */}
        <div style={{
          padding: '16px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
            Budget Health
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Allocated</span>
              <span style={{ fontWeight: 600 }}>${totalAllocated.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Spent</span>
              <span style={{ fontWeight: 600, color: 'var(--accent-yellow)' }}>${totalSpent.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Remaining</span>
              <span style={{ fontWeight: 600, color: 'var(--accent-green)' }}>${totalRemaining.toFixed(2)} [{budgetPercent}%]</span>
            </div>
          </div>
          <div style={{
            marginTop: '12px',
            height: '6px',
            background: 'var(--bg-tertiary)',
            borderRadius: '3px',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${totalAllocated > 0 ? Math.min((totalSpent / totalAllocated) * 100, 100) : 0}%`,
              background: totalAllocated > 0 && totalSpent / totalAllocated > 0.9
                ? 'var(--accent-red)'
                : totalAllocated > 0 && totalSpent / totalAllocated > 0.7
                  ? 'var(--accent-yellow)'
                  : 'var(--accent-green)',
              borderRadius: '3px',
              transition: 'width 0.3s',
            }} />
          </div>
        </div>
      </div>

      {/* Recent Results */}
      {recentCompleted.length > 0 && (
        <div className="section">
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '12px' }}>Recent Results</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {recentCompleted.map((task) => {
              const isExpanded = expandedPreview === task.taskId;
              const isReport = task.serviceType === 'report' || task.serviceType === 'research';
              const hasStructuredOutput = task.output && parseReport(task.output) !== null;

              return (
                <div key={task.taskId}>
                  <div style={{
                    padding: '10px 14px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: isExpanded ? 'var(--radius-md) var(--radius-md) 0 0' : 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}>
                    <span style={{
                      color: task.status === 'completed' ? 'var(--accent-green)' : 'var(--accent-red)',
                      fontSize: '0.9rem',
                    }}>
                      {task.status === 'completed' ? '\u2713' : '\u2717'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {task.serviceType}: {getTaskSummary(task)}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {timeAgo(task.completedAt ?? task.createdAt)} &middot; ${task.costSpent.toFixed(2)}
                        {task.error && <span style={{ color: 'var(--accent-red)', marginLeft: '6px' }}>errored</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      {task.output && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setExpandedPreview(isExpanded ? null : task.taskId)}
                          style={{ fontSize: '0.75rem' }}
                        >
                          {isExpanded ? 'Hide' : 'Preview'}
                        </button>
                      )}
                      {isReport && task.output && (
                        <a
                          href={`/tasks/${task.taskId}`}
                          className="btn btn-primary btn-sm"
                          style={{ fontSize: '0.75rem', textDecoration: 'none' }}
                        >
                          View Report
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Preview panel */}
                  {isExpanded && task.output && (
                    <div style={{
                      padding: '16px',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                      borderTop: 'none',
                      borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                      maxHeight: '300px',
                      overflow: 'auto',
                    }}>
                      {hasStructuredOutput ? (
                        <ReportRenderer output={task.output} />
                      ) : (
                        <pre style={{
                          fontSize: '0.82rem',
                          lineHeight: 1.5,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          margin: 0,
                          color: 'var(--text-primary)',
                        }}>
                          {task.output.slice(0, 2000)}
                          {task.output.length > 2000 && '...'}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Services */}
      <div className="section">
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '12px' }}>Services</h2>
        {services.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No services registered</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {services.map((service) => {
              const budget = getBudgetForService(service.id);
              const budgetUsed = budget && budget.allocated > 0
                ? Math.min((budget.spent / budget.allocated) * 100, 100)
                : 0;
              const budgetColor = budgetUsed > 90
                ? 'var(--accent-red)'
                : budgetUsed > 70
                  ? 'var(--accent-yellow)'
                  : 'var(--accent-green)';

              return (
                <a
                  key={service.id}
                  href={`/services/${service.id}`}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div style={{
                    padding: '12px 14px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', minWidth: '100px' }}>
                      {service.name || service.id}
                    </span>
                    <span className={getStatusBadgeClass(service.status)}>
                      {service.status}
                    </span>
                    <div style={{ flex: 1, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {service.nextRun
                        ? `Next: ${formatDateShort(service.nextRun)}`
                        : 'Not scheduled'}
                    </div>
                    {budget && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          ${budget.spent.toFixed(2)}/{budget.allocated.toFixed(0)}
                        </span>
                        <div style={{
                          width: '60px',
                          height: '4px',
                          background: 'var(--bg-tertiary)',
                          borderRadius: '2px',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${budgetUsed}%`,
                            background: budgetColor,
                            borderRadius: '2px',
                          }} />
                        </div>
                      </div>
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

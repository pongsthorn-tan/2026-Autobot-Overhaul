'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  apiFetch,
  apiPost,
  apiPut,
  type Service,
  type Budget,
  type LogEntry,
  type ClaudeModel,
  type ServiceModelConfig,
  type NextRunsResponse,
} from '../../lib/api';

interface ScheduledServiceInfo {
  maxCycles?: number;
  cyclesCompleted: number;
}

export default function ServiceDetailPage() {
  const params = useParams();
  const serviceId = params.id as string;

  const [service, setService] = useState<Service | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Model selection
  const [model, setModel] = useState<ClaudeModel>('sonnet');

  // Budget form
  const [budgetAmount, setBudgetAmount] = useState('');

  // Schedule form
  const [scheduleType, setScheduleType] = useState('cron');
  const [scheduleExpression, setScheduleExpression] = useState('');
  const [scheduleInterval, setScheduleInterval] = useState('');
  const [scheduleTimeOfDay, setScheduleTimeOfDay] = useState('');
  const [scheduleDays, setScheduleDays] = useState<string[]>([]);
  const [maxCycles, setMaxCycles] = useState('');
  const [cyclesCompleted, setCyclesCompleted] = useState(0);
  const [nextRuns, setNextRuns] = useState<string[]>([]);


  const fetchNextRuns = useCallback(async () => {
    try {
      const data = await apiFetch<NextRunsResponse>(`/api/services/${serviceId}/next-runs?count=10`);
      setNextRuns(data.nextRuns ?? []);
    } catch {
      setNextRuns([]);
    }
  }, [serviceId]);

  const fetchData = useCallback(async () => {
    try {
      const [serviceData, budgetData, logsData, configData] = await Promise.all([
        apiFetch<Service>(`/api/services/${serviceId}`).catch(() => null),
        apiFetch<Budget>(`/api/budgets/${serviceId}`).catch(() => null),
        apiFetch<LogEntry[]>(`/api/logs/${serviceId}`).catch(() => []),
        apiFetch<ServiceModelConfig>(`/api/services/${serviceId}/config`).catch(() => null),
      ]);
      setService(serviceData);
      setBudget(budgetData);
      setLogs(logsData);
      if (configData) {
        setModel(configData.model);
      }
      await fetchNextRuns();

      if (serviceData?.schedule) {
        setScheduleType(serviceData.schedule.type || 'cron');
        setScheduleExpression(serviceData.schedule.expression || '');
        setScheduleInterval(serviceData.schedule.interval?.toString() || '');
        setScheduleTimeOfDay(serviceData.schedule.timeOfDay || '');
        setScheduleDays(serviceData.schedule.daysOfWeek || []);
      }

      // Fetch scheduled service info for cycle data
      try {
        const stateData = await apiFetch<{ services: ScheduledServiceInfo[] }>('/api/state');
        const scheduledInfo = stateData.services.find(
          (s: ScheduledServiceInfo & { serviceId?: string }) => (s as { serviceId: string }).serviceId === serviceId
        );
        if (scheduledInfo) {
          setMaxCycles(scheduledInfo.maxCycles?.toString() || '');
          setCyclesCompleted(scheduledInfo.cyclesCompleted ?? 0);
        }
      } catch {
        // ignore
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch service data');
    } finally {
      setLoading(false);
    }
  }, [serviceId, fetchNextRuns]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleAction = async (action: string) => {
    setActionLoading(action);
    setError(null);
    try {
      await apiPost(`/api/services/${serviceId}/${action}`);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} service`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleModelChange = async (newModel: ClaudeModel) => {
    setModel(newModel);
    setActionLoading('model');
    setError(null);
    try {
      await apiPut(`/api/services/${serviceId}/config`, { model: newModel });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update model');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(budgetAmount);
    if (isNaN(amount) || amount <= 0) return;

    setActionLoading('add-budget');
    setError(null);
    try {
      await apiPost(`/api/budgets/${serviceId}/add`, { amount });
      setBudgetAmount('');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add budget');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading('schedule');
    setError(null);

    const schedulePayload: Record<string, unknown> = { type: scheduleType };
    if (scheduleType === 'cron' && scheduleExpression) {
      schedulePayload.expression = scheduleExpression;
    }
    if (scheduleType === 'cycle' && scheduleInterval) {
      schedulePayload.interval = parseInt(scheduleInterval, 10);
    }
    if (scheduleType === 'time-of-day' && scheduleTimeOfDay) {
      schedulePayload.timeOfDay = scheduleTimeOfDay;
    }
    if (scheduleDays.length > 0) {
      schedulePayload.daysOfWeek = scheduleDays;
    }
    if (maxCycles.trim()) {
      schedulePayload.maxCycles = parseInt(maxCycles, 10);
    }

    try {
      await apiPut(`/api/services/${serviceId}/schedule`, schedulePayload);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update schedule');
    } finally {
      setActionLoading(null);
    }
  };

  const toggleDay = (day: string) => {
    setScheduleDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
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

  const allDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading">Loading service details...</div>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="page-container">
        <div className="error-message">Service not found: {serviceId}</div>
        <a href="/">&larr; Back to Dashboard</a>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div style={{ marginBottom: '8px' }}>
        <a href="/" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          &larr; Back to Dashboard
        </a>
      </div>

      {/* Service Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          {service.name || service.id}
        </h1>
        <span className={getStatusBadgeClass(service.status)}>{service.status}</span>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Controls */}
      <div className="section">
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '12px' }}>Controls</h2>
        <div className="card">
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              className="btn btn-success"
              onClick={() => handleAction('start')}
              disabled={
                actionLoading !== null ||
                service.status === 'running' ||
                service.status === 'active'
              }
            >
              {actionLoading === 'start' ? 'Starting...' : 'Start'}
            </button>
            <button
              className="btn btn-danger"
              onClick={() => handleAction('stop')}
              disabled={actionLoading !== null || service.status === 'stopped'}
            >
              {actionLoading === 'stop' ? 'Stopping...' : 'Stop'}
            </button>
            <button
              className="btn btn-warning"
              onClick={() => handleAction('pause')}
              disabled={
                actionLoading !== null ||
                service.status === 'paused' ||
                service.status === 'stopped'
              }
            >
              {actionLoading === 'pause' ? 'Pausing...' : 'Pause'}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => handleAction('resume')}
              disabled={actionLoading !== null || service.status !== 'paused'}
            >
              {actionLoading === 'resume' ? 'Resuming...' : 'Resume'}
            </button>
          </div>

          {service.lastRun && (
            <div style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Last run: {new Date(service.lastRun).toLocaleString()}
            </div>
          )}
          {service.nextRun && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Next run: {new Date(service.nextRun).toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {/* Model Selection */}
      <div className="section">
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '12px' }}>Model</h2>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Claude Model
            </label>
            <select
              value={model}
              onChange={(e) => handleModelChange(e.target.value as ClaudeModel)}
              disabled={actionLoading === 'model'}
              style={{ width: '200px' }}
            >
              <option value="haiku">Haiku (Fast, Low Cost)</option>
              <option value="sonnet">Sonnet (Balanced)</option>
              <option value="opus">Opus (Most Capable)</option>
            </select>
            {actionLoading === 'model' && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Saving...</span>
            )}
          </div>
        </div>
      </div>

      {/* Tasks Link */}
      <div className="section">
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '12px' }}>Tasks</h2>
        <div className="card">
          <a href={`/tasks?service=${serviceId}`} className="btn btn-primary btn-sm">
            Go to Tasks tab to create tasks for this service
          </a>
        </div>
      </div>

      {/* Execution History Link */}
      <div className="section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Execution History</h2>
          <a href={`/services/${serviceId}/runs`} className="btn btn-secondary btn-sm">
            View All Runs
          </a>
        </div>
      </div>

      {/* Budget Management */}
      <div className="section">
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '12px' }}>Budget</h2>
        <div className="card">
          {budget ? (
            <>
              <div className="grid-3" style={{ marginBottom: '16px' }}>
                <div>
                  <div className="stat-label">Allocated</div>
                  <div className="stat-value" style={{ fontSize: '1.2rem' }}>
                    ${budget.allocated.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Spent</div>
                  <div
                    className="stat-value"
                    style={{ fontSize: '1.2rem', color: 'var(--accent-yellow)' }}
                  >
                    ${budget.spent.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Remaining</div>
                  <div
                    className="stat-value"
                    style={{ fontSize: '1.2rem', color: 'var(--accent-green)' }}
                  >
                    ${budget.remaining.toFixed(2)}
                  </div>
                </div>
              </div>
              <div className="budget-bar-container" style={{ marginBottom: '16px' }}>
                <div
                  className="budget-bar"
                  style={{
                    width: `${budget.allocated > 0 ? Math.min((budget.spent / budget.allocated) * 100, 100) : 0}%`,
                    background:
                      budget.allocated > 0 && budget.spent / budget.allocated > 0.9
                        ? 'var(--accent-red)'
                        : budget.allocated > 0 && budget.spent / budget.allocated > 0.7
                          ? 'var(--accent-yellow)'
                          : 'var(--accent-green)',
                  }}
                />
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
              No budget allocated yet
            </div>
          )}

          <form
            onSubmit={handleAddBudget}
            style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
          >
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Amount ($)"
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
              style={{ width: '160px' }}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={actionLoading === 'add-budget' || !budgetAmount}
            >
              {actionLoading === 'add-budget' ? 'Adding...' : 'Add Budget'}
            </button>
          </form>
        </div>
      </div>

      {/* Schedule Configuration */}
      <div className="section">
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '12px' }}>Schedule</h2>
        <div className="card">
          <form onSubmit={handleUpdateSchedule}>
            <div style={{ marginBottom: '16px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '4px',
                }}
              >
                Schedule Type
              </label>
              <select
                value={scheduleType}
                onChange={(e) => setScheduleType(e.target.value)}
                style={{ width: '200px' }}
              >
                <option value="cron">Cron Expression</option>
                <option value="cycle">Recurring Cycle (ms)</option>
                <option value="time-of-day">Time of Day</option>
                <option value="day-of-week">Day of Week</option>
              </select>
            </div>

            {scheduleType === 'cron' && (
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    marginBottom: '4px',
                  }}
                >
                  Cron Expression
                </label>
                <input
                  type="text"
                  placeholder="*/5 * * * *"
                  value={scheduleExpression}
                  onChange={(e) => setScheduleExpression(e.target.value)}
                  style={{ width: '300px' }}
                />
              </div>
            )}

            {scheduleType === 'cycle' && (
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    marginBottom: '4px',
                  }}
                >
                  Interval (milliseconds)
                </label>
                <input
                  type="number"
                  min="1000"
                  placeholder="60000"
                  value={scheduleInterval}
                  onChange={(e) => setScheduleInterval(e.target.value)}
                  style={{ width: '200px' }}
                />
              </div>
            )}

            {scheduleType === 'time-of-day' && (
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    marginBottom: '4px',
                  }}
                >
                  Time (HH:MM)
                </label>
                <input
                  type="time"
                  value={scheduleTimeOfDay}
                  onChange={(e) => setScheduleTimeOfDay(e.target.value)}
                  style={{ width: '160px' }}
                />
              </div>
            )}

            {(scheduleType === 'day-of-week' || scheduleType === 'time-of-day') && (
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    marginBottom: '8px',
                  }}
                >
                  Days of Week
                </label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {allDays.map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={scheduleDays.includes(day) ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                    >
                      {day.slice(0, 3).toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Max Cycles */}
            <div style={{ marginBottom: '16px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '4px',
                }}
              >
                Max Cycles (empty = unlimited)
              </label>
              <input
                type="number"
                min="1"
                placeholder="Unlimited"
                value={maxCycles}
                onChange={(e) => setMaxCycles(e.target.value)}
                style={{ width: '160px' }}
              />
              {cyclesCompleted > 0 && (
                <div style={{ marginTop: '4px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Cycles completed: {cyclesCompleted}{maxCycles ? ` / ${maxCycles}` : ''}
                </div>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={actionLoading === 'schedule'}
            >
              {actionLoading === 'schedule' ? 'Updating...' : 'Update Schedule'}
            </button>
          </form>

          {/* Next Execution Times */}
          {nextRuns.length > 0 && (
            <div style={{ marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '8px' }}>
                Next Scheduled Runs
              </h3>
              <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {nextRuns.map((time, idx) => (
                  <li key={idx} style={{ marginBottom: '4px' }}>
                    {new Date(time).toLocaleString()}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>

      {/* Recent Logs */}
      <div className="section">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
          }}
        >
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Recent Logs</h2>
          <a href={`/logs?service=${serviceId}`} className="btn btn-secondary btn-sm">
            View All Logs
          </a>
        </div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {logs.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No logs available
            </div>
          ) : (
            logs.slice(0, 15).map((log, idx) => (
              <div key={idx} className="log-entry">
                <span className="log-timestamp">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={`log-level-${log.level}`} style={{ marginRight: '8px' }}>
                  [{log.level}]
                </span>
                <span>{log.message}</span>
                {log.tokens !== undefined && (
                  <span style={{ marginLeft: '8px', color: 'var(--text-muted)' }}>
                    ({log.tokens} tokens)
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

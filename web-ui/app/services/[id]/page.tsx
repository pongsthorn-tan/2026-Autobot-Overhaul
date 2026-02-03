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
  type ScheduleSlot,
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
  const [scheduleMode, setScheduleMode] = useState<'once' | 'scheduled'>('once');
  const [slots, setSlots] = useState<ScheduleSlot[]>([{ timeOfDay: '09:00', daysOfWeek: [1, 2, 3, 4, 5] }]);
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
        // Convert existing weekly schedule into slot format
        if (serviceData.schedule.type === 'weekly' || serviceData.schedule.type === 'daily') {
          setScheduleMode('scheduled');
          const daysOfWeek = (serviceData.schedule.daysOfWeek || []).map((d) =>
            typeof d === 'string' ? ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(d.toLowerCase()) : Number(d)
          ).filter((d) => d >= 0);
          setSlots([{
            timeOfDay: serviceData.schedule.timeOfDay || '09:00',
            daysOfWeek: daysOfWeek.length > 0 ? daysOfWeek : [1, 2, 3, 4, 5],
          }]);
        } else if (serviceData.schedule.type) {
          setScheduleMode('scheduled');
        }
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

    const schedulePayload: Record<string, unknown> = {};
    if (scheduleMode === 'scheduled') {
      schedulePayload.type = 'scheduled';
      schedulePayload.slots = slots;
    } else {
      // For "once" mode, send a simple weekly schedule that's effectively disabled
      schedulePayload.type = 'once';
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

  const updateSlot = (index: number, update: Partial<ScheduleSlot>) => {
    const updated = slots.map((slot, i) =>
      i === index ? { ...slot, ...update } : slot
    );
    setSlots(updated);
  };

  const toggleSlotDay = (index: number, day: number) => {
    const slot = slots[index];
    const days = slot.daysOfWeek.includes(day)
      ? slot.daysOfWeek.filter((d) => d !== day)
      : [...slot.daysOfWeek, day];
    updateSlot(index, { daysOfWeek: days });
  };

  const addSlot = () => {
    setSlots([...slots, { timeOfDay: '09:00', daysOfWeek: [1, 2, 3, 4, 5] }]);
  };

  const removeSlot = (index: number) => {
    setSlots(slots.filter((_, i) => i !== index));
  };

  const getStatusBadgeClass = (status: string): string => {
    switch (status) {
      case 'active':
      case 'running':
        return 'badge badge-active';
      case 'idle':
        return 'badge badge-idle';
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

  const allDays = [
    { label: 'SUN', value: 0 },
    { label: 'MON', value: 1 },
    { label: 'TUE', value: 2 },
    { label: 'WED', value: 3 },
    { label: 'THU', value: 4 },
    { label: 'FRI', value: 5 },
    { label: 'SAT', value: 6 },
  ];

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
            {/* Schedule mode radio */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
                <input
                  type="radio"
                  name="serviceScheduleMode"
                  checked={scheduleMode === 'once'}
                  onChange={() => setScheduleMode('once')}
                />
                Run Once
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
                <input
                  type="radio"
                  name="serviceScheduleMode"
                  checked={scheduleMode === 'scheduled'}
                  onChange={() => setScheduleMode('scheduled')}
                />
                Run by Schedule
              </label>
            </div>

            {scheduleMode === 'scheduled' && (
              <div style={{ paddingLeft: '8px', borderLeft: '2px solid var(--border)', marginBottom: '16px' }}>
                {slots.map((slot, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '10px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <input
                      type="time"
                      value={slot.timeOfDay}
                      onChange={(e) => updateSlot(index, { timeOfDay: e.target.value })}
                      style={{ width: '120px' }}
                    />
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {allDays.map((day) => (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => toggleSlotDay(index, day.value)}
                          className={slot.daysOfWeek.includes(day.value) ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                          style={{ minWidth: '38px', padding: '2px 6px', fontSize: '0.7rem' }}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                    {slots.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSlot(index)}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '2px 8px', fontSize: '0.75rem', color: 'var(--accent-red)' }}
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addSlot}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.75rem' }}
                >
                  + Add Time Slot
                </button>
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

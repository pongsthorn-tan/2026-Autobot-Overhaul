'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch, type LogEntry, type Service } from '../lib/api';
import { formatDate } from '../lib/format-date';

export default function LogsPage() {
  return (
    <Suspense fallback={<div className="loading">Loading logs...</div>}>
      <LogsContent />
    </Suspense>
  );
}

function LogsContent() {
  const searchParams = useSearchParams();
  const initialService = searchParams.get('service') || '';

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState(initialService);
  const [levelFilter, setLevelFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const path = selectedService
        ? `/api/logs/${selectedService}`
        : '/api/logs';
      const data = await apiFetch<LogEntry[]>(path);
      setLogs(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  }, [selectedService]);

  const fetchServices = useCallback(async () => {
    try {
      const data = await apiFetch<Service[]>('/api/services').catch(() => []);
      setServices(data);
    } catch {
      // Ignore service fetch errors; the filter just won't have names
    }
  }, []);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  useEffect(() => {
    setLoading(true);
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const filteredLogs = logs.filter((log) => {
    if (levelFilter && log.level !== levelFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesMessage = log.message.toLowerCase().includes(query);
      const matchesService = log.service.toLowerCase().includes(query);
      const matchesTaskId = log.taskId?.toLowerCase().includes(query);
      if (!matchesMessage && !matchesService && !matchesTaskId) return false;
    }
    return true;
  });

  const getLevelStyle = (level: string): string => {
    switch (level) {
      case 'info':
        return 'log-level-info';
      case 'warn':
        return 'log-level-warn';
      case 'error':
        return 'log-level-error';
      case 'debug':
        return 'log-level-debug';
      default:
        return '';
    }
  };

  return (
    <div className="page-container">
      <h1 className="page-title">Log Viewer</h1>

      {error && <div className="error-message">{error}</div>}

      {/* Filters */}
      <div
        className="section"
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              marginBottom: '4px',
            }}
          >
            Service
          </label>
          <select
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            style={{ width: '200px' }}
          >
            <option value="">All Services</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || s.id}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              marginBottom: '4px',
            }}
          >
            Level
          </label>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            style={{ width: '140px' }}
          >
            <option value="">All Levels</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              marginBottom: '4px',
            }}
          >
            Search
          </label>
          <input
            type="text"
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ alignSelf: 'flex-end' }}>
          <span
            style={{
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
            }}
          >
            {filteredLogs.length} entries
          </span>
        </div>
      </div>

      {/* Log List */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="loading">Loading logs...</div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No log entries found
          </div>
        ) : (
          <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {filteredLogs.map((log, idx) => (
              <div key={idx} className="log-entry">
                <span className="log-timestamp">
                  {formatDate(log.timestamp)}
                </span>
                <span className="log-service">{log.service}</span>
                <span className={getLevelStyle(log.level)} style={{ marginRight: '8px' }}>
                  [{log.level.toUpperCase()}]
                </span>
                <span>{log.message}</span>
                {log.taskId && (
                  <span style={{ marginLeft: '8px', color: 'var(--text-muted)' }}>
                    task:{log.taskId}
                  </span>
                )}
                {log.iteration !== undefined && (
                  <span style={{ marginLeft: '4px', color: 'var(--text-muted)' }}>
                    iter:{log.iteration}
                  </span>
                )}
                {log.tokens !== undefined && (
                  <span style={{ marginLeft: '4px', color: 'var(--text-muted)' }}>
                    {log.tokens}tok
                  </span>
                )}
                {log.cost !== undefined && (
                  <span style={{ marginLeft: '4px', color: 'var(--text-muted)' }}>
                    ${log.cost.toFixed(4)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

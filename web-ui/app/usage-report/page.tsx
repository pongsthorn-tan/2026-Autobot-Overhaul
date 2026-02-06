'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  fetchUsageReport,
  type UsageReportData,
  type UsageReportModelUsage,
  type UsageReportDailyActivity,
} from '../lib/api';

function fmt(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toString();
}

function fmtMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function pct(part: number, whole: number): string {
  return whole ? ((part / whole) * 100).toFixed(1) : '0';
}

function modelShortName(id: string): string {
  return id
    .replace('claude-', '')
    .replace(/-202\d{5}$/, '')
    .replace(/-\d{8}$/, '');
}

function modelColor(id: string): string {
  if (id.includes('opus-4-6')) return 'var(--accent-purple)';
  if (id.includes('opus')) return '#8b5cf6';
  if (id.includes('sonnet')) return 'var(--accent-green)';
  if (id.includes('haiku')) return 'var(--accent-yellow)';
  return 'var(--text-muted)';
}

export default function UsageReportPage() {
  const [data, setData] = useState<UsageReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const report = await fetchUsageReport();
      setData(report);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch usage report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading">Loading usage report...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page-container">
        <h1 className="page-title">Claude Usage Report</h1>
        <div className="error-message">
          {error || 'No usage data available. Make sure ~/.claude/stats-cache.json exists.'}
        </div>
      </div>
    );
  }

  const maxDailyMsg = Math.max(...data.daily.map((d) => d.messageCount), 1);
  const maxHourCount = Math.max(...Object.values(data.hourCounts), 1);

  return (
    <div className="page-container">
      <div style={{ marginBottom: '24px' }}>
        <h1 className="page-title" style={{ marginBottom: '4px' }}>Claude Usage Report</h1>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {data.firstSessionDate
            ? new Date(data.firstSessionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'N/A'}
          {' — '}
          {data.lastComputedDate || 'N/A'}
          {' | Generated '}
          {new Date(data.generated).toLocaleString()}
        </p>
      </div>

      {/* Hero Stats */}
      <div className="section">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
          <StatCard label="Total Tokens" value={fmt(data.totalTokens)} color="var(--accent-blue)" />
          <StatCard label="Messages" value={data.totalMessages.toLocaleString()} sub={`~${data.avgMessagesPerDay}/day`} color="var(--accent-green)" />
          <StatCard label="Sessions" value={data.totalSessions.toLocaleString()} color="var(--accent-purple)" />
          <StatCard label="Tool Calls" value={data.totalToolCalls.toLocaleString()} color="var(--accent-yellow)" />
          <StatCard label="API Est." value={fmtMoney(data.costEstimate)} sub="if paid per-token" color="var(--accent-orange)" />
        </div>
      </div>

      {/* Token Breakdown + Model Distribution */}
      <div className="section" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '16px' }}>
        {/* Token Breakdown */}
        <div className="card">
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '20px' }}>Token Breakdown</h2>
          <TokenBar label="Input (new)" value={data.totalInput} total={data.totalTokens} color="var(--accent-blue)" />
          <TokenBar label="Output" value={data.totalOutput} total={data.totalTokens} color="var(--accent-green)" />
          <TokenBar label="Cache Read" value={data.totalCacheRead} total={data.totalTokens} color="var(--accent-purple)" />
          <TokenBar label="Cache Creation" value={data.totalCacheCreate} total={data.totalTokens} color="var(--accent-yellow)" />

          <div style={{
            marginTop: '20px', padding: '14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>New tokens (input + output)</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'monospace' }}>{fmt(data.totalInput + data.totalOutput)}</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                <div>Input {fmt(data.totalInput)}</div>
                <div>+ Output {fmt(data.totalOutput)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Model Distribution */}
        <div className="card">
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '20px' }}>Model Distribution</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {data.models.slice(0, 8).map((m) => (
              <ModelBar key={m.id} model={m} totalTokens={data.totalTokens} />
            ))}
          </div>
        </div>
      </div>

      {/* Daily Activity Chart */}
      <div className="section">
        <div className="card">
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '16px' }}>
            Daily Activity
            <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
              (messages per day)
            </span>
          </h2>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '160px', overflowX: 'auto', paddingBottom: '8px' }}>
            {data.daily.map((d, i) => {
              const h = Math.max((d.messageCount / maxDailyMsg) * 100, 1);
              const isTop5 = data.topDays.some((t) => t.date === d.date);
              return (
                <div
                  key={i}
                  title={`${d.date}: ${d.messageCount} msgs, ${d.sessionCount} sessions`}
                  style={{
                    minWidth: '6px',
                    width: '100%',
                    maxWidth: '14px',
                    height: `${h}%`,
                    minHeight: '2px',
                    borderRadius: '2px 2px 0 0',
                    background: isTop5
                      ? 'linear-gradient(to top, var(--accent-yellow), var(--accent-orange))'
                      : 'linear-gradient(to top, var(--accent-purple), var(--accent-blue))',
                    cursor: 'pointer',
                    transition: 'opacity 0.15s',
                  }}
                />
              );
            })}
          </div>
          {data.daily.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              <span>{data.daily[0].date}</span>
              <span>{data.daily[data.daily.length - 1].date}</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Grid: Top Days + Hourly Distribution + Value Analysis */}
      <div className="section" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
        {/* Top Days */}
        <div className="card">
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '14px' }}>Top Days</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {data.topDays.map((d, i) => {
              const label = new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              return (
                <div
                  key={d.date}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 12px', borderRadius: 'var(--radius-md)',
                    background: i === 0 ? 'rgba(234, 179, 8, 0.08)' : 'var(--bg-tertiary)',
                    border: i === 0 ? '1px solid rgba(234, 179, 8, 0.2)' : '1px solid transparent',
                  }}
                >
                  <span style={{
                    width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700,
                    background: i === 0 ? 'var(--accent-yellow)' : 'var(--bg-hover)',
                    color: i === 0 ? '#1a1d27' : 'var(--text-secondary)',
                  }}>
                    {i + 1}
                  </span>
                  <span style={{ flex: 1, fontSize: '0.875rem' }}>{label}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {d.messageCount.toLocaleString()} msgs
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Hourly Distribution */}
        <div className="card">
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '14px' }}>Activity by Hour</h2>
          <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end' }}>
            {Array.from({ length: 24 }, (_, h) => {
              const count = data.hourCounts[h] || 0;
              const height = Math.max((count / maxHourCount) * 100, 1);
              return (
                <div key={h} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flex: 1 }}>
                  <div style={{ width: '100%', background: 'var(--bg-tertiary)', borderRadius: '2px 2px 0 0', height: '60px', position: 'relative' }}>
                    <div
                      title={`${h}:00 — ${count} messages`}
                      style={{
                        position: 'absolute', bottom: 0, width: '100%', borderRadius: '2px 2px 0 0',
                        background: 'linear-gradient(to top, var(--accent-purple), var(--accent-blue))',
                        height: `${height}%`,
                      }}
                    />
                  </div>
                  <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>{h}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Value Analysis */}
        <div className="card" style={{ borderColor: 'rgba(34, 197, 94, 0.2)', background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.04), var(--bg-secondary))' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '14px' }}>Value Analysis</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>API Cost (est.)</span>
              <span style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent-red)' }}>
                {fmtMoney(data.costEstimate)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Max Plan</span>
              <span style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent-green)' }}>
                ${data.planCost}
              </span>
            </div>
            <div style={{ height: '1px', background: 'var(--border-color)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Value Multiplier</span>
              <span style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent-yellow)' }}>
                {data.valueMultiplier}x
              </span>
            </div>
            <div style={{
              padding: '10px', borderRadius: 'var(--radius-md)',
              background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.15)',
              textAlign: 'center', fontSize: '0.75rem', color: 'var(--accent-green)',
            }}>
              Cache Read = {pct(data.totalCacheRead, data.totalTokens)}% of all tokens — saves most of the cost
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="card">
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', color }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>{sub}</div>}
    </div>
  );
}

function TokenBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const p = pct(value, total);
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color }}>{fmt(value)}</span>
      </div>
      <div style={{ height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${p}%`, background: color, borderRadius: '3px' }} />
      </div>
    </div>
  );
}

function ModelBar({ model, totalTokens }: { model: UsageReportModelUsage; totalTokens: number }) {
  const color = modelColor(model.id);
  const p = pct(model.total, totalTokens);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{modelShortName(model.id)}</span>
        </div>
        <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color }}>
          {fmt(model.total)} <span style={{ color: 'var(--text-muted)' }}>({p}%)</span>
        </span>
      </div>
      <div style={{ height: '5px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${p}%`, background: color, borderRadius: '3px' }} />
      </div>
    </div>
  );
}

'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  type TaskServiceType,
  type StandaloneTask,
  type CreateTaskInput,
  createTask,
  listTasks,
} from '../lib/api';
import TaskFormIntel from './components/task-form-intel';
import TaskFormCodeTask from './components/task-form-code-task';
import TaskFormSelfImprove from './components/task-form-self-improve';
import TaskList from './components/task-list';
import ScheduleView from './components/schedule-view';

type TabKey = 'intel' | 'code-task' | 'self-improve' | 'schedule';

const TABS: { key: TabKey; label: string; serviceTypes: TaskServiceType[] }[] = [
  { key: 'intel', label: 'Intel', serviceTypes: ['report', 'research', 'topic-tracker'] },
  { key: 'code-task', label: 'Code Task', serviceTypes: ['code-task'] },
  { key: 'self-improve', label: 'Self-Improve', serviceTypes: ['self-improve'] },
  { key: 'schedule', label: 'Schedule', serviceTypes: [] },
];

// Old service params that should redirect to intel
const INTEL_SERVICE_TYPES = new Set(['report', 'research', 'topic-tracker']);

function resolveTab(param: string | null): TabKey {
  if (!param) return 'intel';
  if (param === 'schedule') return 'schedule';
  if (INTEL_SERVICE_TYPES.has(param)) return 'intel';
  const found = TABS.find((t) => t.key === param);
  return found ? found.key : 'intel';
}

function TasksPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const serviceParam = searchParams.get('service');

  const [activeTab, setActiveTab] = useState<TabKey>(() => resolveTab(serviceParam));
  const [tasks, setTasks] = useState<StandaloneTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Redirect old service params to intel
  useEffect(() => {
    if (serviceParam && INTEL_SERVICE_TYPES.has(serviceParam)) {
      router.replace('/tasks?service=intel');
    }
  }, [serviceParam, router]);

  const tabDef = TABS.find((t) => t.key === activeTab)!;

  const fetchTasks = useCallback(async () => {
    try {
      if (activeTab === 'schedule') {
        // Fetch ALL tasks, filter to scheduled/paused
        const allTasks = await listTasks();
        const scheduled = allTasks
          .filter((t) => t.status === 'scheduled' || t.status === 'paused')
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setTasks(scheduled);
      } else if (activeTab === 'intel') {
        // Fetch all 3 intel service types and merge
        const [reportTasks, researchTasks, trackerTasks] = await Promise.all([
          listTasks('report'),
          listTasks('research'),
          listTasks('topic-tracker'),
        ]);
        const merged = [...reportTasks, ...researchTasks, ...trackerTasks]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setTasks(merged);
      } else {
        const data = await listTasks(tabDef.serviceTypes[0]);
        setTasks(data);
      }
    } catch {
      setTasks([]);
    }
  }, [activeTab, tabDef]);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  const handleTabChange = (key: TabKey) => {
    setActiveTab(key);
    setActiveTaskId(null);
    setError(null);
  };

  const handleSubmit = async (input: CreateTaskInput): Promise<{ taskId: string } | void> => {
    setLoading(true);
    setError(null);
    setActiveTaskId(null);
    try {
      const task = await createTask(input);
      setActiveTaskId(task.taskId);
      await fetchTasks();
      return { taskId: task.taskId };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <h1 className="page-title">Tasks</h1>

      {/* Sub-tabs */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          marginBottom: '24px',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '0',
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            style={{
              padding: '8px 16px',
              fontSize: '0.85rem',
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid var(--accent-blue, #3b82f6)' : '2px solid transparent',
              cursor: 'pointer',
              marginBottom: '-1px',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <div className="error-message" style={{ marginBottom: '16px' }}>{error}</div>}

      {activeTab === 'schedule' ? (
        <ScheduleView tasks={tasks} onRefresh={fetchTasks} />
      ) : (
        <>
          {/* Form */}
          <div className="section">
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '12px' }}>
              New {tabDef.label} Task
            </h2>
            <div className="card">
              {activeTab === 'intel' && <TaskFormIntel onSubmit={handleSubmit} loading={loading} activeTaskId={activeTaskId} />}
              {activeTab === 'code-task' && <TaskFormCodeTask onSubmit={handleSubmit} loading={loading} />}
              {activeTab === 'self-improve' && <TaskFormSelfImprove onSubmit={handleSubmit} loading={loading} />}
            </div>
          </div>

          {/* Task List */}
          <div className="section">
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '12px' }}>
              {tabDef.label} Tasks
            </h2>
            <div className="card">
              <TaskList tasks={tasks} serviceType={activeTab === 'intel' ? 'report' : tabDef.serviceTypes[0]} isIntelTab={activeTab === 'intel'} onRefresh={fetchTasks} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<div className="page-container"><div className="loading">Loading tasks...</div></div>}>
      <TasksPageInner />
    </Suspense>
  );
}

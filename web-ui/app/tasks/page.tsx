'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  type TaskServiceType,
  type StandaloneTask,
  type CreateTaskInput,
  createTask,
  listTasks,
} from '../lib/api';
import TaskFormReport from './components/task-form-report';
import TaskFormResearch from './components/task-form-research';
import TaskFormCodeTask from './components/task-form-code-task';
import TaskFormTopicTracker from './components/task-form-topic-tracker';
import TaskFormSelfImprove from './components/task-form-self-improve';
import TaskList from './components/task-list';

const TABS: { id: TaskServiceType; label: string }[] = [
  { id: 'report', label: 'Report' },
  { id: 'research', label: 'Research' },
  { id: 'code-task', label: 'Code Task' },
  { id: 'topic-tracker', label: 'Topic Tracker' },
  { id: 'self-improve', label: 'Self-Improve' },
];

function TasksPageInner() {
  const searchParams = useSearchParams();
  const initialService = searchParams.get('service') as TaskServiceType | null;

  const [activeTab, setActiveTab] = useState<TaskServiceType>(
    initialService && TABS.some((t) => t.id === initialService) ? initialService : 'report'
  );
  const [tasks, setTasks] = useState<StandaloneTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const data = await listTasks(activeTab);
      setTasks(data);
    } catch {
      setTasks([]);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  const handleSubmit = async (input: CreateTaskInput) => {
    setLoading(true);
    setError(null);
    try {
      await createTask(input);
      await fetchTasks();
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
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 16px',
              fontSize: '0.85rem',
              fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent-blue, #3b82f6)' : '2px solid transparent',
              cursor: 'pointer',
              marginBottom: '-1px',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <div className="error-message" style={{ marginBottom: '16px' }}>{error}</div>}

      {/* Form */}
      <div className="section">
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '12px' }}>
          New {TABS.find((t) => t.id === activeTab)?.label} Task
        </h2>
        <div className="card">
          {activeTab === 'report' && <TaskFormReport onSubmit={handleSubmit} loading={loading} />}
          {activeTab === 'research' && <TaskFormResearch onSubmit={handleSubmit} loading={loading} />}
          {activeTab === 'code-task' && <TaskFormCodeTask onSubmit={handleSubmit} loading={loading} />}
          {activeTab === 'topic-tracker' && <TaskFormTopicTracker onSubmit={handleSubmit} loading={loading} />}
          {activeTab === 'self-improve' && <TaskFormSelfImprove onSubmit={handleSubmit} loading={loading} />}
        </div>
      </div>

      {/* Task List */}
      <div className="section">
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '12px' }}>
          {TABS.find((t) => t.id === activeTab)?.label} Tasks
        </h2>
        <div className="card">
          <TaskList tasks={tasks} serviceType={activeTab} onRefresh={fetchTasks} />
        </div>
      </div>
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

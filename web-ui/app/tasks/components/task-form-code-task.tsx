'use client';

import { useState } from 'react';
import CommonFields from './common-fields';
import { type ClaudeModel, type CreateTaskInput, type ScheduleSlot, type ScheduleConfig } from '../../lib/api';

interface TaskFormCodeTaskProps {
  onSubmit: (input: CreateTaskInput) => Promise<{ taskId: string } | void>;
  loading: boolean;
}

export default function TaskFormCodeTask({ onSubmit, loading }: TaskFormCodeTaskProps) {
  const [description, setDescription] = useState('');
  const [targetPath, setTargetPath] = useState('');
  const [maxIterations, setMaxIterations] = useState(3);
  const [model, setModel] = useState<ClaudeModel>('sonnet');
  const [budget, setBudget] = useState('1.00');
  const [scheduleMode, setScheduleMode] = useState<'once' | 'scheduled'>('once');
  const [slots, setSlots] = useState<ScheduleSlot[]>([{ timeOfDay: '09:00', daysOfWeek: [1, 2, 3, 4, 5] }]);

  const buildSchedule = (): ScheduleConfig | undefined => {
    if (scheduleMode === 'once') return undefined;
    return { type: 'scheduled', slots };
  };

  const handleSubmit = (runNow: boolean) => {
    if (!description.trim() || !targetPath.trim()) return;
    onSubmit({
      serviceType: 'code-task',
      params: {
        serviceType: 'code-task',
        description: description.trim(),
        targetPath: targetPath.trim(),
        maxIterations,
      },
      model,
      budget: parseFloat(budget) || 1.0,
      runNow,
      schedule: buildSchedule(),
    });
  };

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
          Description
        </label>
        <textarea
          placeholder="What should the AI do?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          style={{ width: '100%', resize: 'vertical' }}
        />
      </div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Target Path
          </label>
          <input
            type="text"
            placeholder="/path/to/project"
            value={targetPath}
            onChange={(e) => setTargetPath(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ width: '140px' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Max Iterations
          </label>
          <input
            type="number"
            min={1}
            max={10}
            value={maxIterations}
            onChange={(e) => setMaxIterations(parseInt(e.target.value, 10) || 3)}
            style={{ width: '100%' }}
          />
        </div>
      </div>
      <CommonFields
        model={model}
        setModel={setModel}
        budget={budget}
        setBudget={setBudget}
        scheduleMode={scheduleMode}
        setScheduleMode={setScheduleMode}
        slots={slots}
        setSlots={setSlots}
        onRunNow={() => handleSubmit(true)}
        onSchedule={() => handleSubmit(false)}
        loading={loading}
      />
    </div>
  );
}

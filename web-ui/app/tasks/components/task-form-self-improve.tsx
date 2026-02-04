'use client';

import { useState } from 'react';
import CommonFields from './common-fields';
import { type ClaudeModel, type CreateTaskInput, type ScheduleSlot, type ScheduleConfig } from '../../lib/api';

interface TaskFormSelfImproveProps {
  onSubmit: (input: CreateTaskInput) => Promise<{ taskId: string } | void>;
  loading: boolean;
}

export default function TaskFormSelfImprove({ onSubmit, loading }: TaskFormSelfImproveProps) {
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
    onSubmit({
      serviceType: 'self-improve',
      params: { serviceType: 'self-improve', maxIterations },
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
          Max Iterations
        </label>
        <input
          type="number"
          min={1}
          max={10}
          value={maxIterations}
          onChange={(e) => setMaxIterations(parseInt(e.target.value, 10) || 3)}
          style={{ width: '140px' }}
        />
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

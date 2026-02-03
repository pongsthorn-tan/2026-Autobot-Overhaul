'use client';

import { useState } from 'react';
import CommonFields from './common-fields';
import { type ClaudeModel, type CreateTaskInput, type ScheduleSlot, type ScheduleConfig } from '../../lib/api';

interface TaskFormResearchProps {
  onSubmit: (input: CreateTaskInput) => Promise<void>;
  loading: boolean;
}

export default function TaskFormResearch({ onSubmit, loading }: TaskFormResearchProps) {
  const [topic, setTopic] = useState('');
  const [model, setModel] = useState<ClaudeModel>('sonnet');
  const [budget, setBudget] = useState('1.00');
  const [scheduleMode, setScheduleMode] = useState<'once' | 'scheduled'>('once');
  const [slots, setSlots] = useState<ScheduleSlot[]>([{ timeOfDay: '09:00', daysOfWeek: [1, 2, 3, 4, 5] }]);

  const buildSchedule = (): ScheduleConfig | undefined => {
    if (scheduleMode === 'once') return undefined;
    return { type: 'scheduled', slots };
  };

  const handleSubmit = (runNow: boolean) => {
    if (!topic.trim()) return;
    onSubmit({
      serviceType: 'research',
      params: { serviceType: 'research', topic: topic.trim() },
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
          Topic
        </label>
        <input
          type="text"
          placeholder="Research topic..."
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          style={{ width: '100%' }}
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

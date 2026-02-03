'use client';

import { type ClaudeModel, type ScheduleSlot } from '../../lib/api';

interface CommonFieldsProps {
  model: ClaudeModel;
  setModel: (model: ClaudeModel) => void;
  budget: string;
  setBudget: (budget: string) => void;
  scheduleMode: 'once' | 'scheduled';
  setScheduleMode: (mode: 'once' | 'scheduled') => void;
  slots: ScheduleSlot[];
  setSlots: (slots: ScheduleSlot[]) => void;
  onRunNow: () => void;
  onSchedule: () => void;
  loading: boolean;
}

const allDays = [
  { label: 'SUN', value: 0 },
  { label: 'MON', value: 1 },
  { label: 'TUE', value: 2 },
  { label: 'WED', value: 3 },
  { label: 'THU', value: 4 },
  { label: 'FRI', value: 5 },
  { label: 'SAT', value: 6 },
];

export default function CommonFields({
  model,
  setModel,
  budget,
  setBudget,
  scheduleMode,
  setScheduleMode,
  slots,
  setSlots,
  onRunNow,
  onSchedule,
  loading,
}: CommonFieldsProps) {
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

  return (
    <>
      {/* Model + Budget row */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Model
          </label>
          <select value={model} onChange={(e) => setModel(e.target.value as ClaudeModel)} style={{ width: '100%' }}>
            <option value="haiku">Haiku (Fast, Low Cost)</option>
            <option value="sonnet">Sonnet (Balanced)</option>
            <option value="opus">Opus (Most Capable)</option>
          </select>
        </div>
        <div style={{ width: '140px' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Budget ($)
          </label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* Schedule section */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
          Schedule
        </label>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
            <input
              type="radio"
              name="scheduleMode"
              checked={scheduleMode === 'once'}
              onChange={() => setScheduleMode('once')}
            />
            Run Once
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
            <input
              type="radio"
              name="scheduleMode"
              checked={scheduleMode === 'scheduled'}
              onChange={() => setScheduleMode('scheduled')}
            />
            Run by Schedule
          </label>
        </div>

        {scheduleMode === 'scheduled' && (
          <div style={{ paddingLeft: '8px', borderLeft: '2px solid var(--border)', marginBottom: '8px' }}>
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
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" className="btn btn-primary" onClick={onRunNow} disabled={loading}>
          {loading ? 'Creating...' : 'Run Now'}
        </button>
        {scheduleMode === 'scheduled' && (
          <button type="button" className="btn btn-secondary" onClick={onSchedule} disabled={loading}>
            {loading ? 'Scheduling...' : 'Schedule'}
          </button>
        )}
      </div>
    </>
  );
}

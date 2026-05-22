// src/utils/recurrence.js

export const RECURRENCE_TYPES = {
  NONE: "none",
  EVERYDAY: "everyday",
  EVERYWEEK: "everyweek",
  CUSTOM: "custom",
};

export const generateRecurringTasks = ({
  task,
  recurrenceType = RECURRENCE_TYPES.NONE,
  customIntervalDays = 1,
  count = 100,
}) => {
  if (!task) return [];

  if (recurrenceType === RECURRENCE_TYPES.NONE) {
    return [
      {
        ...task,
        is_recurring: false,
        recurrence_type: RECURRENCE_TYPES.NONE,
        recurrence_interval_days: null,
        recurrence_index: 1,
      },
    ];
  }

  const recurringTasks = [];

  const originalStart = new Date(task.start_time);
  const originalEnd = new Date(task.end_time);

  let intervalDays = 1;

  if (recurrenceType === RECURRENCE_TYPES.EVERYDAY) {
    intervalDays = 1;
  }

  if (recurrenceType === RECURRENCE_TYPES.EVERYWEEK) {
    intervalDays = 7;
  }

  if (recurrenceType === RECURRENCE_TYPES.CUSTOM) {
    intervalDays = Math.min(Math.max(Number(customIntervalDays) || 1, 1), 100);
  }

  for (let i = 0; i < count; i++) {
    const newStart = new Date(originalStart);
    const newEnd = new Date(originalEnd);

    newStart.setDate(originalStart.getDate() + i * intervalDays);
    newEnd.setDate(originalEnd.getDate() + i * intervalDays);

    recurringTasks.push({
      ...task,
      start_time: newStart,
      end_time: newEnd,
      is_recurring: true,
      recurrence_type: recurrenceType,
      recurrence_interval_days: intervalDays,
      recurrence_index: i + 1,
    });
  }

  return recurringTasks;
};
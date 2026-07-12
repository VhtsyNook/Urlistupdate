// src/utils/recurrence.js

export const RECURRENCE_TYPES = {
  NONE: "none",
  DAILY: "daily",
  CUSTOM_DAYS: "custom_days",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
};

export const WEEKDAY_OPTIONS = [
  { label: "Sun", fullLabel: "Sunday", value: 0 },
  { label: "Mon", fullLabel: "Monday", value: 1 },
  { label: "Tue", fullLabel: "Tuesday", value: 2 },
  { label: "Wed", fullLabel: "Wednesday", value: 3 },
  { label: "Thu", fullLabel: "Thursday", value: 4 },
  { label: "Fri", fullLabel: "Friday", value: 5 },
  { label: "Sat", fullLabel: "Saturday", value: 6 },
];
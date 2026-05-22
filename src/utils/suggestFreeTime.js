const normalizeDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  return new Date(value);
};

const setTimeOfDay = (date, hour, minute = 0) => {
  const nextDate = new Date(date);
  nextDate.setHours(hour, minute, 0, 0);
  return nextDate;
};

const getDurationMinutes = (start, end) => {
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
};

const mergeBusySlots = (busySlots) => {
  if (busySlots.length === 0) return [];

  const sortedSlots = [...busySlots].sort(
    (a, b) => a.start_time.getTime() - b.start_time.getTime()
  );

  const mergedSlots = [sortedSlots[0]];

  for (let i = 1; i < sortedSlots.length; i++) {
    const currentSlot = sortedSlots[i];
    const lastSlot = mergedSlots[mergedSlots.length - 1];

    if (currentSlot.start_time <= lastSlot.end_time) {
      if (currentSlot.end_time > lastSlot.end_time) {
        lastSlot.end_time = currentSlot.end_time;
      }
    } else {
      mergedSlots.push(currentSlot);
    }
  }

  return mergedSlots;
};

export const suggestFreeTimeSlots = (tasks, selectedDate, options = {}) => {
  const {
    dayStartHour = 8,
    dayEndHour = 22,
    minSlotMinutes = 30,
  } = options;

  const dayStart = setTimeOfDay(selectedDate, dayStartHour, 0);
  const dayEnd = setTimeOfDay(selectedDate, dayEndHour, 0);

  const busySlots = tasks
    .map((task) => {
      const startTime = normalizeDate(task.start_time);
      const endTime = normalizeDate(task.end_time);

      if (!startTime || !endTime) return null;
      if (endTime <= dayStart || startTime >= dayEnd) return null;

      return {
        task_id: task.id,
        title: task.title || "Untitled Task",
        start_time: startTime < dayStart ? dayStart : startTime,
        end_time: endTime > dayEnd ? dayEnd : endTime,
      };
    })
    .filter(Boolean);

  const mergedBusySlots = mergeBusySlots(busySlots);

  const freeSlots = [];
  let currentTime = new Date(dayStart);

  mergedBusySlots.forEach((busySlot) => {
    if (currentTime < busySlot.start_time) {
      const durationMinutes = getDurationMinutes(
        currentTime,
        busySlot.start_time
      );

      if (durationMinutes >= minSlotMinutes) {
        freeSlots.push({
          start_time: new Date(currentTime),
          end_time: new Date(busySlot.start_time),
          duration_minutes: durationMinutes,
        });
      }
    }

    if (busySlot.end_time > currentTime) {
      currentTime = new Date(busySlot.end_time);
    }
  });

  if (currentTime < dayEnd) {
    const durationMinutes = getDurationMinutes(currentTime, dayEnd);

    if (durationMinutes >= minSlotMinutes) {
      freeSlots.push({
        start_time: new Date(currentTime),
        end_time: new Date(dayEnd),
        duration_minutes: durationMinutes,
      });
    }
  }

  return freeSlots;
};
export const normalizeDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  return new Date(value);
};

export const formatDuration = (minutes) => {
  const value = Number(minutes || 0);

  if (value < 60) return `${value} min`;

  const hours = Math.floor(value / 60);
  const remainingMinutes = value % 60;

  if (remainingMinutes === 0) return `${hours} hr`;

  return `${hours} hr ${remainingMinutes} min`;
};

export const getDayOnly = (date) => {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
};

export const roundUpToNextFiveMinutes = (date) => {
  const nextDate = new Date(date);
  const minutes = nextDate.getMinutes();
  const roundedMinutes = Math.ceil(minutes / 5) * 5;

  if (roundedMinutes === 60) {
    nextDate.setHours(nextDate.getHours() + 1, 0, 0, 0);
  } else {
    nextDate.setMinutes(roundedMinutes, 0, 0);
  }

  return nextDate;
};

export const getDurationMinutes = (start, end) => {
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
};

export const mergeBusySlots = (busySlots) => {
  if (!Array.isArray(busySlots) || busySlots.length === 0) {
    return [];
  }

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

export const getFreeTimeSlotsForDate = (tasks, date, options = {}) => {
  const {
    minSlotMinutes = 15,
    startHour = 0,
    endHour = 23,
    includeCompleted = false,
  } = options;

  const now = new Date();

  const selectedDay = getDayOnly(date);
  const todayOnly = getDayOnly(now);

  if (selectedDay < todayOnly) {
    return {
      status: "past",
      slots: [],
    };
  }

  let dayStart = new Date(date);
  dayStart.setHours(startHour, 0, 0, 0);

  const dayEnd = new Date(date);
  dayEnd.setHours(endHour, 0, 0, 0);

  if (selectedDay.getTime() === todayOnly.getTime()) {
    dayStart = roundUpToNextFiveMinutes(now);

    if (dayStart >= dayEnd) {
      return {
        status: "today-ended",
        slots: [],
      };
    }
  }

  const busySlots = tasks
    .filter((task) => {
      if (includeCompleted) return true;
      return !task.is_completed;
    })
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

  return {
    status: selectedDay.getTime() === todayOnly.getTime() ? "today" : "future",
    slots: freeSlots,
  };
};

export const getPriorityScore = (priority) => {
  const value = String(priority || "Medium").toLowerCase();

  if (value === "high") return 40;
  if (value === "medium") return 25;
  if (value === "low") return 10;

  return 15;
};

export const getDeadlineScore = (deadline) => {
  const deadlineDate = normalizeDate(deadline);

  if (!deadlineDate) return 0;

  const now = new Date();
  const diffMs = deadlineDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 45;
  if (diffDays === 0) return 40;
  if (diffDays === 1) return 35;
  if (diffDays <= 3) return 28;
  if (diffDays <= 7) return 18;
  if (diffDays <= 14) return 10;

  return 4;
};

export const getFitScore = (taskDuration, slotDuration) => {
  const taskMinutes = Number(taskDuration || 60);
  const slotMinutes = Number(slotDuration || 0);

  if (slotMinutes <= 0) return -100;

  if (taskMinutes > slotMinutes) {
    const difference = taskMinutes - slotMinutes;

    if (difference <= 15) return -5;
    if (difference <= 30) return -20;

    return -50;
  }

  const remaining = slotMinutes - taskMinutes;

  if (remaining <= 10) return 35;
  if (remaining <= 30) return 30;
  if (remaining <= 60) return 20;
  if (remaining <= 120) return 10;

  return 5;
};

export const getTaskTypeScore = (task) => {
  if (task.is_generated_session) return 18;
  if (task.planning_enabled) return 12;
  if (task.is_recurring) return 6;
  return 10;
};

export const getConflictPenalty = (task) => {
  if (task.has_conflict) return -25;
  return 0;
};

export const getOverdueScore = (task) => {
  const endTime = normalizeDate(task.end_time);

  if (!endTime) return 0;

  const now = new Date();

  if (!task.is_completed && endTime < now) {
    return 35;
  }

  return 0;
};

export const buildRecommendationReasons = (task, slot) => {
  const reasons = [];

  const priority = String(task.priority || "Medium").toLowerCase();
  const duration = Number(task.estimated_duration_minutes || 60);
  const deadline = normalizeDate(task.deadline);

  if (priority === "high") {
    reasons.push("High priority");
  } else if (priority === "medium") {
    reasons.push("Medium priority");
  } else if (priority === "low") {
    reasons.push("Low priority");
  }

  if (deadline) {
    const now = new Date();
    const diffDays = Math.ceil(
      (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays < 0) {
      reasons.push("Overdue deadline");
    } else if (diffDays === 0) {
      reasons.push("Deadline is today");
    } else if (diffDays === 1) {
      reasons.push("Deadline is tomorrow");
    } else if (diffDays <= 3) {
      reasons.push("Deadline is near");
    }
  }

  if (duration <= slot.duration_minutes) {
    reasons.push(`Fits this ${formatDuration(slot.duration_minutes)} free slot`);
  } else {
    reasons.push(
      `Needs ${formatDuration(duration)}, longer than this free slot`
    );
  }

  if (task.is_generated_session) {
    reasons.push("Part of a planning session");
  }

  if (task.planning_enabled) {
    reasons.push("Main planning task");
  }

  if (task.has_conflict) {
    reasons.push("Has time conflict, may need adjustment");
  }

  return reasons;
};

export const scoreTaskForSlot = (task, slot) => {
  const duration = Number(task.estimated_duration_minutes || 60);

  const priorityScore = getPriorityScore(task.priority);
  const deadlineScore = getDeadlineScore(task.deadline);
  const fitScore = getFitScore(duration, slot.duration_minutes);
  const taskTypeScore = getTaskTypeScore(task);
  const conflictPenalty = getConflictPenalty(task);
  const overdueScore = getOverdueScore(task);

  const totalScore =
    priorityScore +
    deadlineScore +
    fitScore +
    taskTypeScore +
    conflictPenalty +
    overdueScore;

  return {
    task,
    slot,
    score: totalScore,
    duration_minutes: duration,
    reasons: buildRecommendationReasons(task, slot),
  };
};

export const getCandidateTasksForRecommendation = (tasks, selectedDate) => {
  const selectedDay = getDayOnly(selectedDate);

  return tasks.filter((task) => {
    if (task.is_completed) return false;

    const startTime = normalizeDate(task.start_time);
    const deadline = normalizeDate(task.deadline);

    if (!startTime && !deadline) return true;

    const taskDay = startTime ? getDayOnly(startTime) : null;
    const deadlineDay = deadline ? getDayOnly(deadline) : null;

    if (taskDay && taskDay.getTime() === selectedDay.getTime()) {
      return true;
    }

    if (deadlineDay && deadlineDay >= selectedDay) {
      return true;
    }

    if (task.is_generated_session) {
      return true;
    }

    return false;
  });
};

export const getSmartRecommendationsForSlots = (tasks, freeSlots, options = {}) => {
  const { maxRecommendations = 3, selectedDate = new Date() } = options;

  if (!Array.isArray(freeSlots) || freeSlots.length === 0) {
    return [];
  }

  const candidateTasks = getCandidateTasksForRecommendation(tasks, selectedDate);

  const recommendations = freeSlots.map((slot) => {
    const scoredTasks = candidateTasks
      .map((task) => scoreTaskForSlot(task, slot))
      .sort((a, b) => b.score - a.score);

    return {
      slot,
      recommendations: scoredTasks.slice(0, maxRecommendations),
      best: scoredTasks[0] || null,
    };
  });

  return recommendations;
};

export const getBestRecommendationForDate = (tasks, selectedDate, options = {}) => {
  const freeTimeResult = getFreeTimeSlotsForDate(tasks, selectedDate, {
    minSlotMinutes: options.minSlotMinutes || 15,
    startHour: options.startHour ?? 0,
    endHour: options.endHour ?? 23,
    includeCompleted: false,
  });

  const recommendations = getSmartRecommendationsForSlots(
    tasks,
    freeTimeResult.slots,
    {
      selectedDate,
      maxRecommendations: options.maxRecommendations || 3,
    }
  );

  const bestRecommendation = recommendations
    .map((item) => item.best)
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)[0];

  return {
    status: freeTimeResult.status,
    slots: freeTimeResult.slots,
    recommendations,
    best: bestRecommendation || null,
  };
};
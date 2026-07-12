import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { auth, db } from "../config/firebase";


const DEFAULT_REPEAT_COUNT = 60; //จำนวนครั้งสูงสุดที่ระบบจะสร้างงานซ้ำล่วงหน้า
const AUTO_SCHEDULE_BUFFER_MINUTES = 15;//เวลาคั่นระหว่างกิจกรรมเวลาระบบจัดตารางให้อัตโนมัติ
const AUTO_SCHEDULE_DAY_START_HOUR = 6; //เวลาเริ่มต้นของช่วงวันที่ระบบใช้สำหรับจัดตารางอัตโนมัติ
const AUTO_SCHEDULE_DAY_END_HOUR = 23; //เวลาสิ้นสุดของช่วงวันที่ระบบใช้สำหรับจัดตารางอัตโนมัติ
const ALL_DAY_START_HOUR = 4; //เริ่มต้นทั้งวันตอน ตี 4 
const ALL_DAY_END_HOUR = 23; // ถึง ตี 5

const getCurrentUser = () => {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("AUTH_REQUIRED");
  }

  return {
    userId: user.uid,
    email: user.email || "",
  };
};

const getTaskCollectionRef = () => {
  const { userId } = getCurrentUser();
  return collection(db, "users", userId, "tasks");
};

const getTaskDocRef = (taskId) => {
  const { userId } = getCurrentUser();
  return doc(db, "users", userId, "tasks", taskId);
};

const toTimestamp = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return Timestamp.fromDate(value);
  }

  return Timestamp.fromDate(new Date(value));
};

const toDate = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return value;
  }

  if (typeof value.toDate === "function") {
    return value.toDate();
  }

  return new Date(value);
};

const isValidDate = (value) => {
  return value instanceof Date && !Number.isNaN(value.getTime());
};

const addDays = (date, days) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const addMinutes = (date, minutes) => {
  const nextDate = new Date(date);
  nextDate.setMinutes(nextDate.getMinutes() + minutes);
  return nextDate;
};

const getDayOnly = (date) => {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
};

const isSameDateOnly = (dateA, dateB) => {
  const firstDate = toDate(dateA);
  const secondDate = toDate(dateB);

  if (!isValidDate(firstDate) || !isValidDate(secondDate)) return false;

  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate()
  );
};

const normalizeAllDayRange = (startValue, options = {}) => {
  const {
    useCurrentTimeForToday = true,
  } = options;

  const selectedDate = toDate(startValue) || new Date();
  const now = new Date();

  const allDayStart = new Date(selectedDate);
  allDayStart.setHours(ALL_DAY_START_HOUR, 0, 0, 0);

  const allDayEnd = new Date(selectedDate);
  allDayEnd.setHours(ALL_DAY_END_HOUR, 0, 0, 0);

  if (useCurrentTimeForToday && isSameDateOnly(selectedDate, now)) {
    if (now >= allDayEnd) {
      return {
        start_time: allDayEnd,
        end_time: allDayEnd,
      };
    }

    if (now > allDayStart) {
      const currentStart = new Date(now);
      currentStart.setSeconds(0, 0);

      return {
        start_time: currentStart,
        end_time: allDayEnd,
      };
    }
  }

  return {
    start_time: allDayStart,
    end_time: allDayEnd,
  };
};

const normalizeTaskDateRange = (task) => {
  if (task.is_all_day === true) {
    return normalizeAllDayRange(task.start_time || task.deadline || new Date(), {
      useCurrentTimeForToday: task.use_current_time_for_all_day_today !== false,
    });
  }

  return {
    start_time: toDate(task.start_time),
    end_time: toDate(task.end_time),
  };
};



const normalizeRecurrenceType = (value) => {
  const type = String(value || "none").toLowerCase();

  if (type === "everyday") return "daily";
  if (type === "daily") return "daily";

  if (type === "everyweek") return "weekly";
  if (type === "weekly") return "weekly";

  if (type === "custom") return "custom_days";
  if (type === "custom_days") return "custom_days";

  if (type === "monthly") return "monthly";

  return "none";
};

const normalizeWeekday = (value) => {
  const weekday = Number(value);

  if (Number.isNaN(weekday)) return null;
  if (weekday < 0 || weekday > 6) return null;

  return weekday;
};

const normalizeWeekdays = (weekdays, fallbackDate) => {
  if (Array.isArray(weekdays)) {
    const normalized = [
      ...new Set(
        weekdays
          .map(normalizeWeekday)
          .filter((weekday) => weekday !== null)
      ),
    ].sort((a, b) => a - b);

    if (normalized.length > 0) return normalized;
  }

  return [fallbackDate.getDay()];
};

const normalizePositiveInt = (value, fallback = 1) => {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return fallback;
  }

  return Math.max(1, Math.floor(numberValue));
};

const normalizeMonthDay = (value, fallback = 1) => {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return fallback;
  }

  return Math.min(31, Math.max(1, Math.floor(numberValue)));
};

const addMonths = (date, months) => {
  const nextDate = new Date(date);
  const originalDay = nextDate.getDate();

  nextDate.setDate(1);
  nextDate.setMonth(nextDate.getMonth() + months);

  const lastDayOfTargetMonth = new Date(
    nextDate.getFullYear(),
    nextDate.getMonth() + 1,
    0
  ).getDate();

  nextDate.setDate(Math.min(originalDay, lastDayOfTargetMonth));

  return nextDate;
};

const buildDateWithSameTime = (dateSource, timeSource) => {
  const result = new Date(dateSource);

  result.setHours(
    timeSource.getHours(),
    timeSource.getMinutes(),
    timeSource.getSeconds(),
    timeSource.getMilliseconds()
  );

  return result;
};

const getWeekStartSunday = (date) => {
  const start = getDayOnly(date);
  start.setDate(start.getDate() - start.getDay());
  return start;
};

const buildDailyOccurrenceStarts = (startDate, intervalDays, repeatCount) => {
  const starts = [];

  for (let i = 0; i < repeatCount; i++) {
    starts.push(addDays(startDate, intervalDays * i));
  }

  return starts;
};

const buildWeeklyOccurrenceStarts = ({
  startDate,
  weekInterval,
  weekdays,
  repeatCount,
}) => {
  const starts = [];
  let weekCursor = getWeekStartSunday(startDate);

  while (starts.length < repeatCount) {
    weekdays.forEach((weekday) => {
      if (starts.length >= repeatCount) return;

      const candidateDay = addDays(weekCursor, weekday);
      const candidateStart = buildDateWithSameTime(candidateDay, startDate);

      if (candidateStart >= startDate) {
        starts.push(candidateStart);
      }
    });
//เลื่อนไปสัปดาห์ถัดไป หรือข้ามทุกกี่สัปดาห์ตามที่ผู้ใช้เลือก
    weekCursor = addDays(weekCursor, 7 * weekInterval);
  }

  return starts.sort((a, b) => a.getTime() - b.getTime()).slice(0, repeatCount);
};

const buildMonthlyOccurrenceStarts = ({
  startDate,
  monthInterval,
  monthDay,
  repeatCount,
}) => {
  const starts = [];

  for (let i = 0; starts.length < repeatCount && i < repeatCount * 2; i++) {
    const baseMonth = addMonths(startDate, monthInterval * i);
    const candidate = new Date(baseMonth);

    const lastDayOfMonth = new Date(
      candidate.getFullYear(),
      candidate.getMonth() + 1,
      0
    ).getDate();
//ถ้าเลือกวันที่ 31 แต่เดือนนั้นมีแค่ 30 หรือ 28 วัน ระบบจะใช้วันสุดท้ายของเดือนแทน
    candidate.setDate(Math.min(monthDay, lastDayOfMonth));
    candidate.setHours(
      startDate.getHours(),
      startDate.getMinutes(),
      startDate.getSeconds(),
      startDate.getMilliseconds()
    );

    if (candidate >= startDate) {
      starts.push(candidate);
    }
  }

  return starts;
};

const buildOccurrenceStarts = ({
  startDate,
  recurrenceType,
  repeatCount,
  recurrenceIntervalDays,
  recurrenceWeekdays,
  recurrenceWeekInterval,
  recurrenceMonthDay,
  recurrenceMonthInterval,
}) => {
  if (recurrenceType === "daily") {
    return buildDailyOccurrenceStarts(startDate, 1, repeatCount);
  }

  if (recurrenceType === "custom_days") {
    return buildDailyOccurrenceStarts(
      startDate,
      normalizePositiveInt(recurrenceIntervalDays, 1),
      repeatCount
    );
  }

  if (recurrenceType === "weekly") {
    return buildWeeklyOccurrenceStarts({
      startDate,
      weekInterval: normalizePositiveInt(recurrenceWeekInterval, 1),
      weekdays: normalizeWeekdays(recurrenceWeekdays, startDate),
      repeatCount,
    });
  }

  if (recurrenceType === "monthly") {
    return buildMonthlyOccurrenceStarts({
      startDate,
      monthInterval: normalizePositiveInt(recurrenceMonthInterval, 1),
      monthDay: normalizeMonthDay(recurrenceMonthDay, startDate.getDate()),
      repeatCount,
    });
  }

  return [startDate];
};

const normalizePriority = (priority) => {
  if (!priority) return "Medium";

  const value = String(priority).toLowerCase();

  if (value === "high") return "High";
  if (value === "medium") return "Medium";
  if (value === "low") return "Low";

  return "Medium";
};

const normalizeEstimatedDuration = (duration) => {
  const value = Number(duration);

  if (!value || Number.isNaN(value) || value <= 0) {
    return 60;
  }

  return value;
};

const normalizeNumber = (value, fallback) => {
  const numberValue = Number(value);

  if (!numberValue || Number.isNaN(numberValue) || numberValue <= 0) {
    return fallback;
  }

  return numberValue;
};

//newStart < existingEnd && existingStart < newEnd
//เวลาเริ่มของงานใหม่ < เวลาจบของงานเดิม และ เวลาเริ่มของงานเดิม < เวลาจบของงานใหม่
const isTimeOverlapping = (newStart, newEnd, existingStart, existingEnd) => {
  return newStart < existingEnd && existingStart < newEnd;
};

const mapTaskDocToObject = (docSnap) => {
  const data = docSnap.data();

  return {
    id: docSnap.id,
    ...data,

    start_time: toDate(data.start_time),
    end_time: toDate(data.end_time),
    deadline: toDate(data.deadline),

    completedAt: toDate(data.completedAt),
    completed_at: toDate(data.completed_at),
    completed_late: data.completed_late === true,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    conflict_checked_at: toDate(data.conflict_checked_at),

    priority: data.priority || "Medium",
    estimated_duration_minutes: data.estimated_duration_minutes || 60,
    is_all_day: data.is_all_day === true,

    recurrence_weekdays: Array.isArray(data.recurrence_weekdays)
      ? data.recurrence_weekdays
      : null,
    recurrence_week_interval: data.recurrence_week_interval || null,
    recurrence_month_day: data.recurrence_month_day || null,
    recurrence_month_interval: data.recurrence_month_interval || null,

    planning_enabled: data.planning_enabled || false,
    total_planned_minutes: data.total_planned_minutes || null,
    session_duration_minutes: data.session_duration_minutes || null,
    plan_before_deadline_days: data.plan_before_deadline_days || null,
    auto_schedule: data.auto_schedule || false,
    add_review_session: data.add_review_session || false,
    is_generated_session: data.is_generated_session || false,
    parent_task_id: data.parent_task_id || null,
    planned_session_count: data.planned_session_count || null,
    planned_completed_count: data.planned_completed_count || 0,
    generated_session_index: data.generated_session_index || null,
    generated_session_total: data.generated_session_total || null,
    academic_task_type: data.academic_task_type || null,
    preferred_study_window: data.preferred_study_window || null,
    preferred_study_start_hour: data.preferred_study_start_hour ?? null,
    preferred_study_start_minute: data.preferred_study_start_minute ?? null,
    preferred_study_end_hour: data.preferred_study_end_hour ?? null,
    preferred_study_end_minute: data.preferred_study_end_minute ?? null,

    conflict_items: Array.isArray(data.conflict_items)
      ? data.conflict_items.map((item) => ({
        ...item,
        start_time: toDate(item.start_time),
        end_time: toDate(item.end_time),
        conflict_instance_start_time: toDate(
          item.conflict_instance_start_time
        ),
        conflict_instance_end_time: toDate(item.conflict_instance_end_time),
      }))
      : [],
  };
};

const getExistingTasksForCurrentUser = async () => {
  const taskRef = getTaskCollectionRef();
  const snapshot = await getDocs(taskRef);

  return snapshot.docs.map(mapTaskDocToObject);
};

const getTasksOverlappingFreeTimeWindow = async (windowStart, windowEnd) => {
  const taskRef = getTaskCollectionRef();

  const overlappingQuery = query(
    taskRef,
    where("start_time", "<", Timestamp.fromDate(windowEnd)),
    orderBy("start_time", "asc")
  );

  const snapshot = await getDocs(overlappingQuery);

  return snapshot.docs.map(mapTaskDocToObject).filter((task) => {
    const startTime = toDate(task.start_time);
    const endTime = toDate(task.end_time);

    if (!startTime || !endTime) return false;
    if (task.is_completed === true) return false;

    return isTimeOverlapping(windowStart, windowEnd, startTime, endTime);
  });
};

const buildTaskInstances = (task) => {
  const { userId, email } = getCurrentUser();

  const recurrenceType = normalizeRecurrenceType(task.recurrence_type);
  const isRecurring = task.is_recurring === true && recurrenceType !== "none";

  const normalizedDateRange = normalizeTaskDateRange(task);

  const startDate = normalizedDateRange.start_time;
  const endDate = normalizedDateRange.end_time;
  const deadlineDate = task.deadline ? new Date(task.deadline) : null;

  const durationMs = endDate.getTime() - startDate.getTime();
  if (durationMs <= 0) {
    throw new Error("INVALID_ALL_DAY_TIME_RANGE");
  }
  const repeatCount = isRecurring ? DEFAULT_REPEAT_COUNT : 1;

  const recurrenceGroupId = isRecurring
    ? task.recurrence_group_id || `recurrence_${Date.now()}`
    : null;

  const recurrenceIntervalDays =
    recurrenceType === "custom_days"
      ? normalizePositiveInt(task.recurrence_interval_days, 1)
      : recurrenceType === "daily"
        ? 1
        : null;

  const recurrenceWeekdays =
    recurrenceType === "weekly"
      ? normalizeWeekdays(task.recurrence_weekdays, startDate)
      : null;

  const recurrenceWeekInterval =
    recurrenceType === "weekly"
      ? normalizePositiveInt(task.recurrence_week_interval, 1)
      : null;

  const recurrenceMonthDay =
    recurrenceType === "monthly"
      ? normalizeMonthDay(task.recurrence_month_day, startDate.getDate())
      : null;

  const recurrenceMonthInterval =
    recurrenceType === "monthly"
      ? normalizePositiveInt(task.recurrence_month_interval, 1)
      : null;

  const occurrenceStarts = isRecurring
    ? buildOccurrenceStarts({
      startDate,
      recurrenceType,
      repeatCount,
      recurrenceIntervalDays,
      recurrenceWeekdays,
      recurrenceWeekInterval,
      recurrenceMonthDay,
      recurrenceMonthInterval,
    })
    : [startDate];

  const priority = normalizePriority(task.priority);
  const estimatedDurationMinutes = normalizeEstimatedDuration(
    task.estimated_duration_minutes
  );

  return occurrenceStarts.map((rawInstanceStart, index) => {
    let instanceStart = new Date(rawInstanceStart);
    let instanceEnd = new Date(instanceStart.getTime() + durationMs);

    if (task.is_all_day === true) {
      if (index > 0) {
        instanceStart = new Date(rawInstanceStart);
        instanceStart.setHours(ALL_DAY_START_HOUR, 0, 0, 0);
      }

      instanceEnd = new Date(instanceStart);
      instanceEnd.setHours(ALL_DAY_END_HOUR, 0, 0, 0);
    }

    return {
      title: task.title,
      detail: task.detail || "",

      user_id: userId,
      user_email: email,

      start_time: instanceStart,
      end_time: instanceEnd,

      task_type: task.task_type || "fixed",
      academic_task_type: task.academic_task_type || null,

      priority,
      deadline: deadlineDate,
      estimated_duration_minutes: estimatedDurationMinutes,
      is_all_day: task.is_all_day === true,

      planning_enabled: task.planning_enabled || false,
      total_planned_minutes: task.total_planned_minutes || null,
      session_duration_minutes: task.session_duration_minutes || null,
      plan_before_deadline_days: task.plan_before_deadline_days || null,
      auto_schedule: task.auto_schedule || false,
      add_review_session: task.add_review_session || false,
      is_generated_session: task.is_generated_session || false,
      parent_task_id: task.parent_task_id || null,
      planned_session_count: task.planned_session_count || null,
      planned_completed_count: task.planned_completed_count || 0,
      generated_session_index: task.generated_session_index || null,
      generated_session_total: task.generated_session_total || null,
      preferred_study_window: task.preferred_study_window || null,
      preferred_study_start_hour: task.preferred_study_start_hour ?? null,
      preferred_study_start_minute: task.preferred_study_start_minute ?? null,
      preferred_study_end_hour: task.preferred_study_end_hour ?? null,
      preferred_study_end_minute: task.preferred_study_end_minute ?? null,

      status: "active",
      is_completed: false,

      is_recurring: isRecurring,
      recurrence_type: recurrenceType,
      recurrence_interval_days: recurrenceIntervalDays,
      recurrence_weekdays: recurrenceWeekdays,
      recurrence_week_interval: recurrenceWeekInterval,
      recurrence_month_day: recurrenceMonthDay,
      recurrence_month_interval: recurrenceMonthInterval,
      recurrence_index: isRecurring ? index + 1 : null,
      recurrence_group_id: recurrenceGroupId,

      completedAt: null,
      completed_at: null,
      completed_late: false,

      createdAt: task.createdAt || task.created_at || new Date(),
      updatedAt: new Date(),
    };
  });
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

const getBusySlotsForPlanningWindow = (tasks, windowStart, windowEnd) => {
  return tasks
    .map((task) => {
      const startTime = toDate(task.start_time);
      const endTime = toDate(task.end_time);

      if (!startTime || !endTime) return null;
      if (task.is_completed === true) return null;
      if (endTime <= windowStart || startTime >= windowEnd) return null;

      return {
        task_id: task.id || null,
        title: task.title || "Untitled Task",
        start_time: startTime < windowStart ? new Date(windowStart) : startTime,
        end_time: endTime > windowEnd ? new Date(windowEnd) : endTime,
      };
    })
    .filter(Boolean);
};

const getDailyPlanningWindow = (date, globalStart, globalEnd) => {
  const dayStart = new Date(date);
  dayStart.setHours(AUTO_SCHEDULE_DAY_START_HOUR, 0, 0, 0);

  const dayEnd = new Date(date);
  dayEnd.setHours(AUTO_SCHEDULE_DAY_END_HOUR, 0, 0, 0);

  const start = dayStart < globalStart ? new Date(globalStart) : dayStart;
  const end = dayEnd > globalEnd ? new Date(globalEnd) : dayEnd;

  if (start >= end) return null;

  return {
    start,
    end,
  };
};

const getFreeSlotsForPlanningWindow = (
  existingTasks,
  windowStart,
  windowEnd,
  minSlotMinutes
) => {
  const freeSlots = [];

  let cursorDay = getDayOnly(windowStart);
  const lastDay = getDayOnly(windowEnd);

  while (cursorDay <= lastDay) {
    const dailyWindow = getDailyPlanningWindow(
      cursorDay,
      windowStart,
      windowEnd
    );

    if (dailyWindow) {
      const busySlots = getBusySlotsForPlanningWindow(
        existingTasks,
        dailyWindow.start,
        dailyWindow.end
      );
      //แคป
      const mergedBusySlots = mergeBusySlots(busySlots);
      let currentTime = new Date(dailyWindow.start);

      mergedBusySlots.forEach((busySlot) => {
        if (currentTime < busySlot.start_time) {
          const durationMinutes = Math.round(
            (busySlot.start_time.getTime() - currentTime.getTime()) /
            (1000 * 60)
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

      if (currentTime < dailyWindow.end) {
        const durationMinutes = Math.round(
          (dailyWindow.end.getTime() - currentTime.getTime()) / (1000 * 60)
        );

        if (durationMinutes >= minSlotMinutes) {
          freeSlots.push({
            start_time: new Date(currentTime),
            end_time: new Date(dailyWindow.end),
            duration_minutes: durationMinutes,
          });
        }
      }
    }

    cursorDay = addDays(cursorDay, 1);
  }

  return freeSlots;
};

const allocateSessionStartsInFreeSlots = ({
  existingTasks,
  windowStart,
  windowEnd,
  sessionCount,
  sessionDurationMinutes,
}) => {
  const minSlotMinutes = sessionDurationMinutes;
  const maxSessionsPerDay = 2;

  const freeSlots = getFreeSlotsForPlanningWindow(
    existingTasks,
    windowStart,
    windowEnd,
    minSlotMinutes
  );

  const candidatesByDay = new Map();

  freeSlots.forEach((slot) => {
    let cursor = new Date(slot.start_time);

    while (true) {
      const sessionEnd = addMinutes(cursor, sessionDurationMinutes);

      if (sessionEnd > slot.end_time) break;

      const dayKey = cursor.toISOString().slice(0, 10);

      if (!candidatesByDay.has(dayKey)) {
        candidatesByDay.set(dayKey, []);
      }

      candidatesByDay.get(dayKey).push({
        start_time: new Date(cursor),
        end_time: new Date(sessionEnd),
      });

      cursor = addMinutes(sessionEnd, AUTO_SCHEDULE_BUFFER_MINUTES);
    }
  });

  const dayKeys = Array.from(candidatesByDay.keys()).sort();

  const sessionStarts = [];
  const scheduledBusySlots = [];
  const selectedCountByDay = new Map();

  let dailyLimit = 1;

  while (sessionStarts.length < sessionCount && dayKeys.length > 0) {
    let addedInThisRound = false;

    for (const dayKey of dayKeys) {
      if (sessionStarts.length >= sessionCount) break;

      const selectedToday = selectedCountByDay.get(dayKey) || 0;

      if (selectedToday >= dailyLimit) {
        continue;
      }

      const candidates = candidatesByDay.get(dayKey) || [];

      if (candidates.length === 0) {
        continue;
      }

      const selected = candidates.shift();

      sessionStarts.push(new Date(selected.start_time));

      scheduledBusySlots.push({
        start_time: new Date(selected.start_time),
        end_time: new Date(selected.end_time),
      });

      selectedCountByDay.set(dayKey, selectedToday + 1);
      addedInThisRound = true;
    }

    if (!addedInThisRound) {
      dailyLimit += 1;

      const hasMoreCandidates = dayKeys.some((dayKey) => {
        const candidates = candidatesByDay.get(dayKey) || [];
        return candidates.length > 0;
      });

      if (!hasMoreCandidates) break;

      if (dailyLimit > maxSessionsPerDay) {
        dailyLimit = maxSessionsPerDay + 1;
      }

      if (dailyLimit > 8) {
        break;
      }
    }
  }

  return {
    sessionStarts,
    scheduledBusySlots,
    freeSlots,
  };
};

const buildDefaultPlanningSessionStart = ({
  index,
  startPlanningDate,
  startDate,
  latestPlanningDate,
  sessionDurationMinutes,
  sessionsPerDay,
}) => {
  const dayIndex = Math.floor(index / sessionsPerDay);
  const orderInDay = index % sessionsPerDay;

  let sessionStart = addDays(startPlanningDate, dayIndex);
  sessionStart.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);

  sessionStart = addMinutes(
    sessionStart,
    orderInDay * (sessionDurationMinutes + 30)
  );

  if (sessionStart > latestPlanningDate) {
    const fallbackDate = addDays(startPlanningDate, index);
    fallbackDate.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);
    sessionStart = fallbackDate;
  }

  return sessionStart;
};

const buildPlanningSessions = (task, parentTaskId, options = {}) => {
  const { existingTasks = [] } = options;
  const { userId, email } = getCurrentUser();

  const title = task.title?.trim() || "Untitled Task";
  const detail = task.detail || "";

  const startDate = toDate(task.start_time) || new Date();
  const deadlineDate = task.deadline ? toDate(task.deadline) : null;

  if (!deadlineDate || !isValidDate(deadlineDate)) {
    return [];
  }

  const priority = normalizePriority(task.priority);

  const totalPlannedMinutes = normalizeNumber(task.total_planned_minutes, 600);
  const sessionDurationMinutes = normalizeNumber(
    task.session_duration_minutes,
    60
  );

  const planBeforeDeadlineDays = Number(task.plan_before_deadline_days || 0);
  const sessionCount = Math.ceil(totalPlannedMinutes / sessionDurationMinutes);

  const reviewSessionCount = task.add_review_session === true ? 1 : 0;
  const generatedSessionTotal = sessionCount + reviewSessionCount;

  const preferredStudyWindow = task.preferred_study_window || "evening";

  const preferredStartHour = Number.isFinite(
    Number(task.preferred_study_start_hour)
  )
    ? Number(task.preferred_study_start_hour)
    : startDate.getHours();

  const preferredStartMinute = Number.isFinite(
    Number(task.preferred_study_start_minute)
  )
    ? Number(task.preferred_study_start_minute)
    : startDate.getMinutes();

  const preferredEndHour = Number.isFinite(
    Number(task.preferred_study_end_hour)
  )
    ? Number(task.preferred_study_end_hour)
    : 22;

  const preferredEndMinute = Number.isFinite(
    Number(task.preferred_study_end_minute)
  )
    ? Number(task.preferred_study_end_minute)
    : 0;

  const safeStartHour = Math.max(4, Math.min(22, preferredStartHour));
  const safeStartMinute = Math.max(0, Math.min(59, preferredStartMinute));

  const safeEndHour = Math.max(
    safeStartHour + 1,
    Math.min(23, preferredEndHour)
  );
  const safeEndMinute = Math.max(0, Math.min(59, preferredEndMinute));

  const now = new Date();

  const roundUpToNextStep = (date, stepMinutes = 15) => {
    const roundedDate = new Date(date);

    roundedDate.setSeconds(0);
    roundedDate.setMilliseconds(0);

    const minutes = roundedDate.getMinutes();
    const remainder = minutes % stepMinutes;

    if (remainder !== 0) {
      roundedDate.setMinutes(minutes + (stepMinutes - remainder));
    }

    return roundedDate;
  };

  let planningWindowStart = new Date(startDate);
  planningWindowStart.setSeconds(0, 0);

  if (planningWindowStart < now) {
    planningWindowStart = roundUpToNextStep(now, 15);
  }

  let latestPlanningDate = new Date(deadlineDate);
  latestPlanningDate.setDate(
    latestPlanningDate.getDate() - planBeforeDeadlineDays
  );

  const latestStudyWindowEnd = new Date(latestPlanningDate);
  latestStudyWindowEnd.setHours(safeEndHour, safeEndMinute, 0, 0);

  if (latestPlanningDate > latestStudyWindowEnd) {
    latestPlanningDate = latestStudyWindowEnd;
  }

  if (latestPlanningDate <= planningWindowStart) {
    throw new Error("PLANNING_NOT_ENOUGH_FREE_TIME");
  }

  const shouldAutoAllocate = task.auto_schedule === true;

  const buildDailyPlanningWindow = (date) => {
    const dayStart = new Date(date);
    dayStart.setHours(safeStartHour, safeStartMinute, 0, 0);

    const dayEnd = new Date(date);
    dayEnd.setHours(safeEndHour, safeEndMinute, 0, 0);

    const start =
      dayStart < planningWindowStart ? new Date(planningWindowStart) : dayStart;

    const end =
      dayEnd > latestPlanningDate ? new Date(latestPlanningDate) : dayEnd;

    if (start >= end) return null;

    return {
      start,
      end,
    };
  };

  const getBusySlotsForSessionSearch = ({
    windowStart,
    windowEnd,
    generatedSessions,
    avoidExistingTasks,
  }) => {
    const busySourceTasks = avoidExistingTasks ? existingTasks : [];

    const busyFromExisting = busySourceTasks
      .map((item) => {
        const itemStart = toDate(item.start_time);
        const itemEnd = toDate(item.end_time);

        if (!isValidDate(itemStart) || !isValidDate(itemEnd)) return null;
        if (item.is_completed === true) return null;
        if (itemEnd <= windowStart || itemStart >= windowEnd) return null;

        return {
          start_time: itemStart < windowStart ? new Date(windowStart) : itemStart,
          end_time: itemEnd > windowEnd ? new Date(windowEnd) : itemEnd,
        };
      })
      .filter(Boolean);

    const busyFromGenerated = generatedSessions
      .map((session) => {
        const sessionStart = toDate(session.start_time);
        const sessionEnd = toDate(session.end_time);

        if (!isValidDate(sessionStart) || !isValidDate(sessionEnd)) return null;
        if (sessionEnd <= windowStart || sessionStart >= windowEnd) return null;

        return {
          start_time:
            sessionStart < windowStart ? new Date(windowStart) : sessionStart,
          end_time: sessionEnd > windowEnd ? new Date(windowEnd) : sessionEnd,
        };
      })
      .filter(Boolean);

    //return mergeBusySlots([...busyFromExisting, ...busyFromGenerated]);ก่อนแก้ เว้น 12.00-13.00
    const lunchStart = new Date(windowStart);
    lunchStart.setHours(12, 0, 0, 0);

    const lunchEnd = new Date(windowStart);
    lunchEnd.setHours(13, 0, 0, 0);

    const lunchBreakSlots =
      lunchEnd <= windowStart || lunchStart >= windowEnd
        ? []
        : [
          {
            start_time:
              lunchStart < windowStart ? new Date(windowStart) : lunchStart,
            end_time: lunchEnd > windowEnd ? new Date(windowEnd) : lunchEnd,
          },
        ];

    return mergeBusySlots([
      ...busyFromExisting,
      ...busyFromGenerated,
      ...lunchBreakSlots,
    ]);
  };

  const findNextAvailableSessionStart = ({
    durationMinutes,
    generatedSessions,
    avoidExistingTasks,
    preferredFrom = planningWindowStart,
  }) => {
    let cursorDay = getDayOnly(preferredFrom);
    const lastDay = getDayOnly(latestPlanningDate);

    while (cursorDay <= lastDay) {
      const dailyWindow = buildDailyPlanningWindow(cursorDay);

      if (dailyWindow) {
        let cursor =
          dailyWindow.start < preferredFrom
            ? new Date(preferredFrom)
            : new Date(dailyWindow.start);

        cursor = roundUpToNextStep(cursor, 15);

        const busySlots = getBusySlotsForSessionSearch({
          windowStart: dailyWindow.start,
          windowEnd: dailyWindow.end,
          generatedSessions,
          avoidExistingTasks,
        });

        for (const busySlot of busySlots) {
          const possibleEnd = addMinutes(cursor, durationMinutes);

          if (possibleEnd <= busySlot.start_time && possibleEnd <= dailyWindow.end) {
            return cursor;
          }

          if (busySlot.end_time > cursor) {
            cursor = roundUpToNextStep(
              addMinutes(busySlot.end_time, AUTO_SCHEDULE_BUFFER_MINUTES),
              15
            );
          }
        }

        const possibleEnd = addMinutes(cursor, durationMinutes);

        if (possibleEnd <= dailyWindow.end) {
          return cursor;
        }
      }

      cursorDay = addDays(cursorDay, 1);
    }

    return null;
  };

  const buildSessionData = ({
    sessionTitle,
    sessionDetail,
    sessionStart,
    sessionEnd,
    sessionDuration,
    index,
    taskType,
    academicTaskType,
    autoScheduled,
  }) => {
    return {
      title: sessionTitle,
      detail: sessionDetail,

      user_id: userId,
      user_email: email,

      start_time: sessionStart,
      end_time: sessionEnd,

      task_type: taskType,
      academic_task_type: academicTaskType,

      priority,
      deadline: deadlineDate,
      estimated_duration_minutes: sessionDuration,

      planning_enabled: false,
      total_planned_minutes: null,
      session_duration_minutes: sessionDuration,
      plan_before_deadline_days: planBeforeDeadlineDays,
      auto_schedule: task.auto_schedule || false,
      auto_scheduled: autoScheduled,
      add_review_session: false,
      is_generated_session: true,
      parent_task_id: parentTaskId,
      planned_session_count: null,
      planned_completed_count: 0,
      generated_session_index: index,
      generated_session_total: generatedSessionTotal,

      preferred_study_window: preferredStudyWindow,
      preferred_study_start_hour: safeStartHour,
      preferred_study_start_minute: safeStartMinute,
      preferred_study_end_hour: safeEndHour,
      preferred_study_end_minute: safeEndMinute,

      status: "active",
      is_completed: false,

      is_recurring: false,
      recurrence_type: "none",
      recurrence_interval_days: null,
      recurrence_index: null,
      recurrence_group_id: null,

      completedAt: null,
      completed_at: null,
      completed_late: false,

      createdAt: task.createdAt || task.created_at || new Date(),
      updatedAt: new Date(),
    };
  };

  const sessions = [];

  for (let i = 0; i < sessionCount; i++) {
    const sessionStart = findNextAvailableSessionStart({
      durationMinutes: sessionDurationMinutes,
      generatedSessions: sessions,
      avoidExistingTasks: shouldAutoAllocate,
      preferredFrom: planningWindowStart,
    });

    if (!isValidDate(sessionStart)) {
      throw new Error("PLANNING_NOT_ENOUGH_FREE_TIME");
    }

    const sessionEnd = addMinutes(sessionStart, sessionDurationMinutes);

    if (sessionEnd > latestPlanningDate) {
      throw new Error("PLANNING_NOT_ENOUGH_FREE_TIME");
    }

    sessions.push(
      buildSessionData({
        sessionTitle: `${title} ${i + 1}/${sessionCount}`,
        sessionDetail: detail,
        sessionStart,
        sessionEnd,
        sessionDuration: sessionDurationMinutes,
        index: i + 1,
        taskType: "planning_session",
        academicTaskType: "planning_session",
        autoScheduled: shouldAutoAllocate,
      })
    );
  }

  if (task.add_review_session === true) {
    const reviewDuration = Math.min(sessionDurationMinutes, 90);

    const preferredReviewStart = new Date(latestPlanningDate);
    preferredReviewStart.setHours(
      Math.max(safeStartHour, Math.min(18, safeEndHour - 1)),
      0,
      0,
      0
    );

    const reviewStart = findNextAvailableSessionStart({
      durationMinutes: reviewDuration,
      generatedSessions: sessions,
      avoidExistingTasks: shouldAutoAllocate,
      preferredFrom: preferredReviewStart,
    });

    if (!isValidDate(reviewStart)) {
      throw new Error("PLANNING_NOT_ENOUGH_FREE_TIME");
    }

    const reviewEnd = addMinutes(reviewStart, reviewDuration);

    if (reviewEnd > latestPlanningDate) {
      throw new Error("PLANNING_NOT_ENOUGH_FREE_TIME");
    }

    sessions.push(
      buildSessionData({
        sessionTitle: `Review ${title}`,
        sessionDetail: "Final review session before the deadline.",
        sessionStart: reviewStart,
        sessionEnd: reviewEnd,
        sessionDuration: reviewDuration,
        index: sessionCount + 1,
        taskType: "review_session",
        academicTaskType: "review_session",
        autoScheduled: shouldAutoAllocate,
      })
    );
  }

  return sessions;
};

const buildEmptyConflictResult = (instances = []) => {
  return {
    hasConflict: false,
    conflictInstanceCount: 0,
    conflictCount: 0,
    conflictTaskIds: [],
    conflictsByInstance: instances.map((instance, index) => ({
      instance_index: index + 1,
      start_time: instance.start_time,
      end_time: instance.end_time,
      conflicts: [],
    })),
    conflictInstances: [],
    conflictItems: [],
  };
};

const findConflictsForInstances = async (instances, options = {}) => {
  const {
    excludeTaskId = null,
    excludeTaskIds = [],
    excludeRecurrenceGroupId = null,
  } = options;

  const excludedTaskIds = new Set(
    [excludeTaskId, ...excludeTaskIds].filter(Boolean)
  );

  const existingTasks = await getExistingTasksForCurrentUser();

  const conflictsByInstance = instances.map((instance, index) => {
    const conflictItems = existingTasks
      .filter((existingTask) => {
        if (!existingTask.start_time || !existingTask.end_time) return false;

        if (existingTask.is_completed === true) return false;

        if (excludedTaskIds.has(existingTask.id)) {
          return false;
        }

        if (
          excludeRecurrenceGroupId &&
          existingTask.recurrence_group_id === excludeRecurrenceGroupId
        ) {
          return false;
        }
        //findConflictsForInstances เพื่อตรวจงานใหม่เทียบกับงานเดิมใน Firestore
        //เช็กว่า task ที่กำลังจะเพิ่ม/แก้ไข ทับกับ task เดิมมั้ยยย
        return isTimeOverlapping(
          instance.start_time,
          instance.end_time,
          existingTask.start_time,
          existingTask.end_time
        );
      })
      .map((existingTask) => ({
        task_id: existingTask.id,
        title: existingTask.title || "Untitled Task",
        start_time: existingTask.start_time,
        end_time: existingTask.end_time,
        recurrence_type: existingTask.recurrence_type || "none",
        recurrence_group_id: existingTask.recurrence_group_id || null,
      }));

    return {
      instance_index: index + 1,
      start_time: instance.start_time,
      end_time: instance.end_time,
      conflicts: conflictItems,
    };
  });

  const conflictInstances = conflictsByInstance.filter(
    (item) => item.conflicts.length > 0
  );

  const allConflictItems = conflictInstances.flatMap((item) =>
    item.conflicts.map((conflict) => ({
      ...conflict,
      conflict_instance_index: item.instance_index,
      conflict_instance_start_time: item.start_time,
      conflict_instance_end_time: item.end_time,
    }))
  );

  const uniqueConflictTaskIds = [
    ...new Set(allConflictItems.map((item) => item.task_id)),
  ];

  return {
    hasConflict: conflictInstances.length > 0,
    conflictInstanceCount: conflictInstances.length,
    conflictCount: allConflictItems.length,
    conflictTaskIds: uniqueConflictTaskIds,
    conflictsByInstance,
    conflictInstances,
    conflictItems: allConflictItems,
  };
};

const serializeConflictItem = (item) => {
  return {
    task_id: item.task_id,
    title: item.title,
    start_time: toTimestamp(item.start_time),
    end_time: toTimestamp(item.end_time),
    recurrence_type: item.recurrence_type || "none",
    recurrence_group_id: item.recurrence_group_id || null,
    conflict_instance_index: item.conflict_instance_index || null,
    conflict_instance_start_time: toTimestamp(
      item.conflict_instance_start_time
    ),
    conflict_instance_end_time: toTimestamp(item.conflict_instance_end_time),
  };
};

const buildConflictSummaryForUI = (conflictResult) => {
  return conflictResult.conflictItems.map((item) => ({
    task_id: item.task_id,
    title: item.title,
    start_time: item.start_time,
    end_time: item.end_time,
    recurrence_type: item.recurrence_type,
    recurrence_group_id: item.recurrence_group_id,
    conflict_instance_index: item.conflict_instance_index,
    conflict_instance_start_time: item.conflict_instance_start_time,
    conflict_instance_end_time: item.conflict_instance_end_time,
  }));
};

const buildFirestoreTaskData = ({
  instance,
  conflictItemsForThisInstance = [],
  conflictResult,
  saveAnyway,
  now,
}) => {
  return {
    title: instance.title,
    detail: instance.detail,

    user_id: instance.user_id,
    user_email: instance.user_email,

    start_time: toTimestamp(instance.start_time),
    end_time: toTimestamp(instance.end_time),

    task_type: instance.task_type,
    academic_task_type: instance.academic_task_type || null,

    priority: instance.priority,
    deadline: toTimestamp(instance.deadline),
    estimated_duration_minutes: instance.estimated_duration_minutes,
    is_all_day: instance.is_all_day === true,

    planning_enabled: instance.planning_enabled || false,
    total_planned_minutes: instance.total_planned_minutes || null,
    session_duration_minutes: instance.session_duration_minutes || null,
    plan_before_deadline_days: instance.plan_before_deadline_days || null,
    auto_schedule: instance.auto_schedule || false,
    auto_scheduled: instance.auto_scheduled || false,
    add_review_session: instance.add_review_session || false,
    is_generated_session: instance.is_generated_session || false,
    parent_task_id: instance.parent_task_id || null,
    planned_session_count: instance.planned_session_count || null,
    planned_completed_count: instance.planned_completed_count || 0,
    generated_session_index: instance.generated_session_index || null,
    generated_session_total: instance.generated_session_total || null,
    preferred_study_window: instance.preferred_study_window || null,
    preferred_study_start_hour: instance.preferred_study_start_hour ?? null,
    preferred_study_start_minute: instance.preferred_study_start_minute ?? null,
    preferred_study_end_hour: instance.preferred_study_end_hour ?? null,
    preferred_study_end_minute: instance.preferred_study_end_minute ?? null,

    status: "active",
    is_completed: false,

    is_recurring: instance.is_recurring,
    recurrence_type: instance.recurrence_type,
    recurrence_interval_days: instance.recurrence_interval_days,
    recurrence_weekdays: instance.recurrence_weekdays || null,
    recurrence_week_interval: instance.recurrence_week_interval || null,
    recurrence_month_day: instance.recurrence_month_day || null,
    recurrence_month_interval: instance.recurrence_month_interval || null,
    recurrence_index: instance.recurrence_index,
    recurrence_group_id: instance.recurrence_group_id,

    has_conflict: conflictItemsForThisInstance.length > 0,
    conflict_count: conflictItemsForThisInstance.length,
    conflict_task_ids: conflictItemsForThisInstance.map((item) => item.task_id),
    conflict_items: conflictItemsForThisInstance,
    conflict_checked_at: now,
    save_anyway: conflictResult.hasConflict ? saveAnyway === true : false,

    completedAt: null,
    completed_at: null,
    completed_late: false,

    createdAt: instance.createdAt ? toTimestamp(instance.createdAt) : now,
    updatedAt: now,
  };
};

export const checkTaskConflicts = async (task, options = {}) => {
  const instances = buildTaskInstances(task);
  const conflictResult = await findConflictsForInstances(instances, options);

  return {
    has_conflict: conflictResult.hasConflict,
    conflict_count: conflictResult.conflictCount,
    conflict_instance_count: conflictResult.conflictInstanceCount,
    conflict_task_ids: conflictResult.conflictTaskIds,
    conflict_items: buildConflictSummaryForUI(conflictResult),
    conflict_instances: conflictResult.conflictInstances,
    instances,
  };
};

export const addTask = async (task, options = {}) => {
  const { saveAnyway = false, skipConflictCheck = false } = options;

  const taskRef = getTaskCollectionRef();
  const isPlanningTask = task.planning_enabled === true;

  const mainTaskDocRef = isPlanningTask ? doc(taskRef) : null;
  const parentTaskId = mainTaskDocRef?.id || null;

  const existingTasksForAutoSchedule =
    isPlanningTask && task.auto_schedule === true
      ? await getExistingTasksForCurrentUser()
      : [];

  const mainInstances = buildTaskInstances({
    ...task,
    task_type: isPlanningTask ? "planned_task" : task.task_type || "fixed",
    planning_enabled: isPlanningTask,
    is_generated_session: false,
    parent_task_id: null,
  });

  const busyTasksForAutoSchedule = existingTasksForAutoSchedule;

  const generatedSessions = isPlanningTask
    ? buildPlanningSessions(task, parentTaskId, {
      existingTasks: busyTasksForAutoSchedule,
    })
    : [];

  const instances = [...mainInstances, ...generatedSessions];

  const conflictCheckInstances = instances.filter(
    (instance) => instance.is_generated_session === true || !isPlanningTask
  );

  const conflictResult = skipConflictCheck
    ? buildEmptyConflictResult(conflictCheckInstances)
    : await findConflictsForInstances(conflictCheckInstances);

  if (conflictResult.hasConflict && !saveAnyway) {
    return {
      success: false,
      has_conflict: true,
      conflict_count: conflictResult.conflictCount,
      conflict_instance_count: conflictResult.conflictInstanceCount,
      conflict_task_ids: conflictResult.conflictTaskIds,
      conflict_items: buildConflictSummaryForUI(conflictResult),
      message: "TIME_CONFLICT_DETECTED",
    };
  }

  const batch = writeBatch(db);
  const now = Timestamp.now();

  const generatedSessionCount = generatedSessions.length;

  instances.forEach((instance) => {
    const isMainPlanningTask =
      isPlanningTask && instance.is_generated_session !== true;

    const docRef = isMainPlanningTask ? mainTaskDocRef : doc(taskRef);

    const conflictIndex = conflictCheckInstances.findIndex(
      (checkedInstance) => checkedInstance === instance
    );

    const conflictForThisInstance =
      conflictIndex >= 0
        ? conflictResult.conflictsByInstance?.find(
          (item) => item.instance_index === conflictIndex + 1
        )?.conflicts || []
        : [];

    const conflictItemsForThisInstance = conflictForThisInstance.map(
      (conflict) =>
        serializeConflictItem({
          ...conflict,
          conflict_instance_index:
            instance.generated_session_index || conflictIndex + 1,
          conflict_instance_start_time: instance.start_time,
          conflict_instance_end_time: instance.end_time,
        })
    );

    batch.set(
      docRef,
      buildFirestoreTaskData({
        instance: {
          ...instance,
          planned_session_count: isMainPlanningTask
            ? generatedSessionCount
            : instance.planned_session_count,
        },
        conflictItemsForThisInstance,
        conflictResult,
        saveAnyway,
        now,
      })
    );
  });

  await batch.commit();

  return {
    success: true,
    has_conflict: conflictResult.hasConflict,
    conflict_count: conflictResult.conflictCount,
    conflict_instance_count: conflictResult.conflictInstanceCount,
    conflict_task_ids: conflictResult.conflictTaskIds,
    conflict_items: buildConflictSummaryForUI(conflictResult),
    created_count: instances.length,
    generated_session_count: generatedSessionCount,
    parent_task_id: parentTaskId,
    save_anyway: conflictResult.hasConflict ? saveAnyway === true : false,
  };
};

export const getTaskById = async (taskId) => {
  const taskDocRef = getTaskDocRef(taskId);
  const taskSnapshot = await getDoc(taskDocRef);

  if (!taskSnapshot.exists()) {
    throw new Error("Task not found");
  }

  return mapTaskDocToObject(taskSnapshot);
};

export const updateTask = async (taskId, task, options = {}) => {
  const { saveAnyway = false, editScope = "single" } = options;

  const existingTask = await getTaskById(taskId);

  const nextRecurrenceType = normalizeRecurrenceType(task.recurrence_type);
  const nextIsRecurring =
    task.is_recurring === true && nextRecurrenceType !== "none";

  const existingRecurrenceType = normalizeRecurrenceType(
    existingTask.recurrence_type
  );

  const existingIsRecurring =
    existingTask.is_recurring === true && existingRecurrenceType !== "none";

  const existingGroupId =
    existingTask.recurrence_group_id || task.recurrence_group_id || null;

  const isOrphanRecurringTask =
    nextIsRecurring &&
    existingIsRecurring &&
    (!existingTask.recurrence_group_id || !existingTask.recurrence_index);

  const shouldEditAllRecurring =
    existingIsRecurring && editScope === "all";

  const shouldRecreateAsRecurringGroup =
    nextIsRecurring &&
    (!existingIsRecurring || isOrphanRecurringTask || shouldEditAllRecurring);

  const shouldConvertRecurringGroupToSingle =
    existingIsRecurring && editScope === "all" && !nextIsRecurring;

  if (shouldRecreateAsRecurringGroup) {
    const recurrenceGroupId = existingGroupId || `recurrence_${Date.now()}`;

    const instances = buildTaskInstances({
      ...task,
      is_recurring: true,
      recurrence_type: nextRecurrenceType,
      recurrence_group_id: recurrenceGroupId,
      task_type: task.task_type || existingTask.task_type || "fixed",
      planning_enabled: false,
      is_generated_session: false,
      parent_task_id: null,
      createdAt: existingTask.createdAt || existingTask.created_at || new Date(),
      created_at: existingTask.created_at || existingTask.createdAt || new Date(),
    });

    const conflictResult = await findConflictsForInstances(instances, {
      excludeTaskId: taskId,
      excludeRecurrenceGroupId:
        shouldEditAllRecurring || isOrphanRecurringTask ? existingGroupId : null,
    });

    if (conflictResult.hasConflict && !saveAnyway) {
      return {
        success: false,
        has_conflict: true,
        conflict_count: conflictResult.conflictCount,
        conflict_instance_count: conflictResult.conflictInstanceCount,
        conflict_task_ids: conflictResult.conflictTaskIds,
        conflict_items: buildConflictSummaryForUI(conflictResult),
        message: "TIME_CONFLICT_DETECTED",
      };
    }

    const batch = writeBatch(db);
    const now = Timestamp.now();
    const taskRef = getTaskCollectionRef();

    if (existingGroupId && shouldEditAllRecurring) {
      const groupQuery = query(
        taskRef,
        where("recurrence_group_id", "==", existingGroupId)
      );

      const groupSnapshot = await getDocs(groupQuery);

      if (groupSnapshot.empty) {
        batch.delete(getTaskDocRef(taskId));
      } else {
        groupSnapshot.docs.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });
      }
    } else {
      batch.delete(getTaskDocRef(taskId));
    }

    instances.forEach((instance, index) => {
      const docRef = doc(taskRef);

      const conflictForThisInstance =
        conflictResult.conflictsByInstance?.find(
          (item) => item.instance_index === index + 1
        )?.conflicts || [];

      const conflictItemsForThisInstance = conflictForThisInstance.map(
        (conflict) =>
          serializeConflictItem({
            ...conflict,
            conflict_instance_index: index + 1,
            conflict_instance_start_time: instance.start_time,
            conflict_instance_end_time: instance.end_time,
          })
      );

      batch.set(
        docRef,
        buildFirestoreTaskData({
          instance,
          conflictItemsForThisInstance,
          conflictResult,
          saveAnyway,
          now,
        })
      );
    });

    await batch.commit();

    return {
      success: true,
      recreated_as_recurring_group: true,
      deleted_task_id: taskId,
      recurrence_group_id: recurrenceGroupId,
      created_count: instances.length,
      has_conflict: conflictResult.hasConflict,
      conflict_count: conflictResult.conflictCount,
      conflict_instance_count: conflictResult.conflictInstanceCount,
      conflict_task_ids: conflictResult.conflictTaskIds,
      conflict_items: buildConflictSummaryForUI(conflictResult),
      save_anyway: conflictResult.hasConflict ? saveAnyway === true : false,
    };
  }

  if (shouldConvertRecurringGroupToSingle) {
    const instances = buildTaskInstances({
      ...task,
      is_recurring: false,
      recurrence_type: "none",
      recurrence_group_id: null,
      recurrence_index: null,
      task_type: task.task_type || existingTask.task_type || "fixed",
      planning_enabled: false,
      is_generated_session: false,
      parent_task_id: null,
      createdAt: existingTask.createdAt || existingTask.created_at || new Date(),
      created_at: existingTask.created_at || existingTask.createdAt || new Date(),
    });

    const conflictResult = await findConflictsForInstances(instances, {
      excludeTaskId: taskId,
      excludeRecurrenceGroupId: existingGroupId,
    });

    if (conflictResult.hasConflict && !saveAnyway) {
      return {
        success: false,
        has_conflict: true,
        conflict_count: conflictResult.conflictCount,
        conflict_instance_count: conflictResult.conflictInstanceCount,
        conflict_task_ids: conflictResult.conflictTaskIds,
        conflict_items: buildConflictSummaryForUI(conflictResult),
        message: "TIME_CONFLICT_DETECTED",
      };
    }

    const batch = writeBatch(db);
    const now = Timestamp.now();
    const taskRef = getTaskCollectionRef();

    if (existingGroupId) {
      const groupQuery = query(
        taskRef,
        where("recurrence_group_id", "==", existingGroupId)
      );

      const groupSnapshot = await getDocs(groupQuery);

      if (groupSnapshot.empty) {
        batch.delete(getTaskDocRef(taskId));
      } else {
        groupSnapshot.docs.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });
      }
    } else {
      batch.delete(getTaskDocRef(taskId));
    }

    const docRef = doc(taskRef);
    const instance = instances[0];

    const conflictItemsForThisInstance = conflictResult.conflictItems.map(
      serializeConflictItem
    );

    batch.set(
      docRef,
      buildFirestoreTaskData({
        instance,
        conflictItemsForThisInstance,
        conflictResult,
        saveAnyway,
        now,
      })
    );

    await batch.commit();

    return {
      success: true,
      converted_recurring_group_to_single: true,
      deleted_task_id: taskId,
      created_count: 1,
      has_conflict: conflictResult.hasConflict,
      conflict_count: conflictResult.conflictCount,
      conflict_instance_count: conflictResult.conflictInstanceCount,
      conflict_task_ids: conflictResult.conflictTaskIds,
      conflict_items: buildConflictSummaryForUI(conflictResult),
      save_anyway: conflictResult.hasConflict ? saveAnyway === true : false,
    };
  }

  const candidateInstances = buildTaskInstances({
    ...task,
    is_recurring: false,
    recurrence_type: "none",
  });
  const normalizedUpdateDateRange = normalizeTaskDateRange(task);

  const conflictResult = await findConflictsForInstances(candidateInstances, {
    excludeTaskId: taskId,
  });

  if (conflictResult.hasConflict && !saveAnyway) {
    return {
      success: false,
      has_conflict: true,
      conflict_count: conflictResult.conflictCount,
      conflict_instance_count: conflictResult.conflictInstanceCount,
      conflict_task_ids: conflictResult.conflictTaskIds,
      conflict_items: buildConflictSummaryForUI(conflictResult),
      message: "TIME_CONFLICT_DETECTED",
    };
  }

  const conflictItems = conflictResult.conflictItems.map(serializeConflictItem);

  const taskDocRef = getTaskDocRef(taskId);
  const now = Timestamp.now();

  await updateDoc(taskDocRef, {
    title: task.title,
    detail: task.detail || "",

    start_time: toTimestamp(normalizedUpdateDateRange.start_time),
    end_time: toTimestamp(normalizedUpdateDateRange.end_time),

    task_type: task.task_type || "fixed",

    priority: normalizePriority(task.priority),
    deadline: toTimestamp(task.deadline),
    estimated_duration_minutes: normalizeEstimatedDuration(
      task.estimated_duration_minutes
    ),
    is_all_day: task.is_all_day === true,

    planning_enabled: task.planning_enabled || false,
    total_planned_minutes: task.total_planned_minutes || null,
    session_duration_minutes: task.session_duration_minutes || null,
    plan_before_deadline_days: task.plan_before_deadline_days || null,
    auto_schedule: task.auto_schedule || false,
    add_review_session: task.add_review_session || false,
    is_generated_session: task.is_generated_session || false,
    parent_task_id: task.parent_task_id || null,

    is_recurring: nextIsRecurring,
    recurrence_type: nextRecurrenceType,
    recurrence_interval_days:
      nextRecurrenceType === "custom_days"
        ? normalizePositiveInt(task.recurrence_interval_days, 1)
        : nextRecurrenceType === "daily"
          ? 1
          : null,
    recurrence_weekdays:
      nextRecurrenceType === "weekly"
        ? normalizeWeekdays(task.recurrence_weekdays, toDate(task.start_time))
        : null,
    recurrence_week_interval:
      nextRecurrenceType === "weekly"
        ? normalizePositiveInt(task.recurrence_week_interval, 1)
        : null,
    recurrence_month_day:
      nextRecurrenceType === "monthly"
        ? normalizeMonthDay(
          task.recurrence_month_day,
          toDate(task.start_time)?.getDate?.() || 1
        )
        : null,
    recurrence_month_interval:
      nextRecurrenceType === "monthly"
        ? normalizePositiveInt(task.recurrence_month_interval, 1)
        : null,
    recurrence_index: task.recurrence_index || null,
    recurrence_group_id: nextIsRecurring
      ? task.recurrence_group_id || existingTask.recurrence_group_id || null
      : null,

    has_conflict: conflictResult.hasConflict,
    conflict_count: conflictResult.conflictCount,
    conflict_task_ids: conflictResult.conflictTaskIds,
    conflict_items: conflictItems,
    conflict_checked_at: now,
    save_anyway: conflictResult.hasConflict ? saveAnyway === true : false,

    updatedAt: now,
  });

  return {
    success: true,
    has_conflict: conflictResult.hasConflict,
    conflict_count: conflictResult.conflictCount,
    conflict_instance_count: conflictResult.conflictInstanceCount,
    conflict_task_ids: conflictResult.conflictTaskIds,
    conflict_items: buildConflictSummaryForUI(conflictResult),
    save_anyway: conflictResult.hasConflict ? saveAnyway === true : false,
  };
};

export const rescheduleTask = async (
  taskId,
  newStartTime,
  newEndTime,
  options = {}
) => {
  const { saveAnyway = false, skipConflictCheck = false } = options;

  const existingTask = await getTaskById(taskId);

  const safeStartTime = toDate(newStartTime);
  const safeEndTime = toDate(newEndTime);

  if (!isValidDate(safeStartTime) || !isValidDate(safeEndTime)) {
    throw new Error("INVALID_RESCHEDULE_TIME");
  }

  if (safeEndTime <= safeStartTime) {
    throw new Error("END_TIME_MUST_BE_AFTER_START_TIME");
  }

  const candidateInstances = [
    {
      title: existingTask.title || "Untitled Task",
      start_time: safeStartTime,
      end_time: safeEndTime,
    },
  ];

  const conflictResult = skipConflictCheck
    ? buildEmptyConflictResult(candidateInstances)
    : await findConflictsForInstances(candidateInstances, {
      excludeTaskId: taskId,
    });

  if (conflictResult.hasConflict && !saveAnyway) {
    return {
      success: false,
      has_conflict: true,
      conflict_count: conflictResult.conflictCount,
      conflict_instance_count: conflictResult.conflictInstanceCount,
      conflict_task_ids: conflictResult.conflictTaskIds,
      conflict_items: buildConflictSummaryForUI(conflictResult),
      message: "TIME_CONFLICT_DETECTED",
      task_id: taskId,
      start_time: safeStartTime,
      end_time: safeEndTime,
    };
  }

  const conflictItems = conflictResult.conflictItems.map(serializeConflictItem);

  const taskDocRef = getTaskDocRef(taskId);
  const now = Timestamp.now();

  await updateDoc(taskDocRef, {
    start_time: toTimestamp(safeStartTime),
    end_time: toTimestamp(safeEndTime),

    status: "active",
    is_completed: false,

    completedAt: null,
    completed_at: null,
    completed_late: false,

    has_conflict: conflictResult.hasConflict,
    conflict_count: conflictResult.conflictCount,
    conflict_task_ids: conflictResult.conflictTaskIds,
    conflict_items: conflictItems,
    conflict_checked_at: now,
    save_anyway: conflictResult.hasConflict ? saveAnyway === true : false,

    updatedAt: now,
  });

  return {
    success: true,
    task_id: taskId,
    start_time: safeStartTime,
    end_time: safeEndTime,
    has_conflict: conflictResult.hasConflict,
    conflict_count: conflictResult.conflictCount,
    conflict_instance_count: conflictResult.conflictInstanceCount,
    conflict_task_ids: conflictResult.conflictTaskIds,
    conflict_items: buildConflictSummaryForUI(conflictResult),
    save_anyway: conflictResult.hasConflict ? saveAnyway === true : false,
  };
};


export const getFreeTimeSlots = async (options = {}) => {
  const {
    targetDate = new Date(),
    durationMinutes = 60,
    dayStartHour = 4,
    dayEndHour = 23,
    bufferMinutes = 0,
    maxSlots = 200,
    includePastTime = false,
    slotStepMinutes = 30,
  } = options;

  const safeDurationMinutes = normalizeEstimatedDuration(durationMinutes);
  const safeBufferMinutes = Math.max(0, Number(bufferMinutes) || 0);
  const safeMaxSlots = Math.max(1, Number(maxSlots) || 200);
  const safeSlotStepMinutes = Math.max(1, Number(slotStepMinutes) || 30);

  const selectedDate = toDate(targetDate) || new Date();

  const dayStart = new Date(selectedDate);
  dayStart.setHours(dayStartHour, 0, 0, 0);

  const dayEnd = new Date(selectedDate);
  dayEnd.setHours(dayEndHour, 0, 0, 0);

  if (dayStart >= dayEnd) {
    return {
      success: true,
      date: selectedDate,
      duration_minutes: safeDurationMinutes,
      slots: [],
      busy_slots: [],
      message: "INVALID_TIME_WINDOW",
    };
  }

  const roundUpToNextStep = (date, stepMinutes) => {
    const roundedDate = new Date(date);

    roundedDate.setSeconds(0);
    roundedDate.setMilliseconds(0);

    const minutes = roundedDate.getMinutes();
    const remainder = minutes % stepMinutes;

    if (remainder !== 0) {
      roundedDate.setMinutes(minutes + (stepMinutes - remainder));
    }

    return roundedDate;
  };

  const now = new Date();
  let windowStart = new Date(dayStart);

  const isSelectedDateToday =
    selectedDate.getFullYear() === now.getFullYear() &&
    selectedDate.getMonth() === now.getMonth() &&
    selectedDate.getDate() === now.getDate();

  if (isSelectedDateToday && includePastTime !== true) {
    const nowWithBuffer = addMinutes(now, safeBufferMinutes);
    const nextValidStart = roundUpToNextStep(
      nowWithBuffer,
      safeSlotStepMinutes
    );

    if (nextValidStart > windowStart) {
      windowStart = nextValidStart;
    }
  }

  if (windowStart >= dayEnd) {
    return {
      success: true,
      date: selectedDate,
      duration_minutes: safeDurationMinutes,
      slots: [],
      busy_slots: [],
      message: "NO_TIME_LEFT_TODAY",
    };
  }

  const existingTasks = await getTasksOverlappingFreeTimeWindow(
    windowStart,
    dayEnd
  );

  const busySlots = existingTasks
    .map((task) => {
      const startTime = toDate(task.start_time);
      const endTime = toDate(task.end_time);

      if (!startTime || !endTime) return null;
      if (task.is_completed === true) return null;
      if (endTime <= windowStart || startTime >= dayEnd) return null;

      return {
        task_id: task.id || null,
        title: task.title || "Untitled Task",
        start_time: startTime < windowStart ? new Date(windowStart) : startTime,
        end_time: endTime > dayEnd ? new Date(dayEnd) : endTime,
      };
    })
    .filter(Boolean);
  //ตรงนี้ๆๆ
  //const mergedBusySlots = mergeBusySlots(busySlots); ยังไม่เว้น 12.00 - 13.00 
  const lunchStart = new Date(selectedDate);
  lunchStart.setHours(12, 0, 0, 0);

  const lunchEnd = new Date(selectedDate);
  lunchEnd.setHours(13, 0, 0, 0);

  const lunchBreakSlots =
    lunchEnd <= windowStart || lunchStart >= dayEnd
      ? []
      : [
        {
          task_id: "system-lunch-break",
          title: "Lunch Break",
          start_time: lunchStart < windowStart ? new Date(windowStart) : lunchStart,
          end_time: lunchEnd > dayEnd ? new Date(dayEnd) : lunchEnd,
        },
      ];  

  const mergedBusySlots = mergeBusySlots([
    ...busySlots,
    ...lunchBreakSlots,
  ]);
  const freeSlots = [];

  const pushSplitSlotsFromGap = (gapStart, gapEnd) => {
    if (freeSlots.length >= safeMaxSlots) return;

    let cursor = roundUpToNextStep(gapStart, safeSlotStepMinutes);

    while (freeSlots.length < safeMaxSlots) {
      const suggestedStart = new Date(cursor);
      const suggestedEnd = addMinutes(suggestedStart, safeDurationMinutes);

      if (suggestedEnd > gapEnd) break;
      if (suggestedEnd > dayEnd) break;

      freeSlots.push({
        start_time: new Date(suggestedStart),
        end_time: new Date(suggestedEnd),
        suggested_start_time: new Date(suggestedStart),
        suggested_end_time: new Date(suggestedEnd),
        free_window_start_time: new Date(gapStart),
        free_window_end_time: new Date(gapEnd),
        duration_minutes: safeDurationMinutes,
        available_minutes: safeDurationMinutes,
      });

      cursor = addMinutes(suggestedStart, safeSlotStepMinutes);
    }
  };

  let cursor = new Date(windowStart);

  mergedBusySlots.forEach((busySlot) => {
    if (freeSlots.length >= safeMaxSlots) return;

    if (cursor < busySlot.start_time) {
      pushSplitSlotsFromGap(cursor, busySlot.start_time);
    }

    if (busySlot.end_time > cursor) {
      cursor = addMinutes(busySlot.end_time, safeBufferMinutes);
    }
  });

  if (cursor < dayEnd && freeSlots.length < safeMaxSlots) {
    pushSplitSlotsFromGap(cursor, dayEnd);
  }

  return {
    success: true,
    date: selectedDate,
    duration_minutes: safeDurationMinutes,
    day_start: dayStart,
    day_end: dayEnd,
    window_start: windowStart,
    slots: freeSlots,
    busy_slots: mergedBusySlots,
    total_slots: freeSlots.length,
  };
};
//ถึงนี้
export const updateTaskStatus = async (taskId, status) => {
  const task = await getTaskById(taskId);

  const taskDocRef = getTaskDocRef(taskId);

  const isCompleted = status === "completed";
  const nowDate = new Date();
  const nowTimestamp = Timestamp.fromDate(nowDate);
  const endDate = toDate(task.end_time);

  const completedLate =
    isCompleted && endDate ? nowDate.getTime() > endDate.getTime() : false;

  await updateDoc(taskDocRef, {
    status,
    is_completed: isCompleted,

    completedAt: isCompleted ? nowTimestamp : null,
    completed_at: isCompleted ? nowTimestamp : null,
    completed_late: isCompleted ? completedLate : false,

    updatedAt: nowTimestamp,
  });

  if (task.parent_task_id) {
    await updateParentPlanningProgress(task.parent_task_id);
  }
};

export const updateParentPlanningProgress = async (parentTaskId) => {
  if (!parentTaskId) return;

  const parentDocRef = getTaskDocRef(parentTaskId);
  const parentSnapshot = await getDoc(parentDocRef);

  // ถ้า parent task ถูกลบไปแล้ว ให้หยุด ไม่ต้อง update
  // ป้องกัน error: No document to update
  if (!parentSnapshot.exists()) {
    return;
  }

  const taskRef = getTaskCollectionRef();

  const q = query(taskRef, where("parent_task_id", "==", parentTaskId));

  const snapshot = await getDocs(q);

  const generatedSessions = snapshot.docs.map(mapTaskDocToObject);

  const completedCount = generatedSessions.filter(
    (task) => task.is_completed
  ).length;

  await updateDoc(parentDocRef, {
    planned_completed_count: completedCount,
    planned_session_count: generatedSessions.length,
    updatedAt: Timestamp.now(),
  });
};

export const markTaskDone = async (taskId) => {
  await updateTaskStatus(taskId, "completed");
};

export const undoTaskDone = async (taskId) => {
  await updateTaskStatus(taskId, "active");
};

export const listenTasks = (callback) => {
  const taskRef = getTaskCollectionRef();

  const q = query(taskRef, orderBy("start_time", "asc"));

  return onSnapshot(q, (snapshot) => {
    const tasks = snapshot.docs.map(mapTaskDocToObject);
    callback(tasks);
  });
};

export const deleteTask = async (taskId) => {
  const task = await getTaskById(taskId);

  const taskDocRef = getTaskDocRef(taskId);

  await deleteDoc(taskDocRef);

  if (task.parent_task_id) {
    await updateParentPlanningProgress(task.parent_task_id);
  }
};

export const deletePlanningTaskWithSessions = async (parentTaskId) => {
  if (!parentTaskId) {
    throw new Error("parent_task_id is required");
  }

  const taskRef = getTaskCollectionRef();

  const q = query(taskRef, where("parent_task_id", "==", parentTaskId));

  const snapshot = await getDocs(q);

  const batch = writeBatch(db);

  snapshot.docs.forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });

  const parentDocRef = getTaskDocRef(parentTaskId);
  batch.delete(parentDocRef);

  await batch.commit();
};

export const deleteRecurringTaskGroup = async (recurrenceGroupId) => {
  if (!recurrenceGroupId) {
    throw new Error("recurrence_group_id is required");
  }

  const taskRef = getTaskCollectionRef();

  const q = query(
    taskRef,
    where("recurrence_group_id", "==", recurrenceGroupId)
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return;
  }

  const batch = writeBatch(db);

  snapshot.docs.forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });

  await batch.commit();
};



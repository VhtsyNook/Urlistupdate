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
import {
  deleteGoogleCalendarEvent,
} from "./googleCalendarService";


const DEFAULT_REPEAT_COUNT = 60; //จำนวนครั้งสูงสุดที่ระบบจะสร้างงานซ้ำล่วงหน้า
const AUTO_SCHEDULE_BUFFER_MINUTES = 15;//เวลาคั่นระหว่างกิจกรรมเวลาระบบจัดตารางให้อัตโนมัติ
const AUTO_SCHEDULE_DAY_START_HOUR = 6; //เวลาเริ่มต้นของช่วงวันที่ระบบใช้สำหรับจัดตารางอัตโนมัติ
const AUTO_SCHEDULE_DAY_END_HOUR = 23; //เวลาสิ้นสุดของช่วงวันที่ระบบใช้สำหรับจัดตารางอัตโนมัติ
const ALL_DAY_START_HOUR = 4; //เริ่มต้นทั้งวันตอน ตี 4 
const ALL_DAY_END_HOUR = 23; // ถึง ตี 5

const deleteLinkedGoogleCalendarEvent = async (task) => {
  if (!task?.google_event_id) {
    return;
  }

  try {
    await deleteGoogleCalendarEvent(
      task.google_event_id,
      {
        calendarId:
          task.google_calendar_id || "primary",
        silent: true,
      }
    );
  } catch (error) {
    // Google Event ถูกลบไปแล้ว
    if (
      error?.status === 404 ||
      error?.status === 410
    ) {
      return;
    }

    // Google Calendar ไม่ได้เชื่อมอยู่
    // ให้ลบใน Urlist ต่อได้ ไม่ต้องหยุดการทำงาน
    if (
      error?.message === "GOOGLE_CALENDAR_NOT_CONNECTED" ||
      error?.message === "GOOGLE_RELOGIN_REQUIRED"
    ) {
      console.log(
        "SKIP GOOGLE EVENT DELETE:",
        error?.message
      );
      return;
    }

    throw error;
  }
};

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

const normalizePlanningTaskRules = (task) => ({
  ...task,

  // วันสุดท้ายของแผนสามารถนำมาใช้จัดกิจกรรมได้
  plan_before_deadline_days: 0,

  // Planning Mode ต้องหลีกเลี่ยงกิจกรรมเดิมเสมอ
  auto_schedule: true,

  // Planning Mode รุ่นปัจจุบันไม่สร้างรอบทบทวน
  add_review_session: false,
});

const getLocalDateKey = (date) => {
  const value = toDate(date);

  if (!isValidDate(value)) return "";

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const roundUpToMinutesStep = (date, stepMinutes = 15) => {
  const roundedDate = new Date(date);

  roundedDate.setSeconds(0, 0);

  const minutes = roundedDate.getMinutes();
  const remainder = minutes % stepMinutes;

  if (remainder !== 0) {
    roundedDate.setMinutes(minutes + (stepMinutes - remainder));
  }

  return roundedDate;
};

const getPlanningSessionDurations = (
  totalPlannedMinutes,
  sessionDurationMinutes
) => {
  const durations = [];
  let remainingMinutes = totalPlannedMinutes;

  while (remainingMinutes > 0) {
    const currentDuration = Math.min(
      sessionDurationMinutes,
      remainingMinutes
    );

    durations.push(currentDuration);
    remainingMinutes -= currentDuration;
  }

  return durations;
};

const getPlanningConfiguration = (task) => {
  const startDate = toDate(task.start_time) || new Date();
  const deadlineDate = task.deadline ? toDate(task.deadline) : null;

  if (!isValidDate(startDate)) {
    throw new Error("PLANNING_INVALID_START_DATE");
  }

  if (!isValidDate(deadlineDate)) {
    throw new Error("PLANNING_DEADLINE_REQUIRED");
  }

  const totalPlannedMinutes = normalizeNumber(
    task.total_planned_minutes,
    600
  );

  const sessionDurationMinutes = normalizeNumber(
    task.session_duration_minutes,
    60
  );

  const sessionDurations = getPlanningSessionDurations(
    totalPlannedMinutes,
    sessionDurationMinutes
  );

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

  const safeStartHour = Math.max(
    0,
    Math.min(23, preferredStartHour)
  );

  const safeStartMinute = Math.max(
    0,
    Math.min(59, preferredStartMinute)
  );

  const safeEndHour = Math.max(
    0,
    Math.min(23, preferredEndHour)
  );

  const safeEndMinute = Math.max(
    0,
    Math.min(59, preferredEndMinute)
  );

  const preferredStartTotalMinutes =
    safeStartHour * 60 + safeStartMinute;

  const preferredEndTotalMinutes =
    safeEndHour * 60 + safeEndMinute;

  if (preferredEndTotalMinutes <= preferredStartTotalMinutes) {
    throw new Error("PLANNING_INVALID_PREFERRED_TIME");
  }

  const startPlanningDay = getDayOnly(startDate);
  const latestPlanningDay = getDayOnly(deadlineDate);

  const planBeforeDeadlineDays = Number(
    task.plan_before_deadline_days || 0
  );

  latestPlanningDay.setDate(
    latestPlanningDay.getDate() - planBeforeDeadlineDays
  );

  if (latestPlanningDay < startPlanningDay) {
    throw new Error("PLANNING_INVALID_DATE_RANGE");
  }

  let planningWindowStart = new Date(startPlanningDay);
  planningWindowStart.setHours(
    safeStartHour,
    safeStartMinute,
    0,
    0
  );

  if (startDate > planningWindowStart) {
    planningWindowStart = new Date(startDate);
  }

  const now = new Date();

  if (isSameDateOnly(startPlanningDay, now) && now > planningWindowStart) {
    planningWindowStart = roundUpToMinutesStep(now, 15);
  }

  const latestPlanningDate = new Date(latestPlanningDay);
  latestPlanningDate.setHours(
    safeEndHour,
    safeEndMinute,
    0,
    0
  );

  if (latestPlanningDate <= planningWindowStart) {
    throw new Error("PLANNING_NOT_ENOUGH_FREE_TIME");
  }

  const planningDays = [];
  let cursorDay = new Date(startPlanningDay);

  while (cursorDay <= latestPlanningDay) {
    planningDays.push(new Date(cursorDay));
    cursorDay = addDays(cursorDay, 1);
  }

  return {
    startDate,
    deadlineDate,
    startPlanningDay,
    latestPlanningDay,
    planningWindowStart,
    latestPlanningDate,
    planningDays,
    totalPlannedMinutes,
    sessionDurationMinutes,
    sessionDurations,
    sessionCount: sessionDurations.length,
    preferredStudyWindow:
      task.preferred_study_window || "custom",
    safeStartHour,
    safeStartMinute,
    safeEndHour,
    safeEndMinute,
    planBeforeDeadlineDays,
  };
};

const getPlanningDailyWindow = (date, config) => {
  const dayStart = new Date(date);
  dayStart.setHours(
    config.safeStartHour,
    config.safeStartMinute,
    0,
    0
  );

  const dayEnd = new Date(date);
  dayEnd.setHours(
    config.safeEndHour,
    config.safeEndMinute,
    0,
    0
  );

  const start =
    dayStart < config.planningWindowStart
      ? new Date(config.planningWindowStart)
      : dayStart;

  const end =
    dayEnd > config.latestPlanningDate
      ? new Date(config.latestPlanningDate)
      : dayEnd;

  if (start >= end) return null;

  return {
    start,
    end,
  };
};

const getBusySlotsForPlanningDay = ({
  existingTasks,
  generatedSessions,
  windowStart,
  windowEnd,
}) => {
  const sourceItems = [
    ...existingTasks.filter((task) => {
      // Parent ของ Planning Mode ไม่ใช่ช่วงเวลาที่ผู้ใช้ต้องทำจริง
      // ใช้กิจกรรมย่อยของแผนเป็น Busy Time แทน
      if (
        task.task_type === "planned_task" &&
        task.planning_enabled === true
      ) {
        return false;
      }

      return task.is_completed !== true;
    }),
    ...generatedSessions,
  ];

  const busySlots = sourceItems
    .map((item) => {
      const itemStart = toDate(item.start_time);
      const itemEnd = toDate(item.end_time);

      if (!isValidDate(itemStart) || !isValidDate(itemEnd)) {
        return null;
      }

      if (itemEnd <= windowStart || itemStart >= windowEnd) {
        return null;
      }

      // เว้นเวลา 15 นาทีทั้งก่อนและหลังกิจกรรม
      const bufferedStart = addMinutes(
        itemStart,
        -AUTO_SCHEDULE_BUFFER_MINUTES
      );

      const bufferedEnd = addMinutes(
        itemEnd,
        AUTO_SCHEDULE_BUFFER_MINUTES
      );

      return {
        start_time:
          bufferedStart < windowStart
            ? new Date(windowStart)
            : bufferedStart,
        end_time:
          bufferedEnd > windowEnd
            ? new Date(windowEnd)
            : bufferedEnd,
      };
    })
    .filter(Boolean);

  return mergeBusySlots(busySlots);
};

const findAvailableStartInPlanningDay = ({
  date,
  durationMinutes,
  config,
  existingTasks,
  generatedSessions,
}) => {
  const dailyWindow = getPlanningDailyWindow(date, config);

  if (!dailyWindow) return null;

  const busySlots = getBusySlotsForPlanningDay({
    existingTasks,
    generatedSessions,
    windowStart: dailyWindow.start,
    windowEnd: dailyWindow.end,
  });

  let cursor = roundUpToMinutesStep(
    dailyWindow.start,
    15
  );

  for (const busySlot of busySlots) {
    const possibleEnd = addMinutes(
      cursor,
      durationMinutes
    );

    if (
      possibleEnd <= busySlot.start_time &&
      possibleEnd <= dailyWindow.end
    ) {
      return cursor;
    }

    if (busySlot.end_time > cursor) {
      cursor = roundUpToMinutesStep(
        busySlot.end_time,
        15
      );
    }
  }

  const possibleEnd = addMinutes(
    cursor,
    durationMinutes
  );

  if (possibleEnd <= dailyWindow.end) {
    return cursor;
  }

  return null;
};

const allocateBalancedPlanningSessions = ({
  config,
  existingTasks,
}) => {
  const generatedSessions = [];
  const selectedCountByDay = new Map();

  const fullSessionCount = Math.floor(
    config.totalPlannedMinutes /
    config.sessionDurationMinutes
  );

  const remainingMinutes =
    config.totalPlannedMinutes %
    config.sessionDurationMinutes;

  let remainingFullSessions = fullSessionCount;
  let dailyLimit = 1;

  // กระจายรอบเต็มวันละ 1 รอบก่อน
  // เมื่อจำนวนวันไม่พอ จึงเพิ่มเป็นวันละ 2 รอบ, 3 รอบ ตามลำดับ
  while (remainingFullSessions > 0) {
    let addedInThisPass = false;

    for (const day of config.planningDays) {
      if (remainingFullSessions <= 0) break;

      const dayKey = getLocalDateKey(day);
      const selectedToday =
        selectedCountByDay.get(dayKey) || 0;

      if (selectedToday >= dailyLimit) {
        continue;
      }

      const sessionStart =
        findAvailableStartInPlanningDay({
          date: day,
          durationMinutes:
            config.sessionDurationMinutes,
          config,
          existingTasks,
          generatedSessions,
        });

      if (!isValidDate(sessionStart)) {
        continue;
      }

      const sessionEnd = addMinutes(
        sessionStart,
        config.sessionDurationMinutes
      );

      generatedSessions.push({
        start_time: sessionStart,
        end_time: sessionEnd,
        duration_minutes:
          config.sessionDurationMinutes,
      });

      selectedCountByDay.set(
        dayKey,
        selectedToday + 1
      );

      remainingFullSessions -= 1;
      addedInThisPass = true;
    }

    if (remainingFullSessions <= 0) {
      break;
    }

    if (!addedInThisPass) {
      dailyLimit += 1;

      // ป้องกัน loop ไม่รู้จบเมื่อไม่มีเวลาว่างจริง
      if (dailyLimit > 50) {
        break;
      }
    } else {
      dailyLimit += 1;
    }
  }

  if (remainingFullSessions > 0) {
    throw new Error("PLANNING_NOT_ENOUGH_FREE_TIME");
  }

  // รอบสุดท้ายใช้เฉพาะเวลาที่เหลือ
  // พยายามวางหลังรอบเต็มล่าสุดก่อน เพื่อให้เป็นรอบสุดท้ายตามลำดับเวลา
  if (remainingMinutes > 0) {
    const latestGeneratedStart =
      generatedSessions.length > 0
        ? [...generatedSessions].sort(
          (a, b) =>
            b.start_time.getTime() -
            a.start_time.getTime()
        )[0].start_time
        : null;

    const preferredDays = latestGeneratedStart
      ? [
        ...config.planningDays.filter(
          (day) =>
            getDayOnly(day) >=
            getDayOnly(latestGeneratedStart)
        ),
        ...config.planningDays.filter(
          (day) =>
            getDayOnly(day) <
            getDayOnly(latestGeneratedStart)
        ),
      ]
      : config.planningDays;

    let remainderStart = null;

    for (const day of preferredDays) {
      remainderStart =
        findAvailableStartInPlanningDay({
          date: day,
          durationMinutes: remainingMinutes,
          config,
          existingTasks,
          generatedSessions,
        });

      if (isValidDate(remainderStart)) {
        break;
      }
    }

    if (!isValidDate(remainderStart)) {
      throw new Error("PLANNING_NOT_ENOUGH_FREE_TIME");
    }

    generatedSessions.push({
      start_time: remainderStart,
      end_time: addMinutes(
        remainderStart,
        remainingMinutes
      ),
      duration_minutes: remainingMinutes,
    });
  }

  return generatedSessions.sort(
    (a, b) =>
      a.start_time.getTime() -
      b.start_time.getTime()
  );
};

const buildPlanningSessionData = ({
  task,
  parentTaskId,
  config,
  sessionStart,
  sessionDuration,
  index,
  sessionCount,
}) => {
  const { userId, email } = getCurrentUser();

  const title =
    task.title?.trim() || "Untitled Task";

  const detail = task.detail || "";

  return {
    title: `${title} ${index}/${sessionCount}`,
    detail,

    user_id: userId,
    user_email: email,

    start_time: new Date(sessionStart),
    end_time: addMinutes(
      sessionStart,
      sessionDuration
    ),

    task_type: "planning_session",
    academic_task_type: "planning_session",

    priority: normalizePriority(task.priority),
    deadline: config.deadlineDate,
    estimated_duration_minutes: sessionDuration,

    planning_enabled: false,
    total_planned_minutes: null,
    session_duration_minutes: sessionDuration,
    plan_before_deadline_days:
      config.planBeforeDeadlineDays,
    auto_schedule: true,
    auto_scheduled: true,
    add_review_session: false,
    is_generated_session: true,
    parent_task_id: parentTaskId,
    planned_session_count: null,
    planned_completed_count: 0,
    generated_session_index: index,
    generated_session_total: sessionCount,

    preferred_study_window:
      config.preferredStudyWindow,
    preferred_study_start_hour:
      config.safeStartHour,
    preferred_study_start_minute:
      config.safeStartMinute,
    preferred_study_end_hour:
      config.safeEndHour,
    preferred_study_end_minute:
      config.safeEndMinute,

    status: "active",
    is_completed: false,

    is_recurring: false,
    recurrence_type: "none",
    recurrence_interval_days: null,
    recurrence_weekdays: null,
    recurrence_week_interval: null,
    recurrence_month_day: null,
    recurrence_month_interval: null,
    recurrence_index: null,
    recurrence_group_id: null,

    completedAt: null,
    completed_at: null,
    completed_late: false,

    createdAt:
      task.createdAt ||
      task.created_at ||
      new Date(),
    updatedAt: new Date(),
  };
};

const buildPlanningSessions = (
  task,
  parentTaskId,
  options = {}
) => {
  const { existingTasks = [] } = options;
  const config = getPlanningConfiguration(task);

  const allocatedSessions =
    allocateBalancedPlanningSessions({
      config,
      existingTasks,
    });

  return allocatedSessions.map(
    (session, index) =>
      buildPlanningSessionData({
        task,
        parentTaskId,
        config,
        sessionStart: session.start_time,
        sessionDuration:
          session.duration_minutes,
        index: index + 1,
        sessionCount:
          allocatedSessions.length,
      })
  );
};

const buildPlanningSessionsFromDraft = (
  task,
  parentTaskId,
  draftSessions
) => {
  const config = getPlanningConfiguration(task);

  if (!Array.isArray(draftSessions)) {
    throw new Error("PLANNING_DRAFT_REQUIRED");
  }

  if (
    draftSessions.length !==
    config.sessionDurations.length
  ) {
    throw new Error(
      "PLANNING_DRAFT_SESSION_COUNT_MISMATCH"
    );
  }

  const sortedDraftSessions = draftSessions
    .map((session) => ({
      ...session,
      start_time: toDate(session.start_time),
    }))
    .sort(
      (a, b) =>
        a.start_time.getTime() -
        b.start_time.getTime()
    );

  return sortedDraftSessions.map(
    (session, index) => {
      const sessionStart = toDate(
        session.start_time
      );

      if (!isValidDate(sessionStart)) {
        throw new Error(
          "PLANNING_DRAFT_INVALID_SESSION_TIME"
        );
      }

      const sessionDuration =
        config.sessionDurations[index];

      return buildPlanningSessionData({
        task,
        parentTaskId,
        config,
        sessionStart,
        sessionDuration,
        index: index + 1,
        sessionCount:
          sortedDraftSessions.length,
      });
    }
  );
};

const validatePlanningSessionBounds = (
  task,
  sessions
) => {
  const config = getPlanningConfiguration(task);
  const issues = [];

  if (
    !Array.isArray(sessions) ||
    sessions.length !== config.sessionCount
  ) {
    issues.push({
      type: "SESSION_COUNT_MISMATCH",
      expected: config.sessionCount,
      actual: Array.isArray(sessions)
        ? sessions.length
        : 0,
    });

    return {
      is_valid: false,
      issues,
    };
  }

  const sortedSessions = [...sessions].sort(
    (a, b) =>
      toDate(a.start_time).getTime() -
      toDate(b.start_time).getTime()
  );

  sortedSessions.forEach((session, index) => {
    const sessionStart = toDate(
      session.start_time
    );

    const sessionEnd = toDate(
      session.end_time
    );

    if (
      !isValidDate(sessionStart) ||
      !isValidDate(sessionEnd) ||
      sessionEnd <= sessionStart
    ) {
      issues.push({
        type: "INVALID_SESSION_TIME",
        session_index: index + 1,
      });

      return;
    }

    const dailyWindow = getPlanningDailyWindow(
      sessionStart,
      config
    );

    if (
      !dailyWindow ||
      sessionStart < dailyWindow.start ||
      sessionEnd > dailyWindow.end
    ) {
      issues.push({
        type: "SESSION_OUTSIDE_PLANNING_WINDOW",
        session_index: index + 1,
        start_time: sessionStart,
        end_time: sessionEnd,
      });
    }

    const actualDuration = Math.round(
      (sessionEnd.getTime() -
        sessionStart.getTime()) /
      (1000 * 60)
    );

    const expectedDuration =
      config.sessionDurations[index];

    if (actualDuration !== expectedDuration) {
      issues.push({
        type: "SESSION_DURATION_MISMATCH",
        session_index: index + 1,
        expected_duration_minutes:
          expectedDuration,
        actual_duration_minutes:
          actualDuration,
      });
    }
  });

  for (
    let index = 1;
    index < sortedSessions.length;
    index += 1
  ) {
    const previousEnd = toDate(
      sortedSessions[index - 1].end_time
    );

    const currentStart = toDate(
      sortedSessions[index].start_time
    );

    if (currentStart < previousEnd) {
      issues.push({
        type: "DRAFT_SESSIONS_OVERLAP",
        first_session_index: index,
        second_session_index: index + 1,
      });
    }
  }

  return {
    is_valid: issues.length === 0,
    issues,
  };
};

const getPlanningDraftSummary = (
  sessions
) => {
  const countByDay = {};

  sessions.forEach((session) => {
    const dayKey = getLocalDateKey(
      session.start_time
    );

    countByDay[dayKey] =
      (countByDay[dayKey] || 0) + 1;
  });

  const maxSessionsInOneDay = Math.max(
    0,
    ...Object.values(countByDay)
  );

  return {
    session_count: sessions.length,
    sessions_by_day: countByDay,
    max_sessions_in_one_day:
      maxSessionsInOneDay,
    has_multiple_sessions_in_one_day:
      maxSessionsInOneDay > 1,
  };
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

        // Parent ของ Planning Mode เป็นข้อมูลสรุปของแผน
        // จึงไม่ใช้เป็นช่วงเวลาชนซ้ำกับกิจกรรมย่อย
        if (
          existingTask.task_type === "planned_task" &&
          existingTask.planning_enabled === true
        ) {
          return false;
        }

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

export const createPlanningDraft = async (task) => {
  const safeTask = normalizePlanningTaskRules(task);
  const existingTasks =
    await getExistingTasksForCurrentUser();

  const sessions = buildPlanningSessions(
    safeTask,
    null,
    {
      existingTasks,
    }
  );

  const validation =
    validatePlanningSessionBounds(
      safeTask,
      sessions
    );

  return {
    success: validation.is_valid,
    message: validation.is_valid
      ? "PLANNING_DRAFT_CREATED"
      : "PLANNING_DRAFT_INVALID",
    sessions,
    validation_errors: validation.issues,
    summary:
      getPlanningDraftSummary(sessions),
  };
};

export const checkPlanningDraftConflicts = async (
  task,
  draftSessions
) => {
  const safeTask = normalizePlanningTaskRules(task);

  let sessions;

  try {
    sessions = buildPlanningSessionsFromDraft(
      safeTask,
      null,
      draftSessions
    );
  } catch (error) {
    return {
      success: false,
      is_valid: false,
      has_conflict: false,
      message:
        error?.message ||
        "PLANNING_DRAFT_INVALID",
      validation_errors: [
        {
          type:
            error?.message ||
            "PLANNING_DRAFT_INVALID",
        },
      ],
      sessions: [],
    };
  }

  const validation =
    validatePlanningSessionBounds(
      safeTask,
      sessions
    );

  if (!validation.is_valid) {
    return {
      success: false,
      is_valid: false,
      has_conflict: false,
      message: "PLANNING_DRAFT_INVALID",
      validation_errors:
        validation.issues,
      sessions,
    };
  }

  const conflictResult =
    await findConflictsForInstances(sessions);

  return {
    success: !conflictResult.hasConflict,
    is_valid: true,
    has_conflict:
      conflictResult.hasConflict,
    conflict_count:
      conflictResult.conflictCount,
    conflict_instance_count:
      conflictResult.conflictInstanceCount,
    conflict_task_ids:
      conflictResult.conflictTaskIds,
    conflict_items:
      buildConflictSummaryForUI(
        conflictResult
      ),
    conflict_instances:
      conflictResult.conflictInstances,
    message: conflictResult.hasConflict
      ? "TIME_CONFLICT_DETECTED"
      : "PLANNING_DRAFT_VALID",
    validation_errors: [],
    sessions,
    summary:
      getPlanningDraftSummary(sessions),
  };
};

export const addTask = async (task, options = {}) => {
  const {
    saveAnyway = false,
    skipConflictCheck = false,
    planningSessions = null,
  } = options;

  const taskRef = getTaskCollectionRef();
  const isPlanningTask = task.planning_enabled === true;

  const safeTask = isPlanningTask
    ? normalizePlanningTaskRules(task)
    : task;

  const mainTaskDocRef = isPlanningTask ? doc(taskRef) : null;
  const parentTaskId = mainTaskDocRef?.id || null;

  // กิจกรรมแบบวางแผนต้องโหลดกิจกรรมเดิมมาคำนวณทุกครั้ง
  const existingTasksForAutoSchedule = isPlanningTask
    ? await getExistingTasksForCurrentUser()
    : [];

  const mainInstances = buildTaskInstances({
    ...safeTask,
    task_type: isPlanningTask
      ? "planned_task"
      : safeTask.task_type || "fixed",
    planning_enabled: isPlanningTask,
    is_generated_session: false,
    parent_task_id: null,
  });

  let generatedSessions = [];

  if (isPlanningTask) {
    generatedSessions = Array.isArray(
      planningSessions
    )
      ? buildPlanningSessionsFromDraft(
        safeTask,
        parentTaskId,
        planningSessions
      )
      : buildPlanningSessions(
        safeTask,
        parentTaskId,
        {
          existingTasks:
            existingTasksForAutoSchedule,
        }
      );

    const planningValidation =
      validatePlanningSessionBounds(
        safeTask,
        generatedSessions
      );

    if (!planningValidation.is_valid) {
      return {
        success: false,
        has_conflict: false,
        message: "PLANNING_DRAFT_INVALID",
        validation_errors:
          planningValidation.issues,
      };
    }
  }

  const instances = [
    ...mainInstances,
    ...generatedSessions,
  ];

  const conflictCheckInstances = instances.filter(
    (instance) => instance.is_generated_session === true || !isPlanningTask
  );

  const conflictResult = skipConflictCheck
    ? buildEmptyConflictResult(conflictCheckInstances)
    : await findConflictsForInstances(conflictCheckInstances);

  // Planning Mode ไม่อนุญาตให้บันทึกทับกิจกรรมเดิม
  if (
    conflictResult.hasConflict &&
    (isPlanningTask || !saveAnyway)
  ) {
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

  const mergedBusySlots = mergeBusySlots(busySlots);


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

  const totalSessionCount = generatedSessions.length;
  const allSessionsCompleted =
    totalSessionCount > 0 && completedCount === totalSessionCount;

  const parentData = parentSnapshot.data() || {};
  const parentWasCompleted = parentData.is_completed === true;
  const nowTimestamp = Timestamp.now();

  const progressUpdate = {
    planned_completed_count: completedCount,
    planned_session_count: totalSessionCount,
    status: allSessionsCompleted ? "completed" : "active",
    is_completed: allSessionsCompleted,
    completed_late: false,
    updatedAt: nowTimestamp,
    updated_at: nowTimestamp,
  };

  if (allSessionsCompleted) {
    // บันทึกเวลาที่ parent เสร็จเฉพาะตอนเปลี่ยนจากยังไม่เสร็จเป็นเสร็จ
    // เพื่อไม่ให้เวลาถูกเปลี่ยนทุกครั้งที่มีการคำนวณ progress ซ้ำ
    if (!parentWasCompleted) {
      progressUpdate.completedAt = nowTimestamp;
      progressUpdate.completed_at = nowTimestamp;
    }
  } else {
    // เมื่อผู้ใช้ยกเลิกสถานะเสร็จของกิจกรรมย่อยอย่างน้อยหนึ่งรอบ
    // ให้ parent กลับมาเป็น active โดยอัตโนมัติ
    progressUpdate.completedAt = null;
    progressUpdate.completed_at = null;
  }

  await updateDoc(parentDocRef, progressUpdate);
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

  // ลบ Google Event ก่อน
  await deleteLinkedGoogleCalendarEvent(task);

  // แล้วจึงลบงานใน Firestore
  const taskDocRef = getTaskDocRef(taskId);
  await deleteDoc(taskDocRef);

  if (task.parent_task_id) {
    await updateParentPlanningProgress(
      task.parent_task_id
    );
  }
};

export const deletePlanningTaskWithSessions = async (parentTaskId) => {
  if (!parentTaskId) {
    throw new Error("parent_task_id is required");
  }

  const taskRef = getTaskCollectionRef();

  const q = query(taskRef, where("parent_task_id", "==", parentTaskId));

  const snapshot = await getDocs(q);
  for (const sessionDoc of snapshot.docs) {
    const sessionTask = {
      id: sessionDoc.id,
      ...sessionDoc.data(),
    };

    await deleteLinkedGoogleCalendarEvent(
      sessionTask
    );
  }

  const parentDocRef =
    getTaskDocRef(parentTaskId);

  const parentSnapshot =
    await getDoc(parentDocRef);

  if (parentSnapshot.exists()) {
    await deleteLinkedGoogleCalendarEvent({
      id: parentSnapshot.id,
      ...parentSnapshot.data(),
    });
  }

  const batch = writeBatch(db);

  snapshot.docs.forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });

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

  for (const taskDoc of snapshot.docs) {
    const task = {
      id: taskDoc.id,
      ...taskDoc.data(),
    };

    await deleteLinkedGoogleCalendarEvent(task);
  }

  const batch = writeBatch(db);

  snapshot.docs.forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });

  await batch.commit();
};



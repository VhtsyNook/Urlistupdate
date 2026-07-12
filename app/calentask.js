import { Ionicons } from "@expo/vector-icons";
import { useRootNavigationState, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import BottomNav from "../src/components/BottomNav";
import { auth } from "../src/config/firebase";
import { COLORS } from "../src/constants/theme";
import { useLanguage } from "../src/i18n/LanguageContext";
import {
  deletePlanningTaskWithSessions,
  deleteRecurringTaskGroup,
  deleteTask,
  getFreeTimeSlots,
  listenTasks,
  rescheduleTask,
  undoTaskDone,
  updateTaskStatus,
} from "../src/services/taskService";

const TIMELINE_BASE_START_HOUR = 4;
const TIMELINE_BASE_END_HOUR = 23;
const HOUR_HEIGHT = 74;

const MONTHS_EN = [
  { label: "Jan", value: 0 },
  { label: "Feb", value: 1 },
  { label: "Mar", value: 2 },
  { label: "Apr", value: 3 },
  { label: "May", value: 4 },
  { label: "Jun", value: 5 },
  { label: "Jul", value: 6 },
  { label: "Aug", value: 7 },
  { label: "Sep", value: 8 },
  { label: "Oct", value: 9 },
  { label: "Nov", value: 10 },
  { label: "Dec", value: 11 },
];

const MONTHS_TH = [
  { label: "ม.ค.", value: 0 },
  { label: "ก.พ.", value: 1 },
  { label: "มี.ค.", value: 2 },
  { label: "เม.ย.", value: 3 },
  { label: "พ.ค.", value: 4 },
  { label: "มิ.ย.", value: 5 },
  { label: "ก.ค.", value: 6 },
  { label: "ส.ค.", value: 7 },
  { label: "ก.ย.", value: 8 },
  { label: "ต.ค.", value: 9 },
  { label: "พ.ย.", value: 10 },
  { label: "ธ.ค.", value: 11 },
];

const WEEK_DAYS_EN = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const WEEK_DAYS_TH = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];

const UI = {
  background: COLORS.background || "#F6F7FB",
  card: COLORS.card || "#FFFFFF",
  cardSoft: COLORS.cardSoft || "#F8FAFC",
  text: COLORS.text || "#111827",
  textMuted: COLORS.textMuted || "#6B7280",
  textLight: COLORS.textLight || "#FFFFFF",
  border: COLORS.border || "#E5E7EB",
  primary: COLORS.primary || "#0EA5E9",
  primaryDark: COLORS.primaryDark || "#0369A1",
  primaryLight: COLORS.primaryLight || "#E0F2FE",
  danger: COLORS.danger || "#EF4444",
  warning: COLORS.warning || "#F59E0B",
  success: COLORS.success || "#22C55E",
  completed: COLORS.completed || "#9CA3AF",
};

const STATUS_STYLES = {
  normal: {
    backgroundColor: "#EAF4FF",
    borderColor: UI.primary,
    textColor: UI.primaryDark,
    icon: "ellipse-outline",
    labelEn: "Normal",
    labelTh: "ทั่วไป",
  },
  high: {
    backgroundColor: "#FEE2E2",
    borderColor: "#DC2626",
    textColor: "#991B1B",
    icon: "flag-outline",
    labelEn: "High",
    labelTh: "สูง",
  },
  medium: {
    backgroundColor: "#FEF3C7",
    borderColor: "#D97706",
    textColor: "#92400E",
    icon: "alert-outline",
    labelEn: "Medium",
    labelTh: "ปานกลาง",
  },
  low: {
    backgroundColor: "#DCFCE7",
    borderColor: "#16A34A",
    textColor: "#166534",
    icon: "leaf-outline",
    labelEn: "Low",
    labelTh: "ต่ำ",
  },
  planning: {
    backgroundColor: "#F3E8FF",
    borderColor: "#7C3AED",
    textColor: "#5B21B6",
    icon: "layers-outline",
    labelEn: "Planning",
    labelTh: "วางแผน",
  },
  conflict: {
    backgroundColor: "#FEE2E2",
    borderColor: "#991B1B",
    textColor: "#7F1D1D",
    icon: "alert-circle-outline",
    labelEn: "Conflict",
    labelTh: "เวลาทับซ้อน",
  },
  overdue: {
    backgroundColor: "#FFE4E6",
    borderColor: "#E11D48",
    textColor: "#9F1239",
    icon: "time-outline",
    labelEn: "Overdue",
    labelTh: "เลยเวลา",
  },
  completed: {
    backgroundColor: "#F3F4F6",
    borderColor: "#9CA3AF",
    textColor: "#6B7280",
    icon: "checkmark-done-outline",
    labelEn: "Completed",
    labelTh: "เสร็จแล้ว",
  },
  completedLate: {
    backgroundColor: "#FEE2E2",
    borderColor: "#EF4444",
    textColor: "#991B1B",
    icon: "checkmark-circle-outline",
    labelEn: "Completed Late",
    labelTh: "เสร็จล่าช้า",
  },
};

const normalizeDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const isValidDate = (value) => {
  return value instanceof Date && !Number.isNaN(value.getTime());
};

const getDayStart = (date) => {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
};

const getDayEnd = (date) => {
  const day = new Date(date);
  day.setHours(23, 59, 59, 999);
  return day;
};

const isSameDay = (a, b) => {
  const dateA = normalizeDate(a);
  const dateB = normalizeDate(b);

  if (!isValidDate(dateA) || !isValidDate(dateB)) return false;

  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
};

const isTaskOverlappingDay = (task, date) => {
  const startTime = normalizeDate(task?.start_time);
  const endTime = normalizeDate(task?.end_time);

  if (!isValidDate(startTime) || !isValidDate(endTime)) return false;

  const dayStart = getDayStart(date);
  const dayEnd = getDayEnd(date);

  return startTime <= dayEnd && endTime >= dayStart;
};

const getTaskClippedRangeForDay = (task, date) => {
  const startTime = normalizeDate(task?.start_time);
  const endTime = normalizeDate(task?.end_time);

  if (!isValidDate(startTime) || !isValidDate(endTime)) {
    return {
      start: null,
      end: null,
    };
  }

  const dayStart = getDayStart(date);
  const dayEnd = new Date(date);
  dayEnd.setHours(24, 0, 0, 0);

  return {
    start: startTime < dayStart ? dayStart : startTime,
    end: endTime > dayEnd ? dayEnd : endTime,
  };
};

const isCompletedLateTask = (task) => {
  if (!task?.is_completed) return false;

  if (task.completed_late === true) return true;

  const endDate = normalizeDate(task.end_time);
  const completedDate =
    normalizeDate(task.completed_at) ||
    normalizeDate(task.completedAt) ||
    normalizeDate(task.completed_time);

  if (!isValidDate(endDate) || !isValidDate(completedDate)) return false;

  return completedDate.getTime() > endDate.getTime();
};

const isOverdueTask = (task) => {
  if (!task || task.is_completed === true) return false;

  const endDate = normalizeDate(task.end_time);
  if (!isValidDate(endDate)) return false;

  return endDate.getTime() <= Date.now();
};

const getTaskVisualStyle = (task) => {
  if (isCompletedLateTask(task)) return STATUS_STYLES.completedLate;
  if (task?.is_completed) return STATUS_STYLES.completed;
  if (isOverdueTask(task)) return STATUS_STYLES.overdue;
  if (task?.has_conflict) return STATUS_STYLES.conflict;
  if (task?.is_generated_session || task?.planning_enabled) {
    return STATUS_STYLES.planning;
  }

  const priority = String(task?.priority || "normal").toLowerCase();

  if (priority === "high") return STATUS_STYLES.high;
  if (priority === "medium") return STATUS_STYLES.medium;
  if (priority === "low") return STATUS_STYLES.low;

  return STATUS_STYLES.normal;
};

const isSameCalendarDay = (startValue, endValue) => {
  const startDate = normalizeDate(startValue);
  const endDate = normalizeDate(endValue);

  if (!isValidDate(startDate) || !isValidDate(endDate)) return true;

  return (
    startDate.getFullYear() === endDate.getFullYear() &&
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getDate() === endDate.getDate()
  );
};

const buildMonthDays = (year, month) => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days = [];

  // Monday-first calendar:
  // JS getDay(): Sun=0, Mon=1, Tue=2, ..., Sat=6
  // Convert to: Mon=0, Tue=1, ..., Sun=6
  const mondayBasedStart = (firstDay.getDay() + 6) % 7;

  for (let i = 0; i < mondayBasedStart; i++) {
    days.push(null);
  }

  for (let day = 1; day <= lastDay.getDate(); day++) {
    days.push(new Date(year, month, day));
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
};

export default function Calendar() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { language } = useLanguage();

  const isThai = language === "th";
  const locale = isThai ? "th-TH" : "en-US";
  const text = useCallback(
    (en, th) => (isThai ? th : en),
    [isThai]
  );
  const MONTHS = isThai ? MONTHS_TH : MONTHS_EN;
  const WEEK_DAYS = isThai ? WEEK_DAYS_TH : WEEK_DAYS_EN;

  const today = new Date();

  const minDate = new Date(today.getFullYear(), today.getMonth() - 120, 1);
  //const maxDate = new Date(today.getFullYear(), today.getMonth() + 120, 1);
  const maxDate = new Date(2040, 11, 1);

  const [currentDate, setCurrentDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [tasks, setTasks] = useState([]);

  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteTargetTask, setDeleteTargetTask] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [rescheduleModalVisible, setRescheduleModalVisible] = useState(false);
  const [rescheduleTargetTask, setRescheduleTargetTask] = useState(null);
  const [isRescheduling, setIsRescheduling] = useState(false);

  const [smartRescheduleModalVisible, setSmartRescheduleModalVisible] =
    useState(false);
  const [isLoadingSmartReschedule, setIsLoadingSmartReschedule] =
    useState(false);
  const [smartRescheduleSlots, setSmartRescheduleSlots] = useState([]);
  const [smartRescheduleMessage, setSmartRescheduleMessage] = useState("");

  const [monthPickerVisible, setMonthPickerVisible] = useState(false);
  const [tempMonth, setTempMonth] = useState(currentDate.getMonth());
  const [tempYear, setTempYear] = useState(currentDate.getFullYear());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const formatTime = (value) => {
    const date = normalizeDate(value);
    if (!isValidDate(date)) return "-";

    return date.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatFullDate = (value) => {
    const date = normalizeDate(value);
    if (!isValidDate(date)) return "-";

    return date.toLocaleDateString(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatMonthYear = (date) => {
    return date.toLocaleDateString(locale, {
      month: "long",
      year: "numeric",
    });
  };

  const formatSelectedDateTitle = (date) => {
    return date.toLocaleDateString(locale, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  };

  const formatTaskDateTimeRange = (startValue, endValue) => {
    const startDate = normalizeDate(startValue);
    const endDate = normalizeDate(endValue);

    if (!isValidDate(startDate) || !isValidDate(endDate)) return "-";

    if (isSameCalendarDay(startDate, endDate)) {
      return `${formatFullDate(startDate)} · ${formatTime(
        startDate
      )} - ${formatTime(endDate)}`;
    }

    return `${formatFullDate(startDate)} ${formatTime(
      startDate
    )} - ${formatFullDate(endDate)} ${formatTime(endDate)}`;
  };

  const getRepeatLabel = (task) => {
    if (task?.is_generated_session) {
      return text("Planning Session", "เซสชันวางแผน");
    }

    if (task?.planning_enabled) {
      return `${task.planned_completed_count || 0}/${task.planned_session_count || 0
        } ${text("sessions", "เซสชัน")}`;
    }

    if (!task?.is_recurring) {
      return text("Does not repeat", "ไม่ทำซ้ำ");
    }

    const type = String(task.recurrence_type || "").toLowerCase();
    const weekdayLabels = isThai
      ? ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const selectedWeekdays = Array.isArray(task.recurrence_weekdays)
      ? task.recurrence_weekdays
        .map((day) => Number(day))
        .filter((day) => day >= 0 && day <= 6)
        .sort((a, b) => a - b)
      : [];

    const weekdayText =
      selectedWeekdays.length > 0
        ? selectedWeekdays.map((day) => weekdayLabels[day]).join(", ")
        : "";

    if (type === "everyday" || type === "daily") {
      return text("Daily", "ทุกวัน");
    }

    if (type === "custom" || type === "custom_days") {
      return isThai
        ? `ทุก ${task.recurrence_interval_days || "-"} วัน`
        : `Every ${task.recurrence_interval_days || "-"} day(s)`;
    }

    if (type === "everyweek" || type === "weekly") {
      const interval = Number(task.recurrence_week_interval) || 1;

      if (interval === 1) {
        return isThai
          ? `รายสัปดาห์${weekdayText ? `: ${weekdayText}` : ""}`
          : `Weekly${weekdayText ? ` on ${weekdayText}` : ""}`;
      }

      return isThai
        ? `ทุก ${interval} สัปดาห์${weekdayText ? `: ${weekdayText}` : ""}`
        : `Every ${interval} weeks${weekdayText ? ` on ${weekdayText}` : ""}`;
    }

    if (type === "monthly") {
      const interval = Number(task.recurrence_month_interval) || 1;
      const monthDay = task.recurrence_month_day || "-";

      if (interval === 1) {
        return isThai
          ? `รายเดือน วันที่ ${monthDay}`
          : `Monthly on day ${monthDay}`;
      }

      return isThai
        ? `ทุก ${interval} เดือน วันที่ ${monthDay}`
        : `Every ${interval} months on day ${monthDay}`;
    }

    return text("Repeat", "ทำซ้ำ");
  };

  const getPriorityLabel = (priority) => {
    const value = String(priority || "Normal").toLowerCase();

    if (value === "high") return text("High", "สูง");
    if (value === "medium") return text("Medium", "ปานกลาง");
    if (value === "low") return text("Low", "ต่ำ");

    return text("Normal", "ทั่วไป");
  };

  const getStatusLabel = (taskStyle) => {
    return isThai ? taskStyle.labelTh : taskStyle.labelEn;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!rootNavigationState?.key || !isAuthReady) return;

    if (!user) {
      setTasks([]);
      router.replace("/login");
    }
  }, [rootNavigationState?.key, isAuthReady, user, router]);

  useEffect(() => {
    if (!isAuthReady) return;

    if (!user?.uid) {
      setTasks([]);
      return;
    }

    let unsubscribe = () => { };

    try {
      unsubscribe = listenTasks((data) => {
        setTasks(Array.isArray(data) ? data : []);
      });
    } catch (error) {
      console.error("Listen calendar tasks error:", error);

      if (error?.message === "AUTH_REQUIRED") {
        router.replace("/login");
        return;
      }

      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text("Unable to load calendar tasks.", "ไม่สามารถโหลดกิจกรรมในปฏิทินได้")
      );
    }

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [isAuthReady, user?.uid, router, text]);

  const ensureLoggedIn = () => {
    if (!auth.currentUser) {
      Alert.alert(
        text("Login Required", "กรุณาเข้าสู่ระบบ"),
        text(
          "Please log in before using this feature.",
          "กรุณาเข้าสู่ระบบก่อนใช้งาน"
        )
      );
      router.replace("/login");
      return false;
    }

    return true;
  };

  const canGoPrev = currentDate > minDate;
  const canGoNext = currentDate < maxDate;

  const buildYearOptions = () => {
    const years = [];
    const minYear = minDate.getFullYear();
    const maxYear = maxDate.getFullYear();

    for (let y = minYear; y <= maxYear; y++) {
      years.push(y);
    }

    return years;
  };

  const yearOptions = buildYearOptions();

  const changeMonth = (value) => {
    const nextDate = new Date(year, month + value, 1);

    if (nextDate < minDate || nextDate > maxDate) return;

    setCurrentDate(nextDate);
    setSelectedDate(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
    setSelectedTaskId(null);
  };

  const goToToday = () => {
    const now = new Date();
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(now);
    setSelectedTaskId(null);
  };

  const openMonthPicker = () => {
    setTempMonth(currentDate.getMonth());
    setTempYear(currentDate.getFullYear());
    setMonthPickerVisible(true);
  };

  const closeMonthPicker = () => {
    setMonthPickerVisible(false);
  };

  const applyMonthPicker = () => {
    const nextDate = new Date(tempYear, tempMonth, 1);

    if (nextDate < minDate || nextDate > maxDate) {
      Alert.alert(
        text("Invalid date", "วันที่ไม่ถูกต้อง"),
        text(
          "This month is outside the allowed range.",
          "เดือนนี้อยู่นอกช่วงที่ระบบอนุญาต"
        )
      );
      return;
    }

    setCurrentDate(nextDate);
    setSelectedDate(nextDate);
    setSelectedTaskId(null);
    setMonthPickerVisible(false);
  };

  const handleAddTask = () => {
    if (!ensureLoggedIn()) return;

    router.push({
      pathname: "/add-task",
      params: {
        from: "calendar",
        selectedDate: selectedDate.toISOString(),
      },
    });
  };

  const handleEditTask = (task) => {
    if (!ensureLoggedIn()) return;

    const taskId = task?.id || task?.task_id;

    if (!taskId) {
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text("Task ID not found.", "ไม่พบรหัสกิจกรรม")
      );
      return;
    }

    router.push({
      pathname: "/edit-task",
      params: {
        id: String(taskId),
        from: "calendar",
      },
    });
  };

  const getTaskDurationMinutes = (task) => {
    const startTime = normalizeDate(task?.start_time);
    const endTime = normalizeDate(task?.end_time);

    if (!isValidDate(startTime) || !isValidDate(endTime)) return 60;

    const duration = Math.round(
      (endTime.getTime() - startTime.getTime()) / (1000 * 60)
    );

    return Math.max(15, duration);
  };

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

  const openRescheduleModal = (task) => {
    if (!ensureLoggedIn()) return;

    const taskId = task?.id || task?.task_id;

    if (!taskId) {
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text("Task ID not found.", "ไม่พบรหัสกิจกรรม")
      );
      return;
    }

    setRescheduleTargetTask(task);
    setRescheduleModalVisible(true);
  };

  const closeRescheduleModal = () => {
    if (isRescheduling || isLoadingSmartReschedule) return;

    setRescheduleModalVisible(false);
    setRescheduleTargetTask(null);
  };

  const buildQuickRescheduleRange = (task, mode) => {
    const durationMinutes = getTaskDurationMinutes(task);
    const originalStart = normalizeDate(task?.start_time) || new Date();
    const now = new Date();

    const moveAfterLunchIfOverlap = (startDate, durationMinutesValue) => {
      const endDate = new Date(startDate);
      endDate.setMinutes(endDate.getMinutes() + durationMinutesValue);

      const lunchStart = new Date(startDate);
      lunchStart.setHours(12, 0, 0, 0);

      const lunchEnd = new Date(startDate);
      lunchEnd.setHours(13, 0, 0, 0);

      const overlapsLunch = startDate < lunchEnd && endDate > lunchStart;

      if (!overlapsLunch) {
        return startDate;
      }

      return roundUpToNextStep(lunchEnd, 15);
    };

    let newStart;

    if (mode === "today") {
      newStart = roundUpToNextStep(now, 15);
      newStart = moveAfterLunchIfOverlap(newStart, durationMinutes);
    } else {
      newStart = new Date(now);
      newStart.setDate(now.getDate() + 1);
      newStart.setHours(
        originalStart.getHours(),
        originalStart.getMinutes(),
        0,
        0
      );

      newStart = moveAfterLunchIfOverlap(newStart, durationMinutes);
    }

    const newEnd = new Date(newStart);
    newEnd.setMinutes(newEnd.getMinutes() + durationMinutes);

    return {
      newStart,
      newEnd,
    };
  };

  const performQuickReschedule = async (mode) => {
    if (!ensureLoggedIn()) return;
    if (!rescheduleTargetTask?.id || isRescheduling) return;

    try {
      setIsRescheduling(true);

      const { newStart, newEnd } = buildQuickRescheduleRange(
        rescheduleTargetTask,
        mode
      );

      const result = await rescheduleTask(
        rescheduleTargetTask.id,
        newStart,
        newEnd
      );

      if (result?.success === false && result?.has_conflict) {
        Alert.alert(
          text("Time Conflict", "เวลาทับซ้อน"),
          text(
            "The selected time overlaps with another task. Please choose a different time.",
            "เวลาที่เลือกทับซ้อนกับกิจกรรมอื่น กรุณาเลือกเวลาใหม่"
          )
        );
        return;
      }

      setSelectedTaskId(null);
      setRescheduleModalVisible(false);
      setRescheduleTargetTask(null);
    } catch (error) {
      console.error("Calendar quick reschedule error:", error);
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text(
          "Unable to reschedule this task.",
          "ไม่สามารถจัดเวลาใหม่ให้กิจกรรมนี้ได้"
        )
      );
    } finally {
      setIsRescheduling(false);
    }
  };

  const openPickNewTime = () => {
    if (!rescheduleTargetTask?.id) return;

    const taskId = rescheduleTargetTask.id;

    setRescheduleModalVisible(false);
    setRescheduleTargetTask(null);

    router.push({
      pathname: "/edit-task",
      params: {
        id: String(taskId),
        from: "reschedule",
      },
    });
  };

  const openSmartRescheduleModal = async () => {
    if (!ensureLoggedIn()) return;
    if (!rescheduleTargetTask?.id || isLoadingSmartReschedule) return;

    try {
      setIsLoadingSmartReschedule(true);
      setSmartRescheduleSlots([]);
      setSmartRescheduleMessage("");
      setSmartRescheduleModalVisible(true);

      const durationMinutes = getTaskDurationMinutes(rescheduleTargetTask);

      const SMART_SEARCH_DAY_COUNT = 7;
      const SMART_DAY_START_HOUR = 8;
      const SMART_DAY_END_HOUR = 22;
      const SMART_BUFFER_MINUTES = 15;
      const SMART_MAX_TOTAL_SLOTS = 8;
      const SMART_MAX_SLOTS_PER_DAY = 8;

      // ทำให้ slot ไม่ซ้อนกันเอง
      const smartSlotStepMinutes = durationMinutes + SMART_BUFFER_MINUTES;

      const collectedSlots = [];

      for (let dayOffset = 0; dayOffset < SMART_SEARCH_DAY_COUNT; dayOffset++) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + dayOffset);

        const result = await getFreeTimeSlots({
          targetDate,
          durationMinutes,
          dayStartHour: SMART_DAY_START_HOUR,
          dayEndHour: SMART_DAY_END_HOUR,
          bufferMinutes: SMART_BUFFER_MINUTES,
          maxSlots: SMART_MAX_SLOTS_PER_DAY,
          includePastTime: false,
          slotStepMinutes: smartSlotStepMinutes,
        });

        if (Array.isArray(result?.slots) && result.slots.length > 0) {
          collectedSlots.push(...result.slots);
        }

        if (collectedSlots.length >= SMART_MAX_TOTAL_SLOTS) {
          break;
        }
      }

      const limitedSlots = collectedSlots.slice(0, SMART_MAX_TOTAL_SLOTS);

      setSmartRescheduleSlots(limitedSlots);

      if (limitedSlots.length === 0) {
        setSmartRescheduleMessage("NO_SUITABLE_TIME_NEXT_7_DAYS");
      } else {
        setSmartRescheduleMessage("");
      }
    } catch (error) {
      console.error("Calendar smart reschedule error:", error);
      setSmartRescheduleMessage("SMART_RESCHEDULE_ERROR");
      setSmartRescheduleSlots([]);
    } finally {
      setIsLoadingSmartReschedule(false);
    }
  };

  const closeSmartRescheduleModal = () => {
    if (isLoadingSmartReschedule || isRescheduling) return;

    setSmartRescheduleModalVisible(false);
  };

  const applySmartRescheduleSlot = async (slot) => {
    if (!ensureLoggedIn()) return;
    if (!rescheduleTargetTask?.id || isRescheduling) return;

    const suggestedStart =
      normalizeDate(slot?.suggested_start_time) || normalizeDate(slot?.start_time);
    const suggestedEnd =
      normalizeDate(slot?.suggested_end_time) || normalizeDate(slot?.end_time);

    if (!isValidDate(suggestedStart) || !isValidDate(suggestedEnd)) {
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text("Invalid selected time.", "เวลาที่เลือกไม่ถูกต้อง")
      );
      return;
    }

    try {
      setIsRescheduling(true);

      const result = await rescheduleTask(
        rescheduleTargetTask.id,
        suggestedStart,
        suggestedEnd
      );

      if (result?.success === false && result?.has_conflict) {
        Alert.alert(
          text("Time Conflict", "เวลาทับซ้อน"),
          text(
            "The selected time overlaps with another task. Please choose a different time.",
            "เวลาที่เลือกทับซ้อนกับกิจกรรมอื่น กรุณาเลือกเวลาใหม่"
          )
        );
        return;
      }

      setSelectedTaskId(null);
      setSmartRescheduleModalVisible(false);
      setRescheduleModalVisible(false);
      setRescheduleTargetTask(null);
    } catch (error) {
      console.error("Apply smart reschedule slot error:", error);
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text(
          "Unable to reschedule this task.",
          "ไม่สามารถจัดเวลาใหม่ให้กิจกรรมนี้ได้"
        )
      );
    } finally {
      setIsRescheduling(false);
    }
  };
  const handleDoneTask = async (taskId) => {
    if (!ensureLoggedIn()) return;

    try {
      await updateTaskStatus(taskId, "completed");
      setSelectedTaskId(null);
    } catch (error) {
      console.error("Done task error:", error);
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text("Unable to update task status.", "ไม่สามารถอัปเดตสถานะกิจกรรมได้")
      );
    }
  };

  const handleUndoCompletedTask = async (taskId) => {
    if (!ensureLoggedIn()) return;

    try {
      await undoTaskDone(taskId);
      setSelectedTaskId(null);
    } catch (error) {
      console.error("Undo completed task error:", error);
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text("Unable to restore this task.", "ไม่สามารถกู้คืนกิจกรรมนี้ได้")
      );
    }
  };

  const openDeleteModal = (task) => {
    if (!ensureLoggedIn()) return;

    setDeleteTargetTask(task);
    setDeleteModalVisible(true);
  };

  const closeDeleteModal = () => {
    if (isDeleting) return;

    setDeleteModalVisible(false);
    setDeleteTargetTask(null);
  };

  const performDeleteSingleTask = async () => {
    if (!ensureLoggedIn()) return;
    if (!deleteTargetTask?.id || isDeleting) return;

    try {
      setIsDeleting(true);
      await deleteTask(deleteTargetTask.id);
      setSelectedTaskId(null);
      closeDeleteModal();
    } catch (error) {
      console.error("Delete single task error:", error);
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text("Unable to delete this task.", "ไม่สามารถลบกิจกรรมนี้ได้")
      );
    } finally {
      setIsDeleting(false);
      setDeleteModalVisible(false);
      setDeleteTargetTask(null);
    }
  };

  const performDeleteRecurringGroup = async () => {
    if (!ensureLoggedIn()) return;
    if (!deleteTargetTask?.recurrence_group_id || isDeleting) return;

    try {
      setIsDeleting(true);
      await deleteRecurringTaskGroup(deleteTargetTask.recurrence_group_id);
      setSelectedTaskId(null);
      closeDeleteModal();
    } catch (error) {
      console.error("Delete recurring group error:", error);
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text("Unable to delete recurring tasks.", "ไม่สามารถลบกิจกรรมที่ทำซ้ำได้")
      );
    } finally {
      setIsDeleting(false);
      setDeleteModalVisible(false);
      setDeleteTargetTask(null);
    }
  };

  const performDeletePlanningWithSessions = async () => {
    if (!ensureLoggedIn()) return;
    if (!deleteTargetTask?.id || isDeleting) return;

    try {
      setIsDeleting(true);
      await deletePlanningTaskWithSessions(deleteTargetTask.id);
      setSelectedTaskId(null);
      closeDeleteModal();
    } catch (error) {
      console.error("Delete planning task error:", error);
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text(
          "Unable to delete planning task and sessions.",
          "ไม่สามารถลบกิจกรรมแบบวางแผนและเซสชันย่อยได้"
        )
      );
    } finally {
      setIsDeleting(false);
      setDeleteModalVisible(false);
      setDeleteTargetTask(null);
    }
  };

  const getDeleteModalTitle = () => {
    if (!deleteTargetTask) return text("Delete Task", "ลบกิจกรรม");

    if (deleteTargetTask.planning_enabled) {
      return text("Delete Planning Task", "ลบกิจกรรมแบบวางแผน");
    }

    if (deleteTargetTask.is_generated_session) {
      return text("Delete Planning Session", "ลบเซสชันวางแผน");
    }

    if (deleteTargetTask.is_recurring) {
      return text("Delete Recurring Task", "ลบกิจกรรมที่ทำซ้ำ");
    }

    return text("Delete Task", "ลบกิจกรรม");
  };

  const getDeleteModalMessage = () => {
    if (!deleteTargetTask) return "";

    if (deleteTargetTask.planning_enabled) {
      return text(
        "This task has generated planning sessions. What do you want to delete?",
        "กิจกรรมนี้มีเซสชันย่อยที่ระบบสร้างไว้ ต้องการลบแบบใด?"
      );
    }

    if (deleteTargetTask.is_generated_session) {
      return text(
        "This is a generated planning session. Do you want to delete only this session?",
        "นี่คือเซสชันวางแผนที่ระบบสร้างขึ้น ต้องการลบเฉพาะเซสชันนี้หรือไม่?"
      );
    }

    if (deleteTargetTask.is_recurring) {
      return text(
        "This is a recurring task. What do you want to delete?",
        "นี่คือกิจกรรมที่ทำซ้ำ ต้องการลบแบบใด?"
      );
    }

    return text(
      "Are you sure you want to delete this task?",
      "ยืนยันว่าต้องการลบกิจกรรมนี้หรือไม่?"
    );
  };

  const monthDays = useMemo(() => {
    return buildMonthDays(year, month);
  }, [year, month]);

  const tasksForDay = (date, includeCompleted = true) => {
    return tasks
      .filter((task) => {
        if (!task) return false;

        if (!includeCompleted && task.is_completed) return false;

        // ไม่แสดง parent planning task ใน Calendar timeline
        // เพราะ parent เป็นงานหลัก/ตัวสรุป ส่วนเวลาทำจริงคือ session ย่อย
        if (task.planning_enabled === true && task.is_generated_session !== true) {
          return false;
        }

        return isTaskOverlappingDay(task, date);
      })
      .sort((a, b) => {
        const aRange = getTaskClippedRangeForDay(a, date);
        const bRange = getTaskClippedRangeForDay(b, date);

        const timeA = aRange.start?.getTime() || 0;
        const timeB = bRange.start?.getTime() || 0;

        return timeA - timeB;
      });
  };

  const selectedDayTasks = useMemo(() => {
    return tasksForDay(selectedDate, true);
  }, [tasks, selectedDate]);

  const selectedTask = useMemo(() => {
    return selectedDayTasks.find((task) => task.id === selectedTaskId) || null;
  }, [selectedDayTasks, selectedTaskId]);

  const completedSelectedTasks = selectedDayTasks.filter(
    (task) => task.is_completed
  );

  const getTimelineBounds = () => {
    let startHour = TIMELINE_BASE_START_HOUR;
    let endHour = TIMELINE_BASE_END_HOUR;

    selectedDayTasks.forEach((task) => {
      const range = getTaskClippedRangeForDay(task, selectedDate);

      if (!isValidDate(range.start) || !isValidDate(range.end)) return;

      startHour = Math.min(startHour, range.start.getHours());

      const end = new Date(range.end);
      const endDecimal = end.getHours() + end.getMinutes() / 60;

      if (endDecimal > endHour) {
        endHour = Math.min(24, Math.ceil(endDecimal));
      }
    });

    if (endHour <= startHour) {
      endHour = startHour + 1;
    }

    return {
      startHour,
      endHour,
    };
  };

  const timelineBounds = getTimelineBounds();
  const timelineHours = [];

  for (
    let hour = timelineBounds.startHour;
    hour <= timelineBounds.endHour;
    hour++
  ) {
    timelineHours.push(hour);
  }

  const timelineHeight = Math.max(
    1,
    (timelineBounds.endHour - timelineBounds.startHour) * HOUR_HEIGHT
  );

  const getTimelineTaskLayout = (task) => {
    const range = getTaskClippedRangeForDay(task, selectedDate);

    if (!isValidDate(range.start) || !isValidDate(range.end)) {
      return {
        top: 0,
        height: 58,
      };
    }

    const startMinutes =
      (range.start.getHours() - timelineBounds.startHour) * 60 +
      range.start.getMinutes();

    const durationMinutes = Math.max(
      20,
      Math.round((range.end.getTime() - range.start.getTime()) / (1000 * 60))
    );

    return {
      top: Math.max(0, (startMinutes / 60) * HOUR_HEIGHT),
      height: Math.max(58, (durationMinutes / 60) * HOUR_HEIGHT),
    };
  };

  const renderDayCell = (date, index) => {
    if (!date) {
      return <View key={`empty-${index}`} style={styles.dayCellEmpty} />;
    }

    const dayTasks = tasksForDay(date, true);
    const isCurrentDay = isSameDay(date, today);
    const isSelected = isSameDay(date, selectedDate);
    const visibleDots = dayTasks.slice(0, 3);

    return (
      <Pressable
        key={date.toISOString()}
        style={[styles.dayCell, isSelected && styles.dayCellSelected]}
        onPress={() => {
          setSelectedDate(date);
          setSelectedTaskId(null);
        }}
      >
        <View
          style={[
            styles.dayNumberCircle,
            isCurrentDay && styles.todayCircle,
            isSelected && styles.selectedCircle,
          ]}
        >
          <Text
            style={[
              styles.dayNumber,
              isCurrentDay && styles.todayNumber,
              isSelected && styles.selectedNumber,
            ]}
          >
            {date.getDate()}
          </Text>
        </View>

        <View style={styles.dotRow}>
          {visibleDots.map((task) => {
            const taskStyle = getTaskVisualStyle(task);

            return (
              <View
                key={task.id}
                style={[
                  styles.taskDot,
                  { backgroundColor: taskStyle.borderColor },
                ]}
              />
            );
          })}
        </View>

        {dayTasks.length > 3 ? (
          <Text style={styles.dayCountText}>
            {dayTasks.length} {text("tasks", "กิจกรรม")}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  const renderTimelineTask = (task) => {
    const taskStyle = getTaskVisualStyle(task);
    const layout = getTimelineTaskLayout(task);
    const clippedRange = getTaskClippedRangeForDay(task, selectedDate);
    const isSelected = selectedTaskId === task.id;

    return (
      <Pressable
        key={task.id}
        style={[
          styles.timelineTask,
          {
            top: layout.top,
            height: Math.max(58, layout.height - 8),
            backgroundColor: taskStyle.backgroundColor,
            borderColor: taskStyle.borderColor,
          },
          isSelected && styles.timelineTaskSelected,
        ]}
        onPress={() => setSelectedTaskId(task.id)}
      >
        <View style={styles.timelineTaskHeader}>
          <Text
            style={[styles.timelineTaskTitle, { color: taskStyle.textColor }]}
            numberOfLines={1}
          >
            {task.title || text("Untitled Task", "ไม่มีชื่อกิจกรรม")}
          </Text>

          {task.has_conflict ? (
            <Ionicons
              name="alert-circle-outline"
              size={16}
              color={taskStyle.textColor}
            />
          ) : null}
        </View>

        <Text style={[styles.timelineTaskTime, { color: taskStyle.textColor }]}>
          {formatTime(clippedRange.start)} - {formatTime(clippedRange.end)}
        </Text>

        <View style={styles.timelineTagRow}>
          <View style={styles.smallStatusTag}>
            <Ionicons
              name={taskStyle.icon}
              size={12}
              color={taskStyle.textColor}
            />
            <Text
              style={[styles.smallStatusTagText, { color: taskStyle.textColor }]}
            >
              {getStatusLabel(taskStyle)}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  if (!rootNavigationState?.key || !isAuthReady) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>
          {text("Loading...", "กำลังโหลด...")}
        </Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>
          {text("Redirecting to login...", "กำลังไปยังหน้าเข้าสู่ระบบ...")}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <Pressable
              style={styles.monthNavButton}
              onPress={() => changeMonth(-1)}
              disabled={!canGoPrev}
            >
              <Ionicons
                name="chevron-back"
                size={22}
                color={canGoPrev ? UI.text : UI.completed}
              />
            </Pressable>

            <Pressable style={styles.monthTitleButton} onPress={openMonthPicker}>
              <Text style={styles.monthTitle}>{formatMonthYear(currentDate)}</Text>
              <Ionicons name="chevron-down" size={18} color={UI.textMuted} />
            </Pressable>

            <Pressable
              style={styles.monthNavButton}
              onPress={() => changeMonth(1)}
              disabled={!canGoNext}
            >
              <Ionicons
                name="chevron-forward"
                size={22}
                color={canGoNext ? UI.text : UI.completed}
              />
            </Pressable>
          </View>

          <View style={styles.headerActionRow}>
            <Pressable style={styles.todayButton} onPress={goToToday}>
              <Ionicons
                name="calendar-outline"
                size={16}
                color={UI.primaryDark}
              />
              <Text style={styles.todayButtonText}>
                {text("Today", "วันนี้")}
              </Text>
            </Pressable>

          </View>
        </View>

        <View style={styles.weekRow}>
          {WEEK_DAYS.map((day) => (
            <Text key={day} style={styles.weekText}>
              {day}
            </Text>
          ))}
        </View>

        <View style={styles.calendarGrid}>
          {monthDays.map((date, index) => renderDayCell(date, index))}
        </View>

        <View style={styles.dayPanel}>
          <View style={styles.dayPanelHeader}>
            <View>
              <Text style={styles.dayPanelTitle}>
                {formatSelectedDateTitle(selectedDate)}
              </Text>
              <Text style={styles.dayPanelSubtitle}>
                {selectedDayTasks.length} {text("task(s)", "กิจกรรม")} ·{" "}
                {completedSelectedTasks.length} {text("done", "เสร็จแล้ว")}
              </Text>
            </View>
          </View>

          {selectedDayTasks.length === 0 ? (
            <View style={styles.emptyDayCard}>
              <Ionicons
                name="calendar-clear-outline"
                size={34}
                color={UI.textMuted}
              />
              <Text style={styles.emptyDayTitle}>
                {text("No tasks on this day", "วันนี้ไม่มีกิจกรรม")}
              </Text>
              <Text style={styles.emptyDayText}>
                {text(
                  "Tap Add Task to create a new schedule.",
                  "กดเพิ่มกิจกรรมเพื่อสร้างตารางใหม่"
                )}
              </Text>
            </View>
          ) : (

            <View style={styles.timelineWrapper}>
              <ScrollView
                style={styles.timelineScrollBox}
                nestedScrollEnabled={true}
                showsVerticalScrollIndicator={true}
              >
                <View style={[styles.timelineCanvas, { height: timelineHeight }]}>
                  {timelineHours.map((hour) => {
                    const isLast = hour === timelineBounds.endHour;
                    const top = (hour - timelineBounds.startHour) * HOUR_HEIGHT;

                    return (
                      <View key={hour} style={[styles.hourRow, { top }]}>
                        <Text style={styles.hourLabel}>
                          {String(hour).padStart(2, "0")}:00
                        </Text>
                        <View
                          style={[
                            styles.hourLine,
                            isLast && styles.hourLineMuted,
                          ]}
                        />
                      </View>
                    );
                  })}

                  {selectedDayTasks.map(renderTimelineTask)}
                </View>
              </ScrollView>
            </View>

          )}
        </View>
      </ScrollView>

      <Modal
        visible={!!selectedTask}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedTaskId(null)}
      >
        <Pressable
          style={styles.taskDetailOverlay}
          onPress={() => setSelectedTaskId(null)}
        >
          <Pressable
            style={styles.taskDetailModalBox}
            onPress={(event) => event.stopPropagation()}
          >
            {selectedTask ? (
              <View style={styles.selectedTaskPanel}>
                <View style={styles.selectedTaskHeader}>
                  <View
                    style={[
                      styles.selectedTaskIcon,
                      {
                        backgroundColor:
                          getTaskVisualStyle(selectedTask).backgroundColor,
                      },
                    ]}
                  >
                    <Ionicons
                      name={getTaskVisualStyle(selectedTask).icon}
                      size={22}
                      color={getTaskVisualStyle(selectedTask).textColor}
                    />
                  </View>

                  <View style={styles.selectedTaskTextBox}>
                    <Text style={styles.selectedTaskTitle} numberOfLines={2}>
                      {selectedTask.title || text("Untitled Task", "ไม่มีชื่อกิจกรรม")}
                    </Text>
                    <Text style={styles.selectedTaskTime}>
                      {formatTaskDateTimeRange(
                        selectedTask.start_time,
                        selectedTask.end_time
                      )}
                    </Text>
                  </View>

                  <Pressable
                    style={styles.taskDetailCloseButton}
                    onPress={() => setSelectedTaskId(null)}
                  >
                    <Ionicons name="close" size={22} color={UI.textMuted} />
                  </Pressable>
                </View>

                {selectedTask.detail ? (
                  <Text style={styles.selectedTaskDetail}>
                    {selectedTask.detail}
                  </Text>
                ) : null}

                <View style={styles.infoTagRow}>
                  <View style={styles.infoTag}>
                    <Text style={styles.infoTagText}>
                      {text("Priority", "ความสำคัญ")}:{" "}
                      {getPriorityLabel(selectedTask.priority)}
                    </Text>
                  </View>

                  <View style={styles.infoTag}>
                    <Text style={styles.infoTagText}>
                      {text("Repeat", "การทำซ้ำ")}: {getRepeatLabel(selectedTask)}
                    </Text>
                  </View>

                  {selectedTask.has_conflict ? (
                    <View style={[styles.infoTag, styles.conflictInfoTag]}>
                      <Text style={styles.conflictInfoText}>
                        {text("Conflict", "เวลาทับซ้อน")}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {isOverdueTask(selectedTask) && !selectedTask.is_completed ? (
                  <Pressable
                    style={styles.modalRescheduleButton}
                    onPress={() => {
                      const taskToReschedule = selectedTask;
                      setSelectedTaskId(null);
                      openRescheduleModal(taskToReschedule);
                    }}
                  >
                    <Ionicons
                      name="calendar-number-outline"
                      size={18}
                      color={UI.primaryDark}
                    />
                    <Text style={styles.modalRescheduleButtonText}>
                      {text("Reschedule", "จัดเวลาใหม่")}
                    </Text>
                  </Pressable>
                ) : null}

                <View style={styles.selectedTaskActionRow}>
                  {selectedTask.is_completed ? (
                    <Pressable
                      style={styles.undoButton}
                      onPress={() => {
                        handleUndoCompletedTask(selectedTask.id);
                        setSelectedTaskId(null);
                      }}
                    >
                      <Ionicons name="refresh-outline" size={18} color={UI.text} />
                      <Text style={styles.undoButtonText}>
                        {text("Undo", "ย้อนกลับ")}
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={styles.doneButton}
                      onPress={() => {
                        handleDoneTask(selectedTask.id);
                        setSelectedTaskId(null);
                      }}
                    >
                      <Ionicons name="checkmark" size={18} color={UI.textLight} />
                      <Text style={styles.doneButtonText}>
                        {text("Done", "เสร็จแล้ว")}
                      </Text>
                    </Pressable>
                  )}

                  <Pressable
                    style={styles.editButton}
                    onPress={() => {
                      const taskToEdit = selectedTask;
                      setSelectedTaskId(null);
                      handleEditTask(taskToEdit);
                    }}
                  >
                    <Ionicons name="create-outline" size={18} color={UI.textLight} />
                    <Text style={styles.editButtonText}>
                      {text("Edit", "แก้ไข")}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.deleteButton}
                    onPress={() => {
                      const taskToDelete = selectedTask;
                      setSelectedTaskId(null);
                      openDeleteModal(taskToDelete);
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color={UI.textLight} />
                    <Text style={styles.deleteButtonText}>
                      {text("Delete", "ลบ")}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <BottomNav activeTab="calendar" />

      <Pressable style={styles.fabButton} onPress={handleAddTask}>
        <Ionicons name="add" size={34} color={UI.textLight} />
      </Pressable>

      <Modal
        visible={monthPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={closeMonthPicker}
      >
        <Pressable style={styles.pickerOverlay} onPress={closeMonthPicker}>
          <Pressable
            style={styles.pickerModalBox}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.pickerHeader}>
              <View>
                <Text style={styles.pickerTitle}>
                  {text("Select Month", "เลือกเดือน")}
                </Text>
                <Text style={styles.pickerSubtitle}>
                  {text(
                    "Jump directly to a month and year",
                    "เลือกเดือนและปีที่ต้องการโดยตรง"
                  )}
                </Text>
              </View>

              <Pressable
                style={styles.pickerCloseButton}
                onPress={closeMonthPicker}
              >
                <Ionicons name="close" size={22} color={UI.text} />
              </Pressable>
            </View>

            <Text style={styles.pickerSectionTitle}>
              {text("Month", "เดือน")}
            </Text>

            <View style={styles.monthPickerGrid}>
              {MONTHS.map((item) => (
                <Pressable
                  key={item.value}
                  style={[
                    styles.monthPickerItem,
                    tempMonth === item.value && styles.monthPickerItemActive,
                  ]}
                  onPress={() => setTempMonth(item.value)}
                >
                  <Text
                    style={[
                      styles.monthPickerText,
                      tempMonth === item.value && styles.monthPickerTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.pickerSectionTitle}>
              {text("Year", "ปี")}
            </Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.yearPickerRow}
            >
              {yearOptions.map((item) => (
                <Pressable
                  key={item}
                  style={[
                    styles.yearPickerItem,
                    tempYear === item && styles.yearPickerItemActive,
                  ]}
                  onPress={() => setTempYear(item)}
                >
                  <Text
                    style={[
                      styles.yearPickerText,
                      tempYear === item && styles.yearPickerTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.pickerActionRow}>
              <Pressable
                style={styles.pickerCancelButton}
                onPress={closeMonthPicker}
              >
                <Text style={styles.pickerCancelText}>
                  {text("Cancel", "ยกเลิก")}
                </Text>
              </Pressable>

              <Pressable
                style={styles.pickerApplyButton}
                onPress={applyMonthPicker}
              >
                <Text style={styles.pickerApplyText}>
                  {text("Apply", "ตกลง")}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={rescheduleModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeRescheduleModal}
      >
        <Pressable
          style={styles.rescheduleOverlay}
          onPress={closeRescheduleModal}
        >
          <Pressable
            style={styles.rescheduleModalBox}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.rescheduleModalTitle}>
              {text("Reschedule Task", "จัดเวลาใหม่")}
            </Text>

            <Text style={styles.rescheduleModalMessage}>
              {text(
                "Move this overdue task to a new time while keeping its original duration.",
                "ย้ายกิจกรรมที่เลยเวลาไปยังเวลาใหม่ โดยคงระยะเวลาเดิมไว้"
              )}
            </Text>

            {rescheduleTargetTask ? (
              <View style={styles.reschedulePreviewBox}>
                <Text style={styles.reschedulePreviewTitle} numberOfLines={1}>
                  {rescheduleTargetTask.title ||
                    text("Untitled Task", "ไม่มีชื่อกิจกรรม")}
                </Text>

                <Text style={styles.reschedulePreviewText}>
                  {text("Current", "เวลาปัจจุบัน")}:{" "}
                  {formatTaskDateTimeRange(
                    rescheduleTargetTask.start_time,
                    rescheduleTargetTask.end_time
                  )}
                </Text>
              </View>
            ) : null}

            <Pressable
              style={[
                styles.smartRescheduleButton,
                (isRescheduling || isLoadingSmartReschedule) &&
                styles.disabledButton,
              ]}
              onPress={openSmartRescheduleModal}
              disabled={isRescheduling || isLoadingSmartReschedule}
            >
              <Ionicons name="sparkles-outline" size={20} color={UI.textLight} />
              <Text style={styles.smartRescheduleButtonText}>
                {isLoadingSmartReschedule
                  ? text("Finding Best Time...", "กำลังหาเวลาที่เหมาะสม...")
                  : text("Auto Find Best Time", "หาเวลาที่เหมาะสมอัตโนมัติ")}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.reschedulePrimaryButton,
                isRescheduling && styles.disabledButton,
              ]}
              onPress={() => performQuickReschedule("today")}
              disabled={isRescheduling}
            >
              <Ionicons name="today-outline" size={20} color={UI.textLight} />
              <Text style={styles.reschedulePrimaryButtonText}>
                {isRescheduling
                  ? text("Rescheduling...", "กำลังจัดเวลาใหม่...")
                  : text("Move to Today", "ย้ายมาวันนี้")}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.rescheduleSecondaryButton,
                isRescheduling && styles.disabledButton,
              ]}
              onPress={() => performQuickReschedule("tomorrow")}
              disabled={isRescheduling}
            >
              <Ionicons name="calendar-outline" size={20} color={UI.primary} />
              <Text style={styles.rescheduleSecondaryButtonText}>
                {text("Move to Tomorrow", "ย้ายไปพรุ่งนี้")}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.rescheduleSecondaryButton,
                isRescheduling && styles.disabledButton,
              ]}
              onPress={openPickNewTime}
              disabled={isRescheduling}
            >
              <Ionicons name="time-outline" size={20} color={UI.primary} />
              <Text style={styles.rescheduleSecondaryButtonText}>
                {text("Pick New Time", "เลือกเวลาใหม่")}
              </Text>
            </Pressable>

            <Pressable
              style={styles.rescheduleCancelButton}
              onPress={closeRescheduleModal}
              disabled={isRescheduling || isLoadingSmartReschedule}
            >
              <Text style={styles.rescheduleCancelButtonText}>
                {text("Cancel", "ยกเลิก")}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={smartRescheduleModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeSmartRescheduleModal}
      >
        <Pressable
          style={styles.rescheduleOverlay}
          onPress={closeSmartRescheduleModal}
        >
          <Pressable
            style={styles.rescheduleModalBox}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.rescheduleModalTitle}>
              {text("Auto Find Best Time", "หาเวลาที่เหมาะสมอัตโนมัติ")}
            </Text>

            <Text style={styles.rescheduleModalMessage}>
              {text(
                "The system searches free time slots within the next 7 days.",
                "ระบบค้นหาช่วงเวลาว่างภายใน 7 วันข้างหน้า"
              )}
            </Text>

            {isLoadingSmartReschedule ? (
              <View style={styles.smartLoadingBox}>
                <Text style={styles.smartLoadingText}>
                  {text("Finding suitable time...", "กำลังหาเวลาที่เหมาะสม...")}
                </Text>
              </View>
            ) : smartRescheduleSlots.length === 0 ? (
              <View style={styles.smartEmptyBox}>
                <Ionicons
                  name="sparkles-outline"
                  size={34}
                  color={UI.textMuted}
                />
                <Text style={styles.smartEmptyTitle}>
                  {text("No suitable time found", "ไม่พบเวลาที่เหมาะสม")}
                </Text>
                <Text style={styles.smartEmptyText}>
                  {smartRescheduleMessage === "NO_SUITABLE_TIME_NEXT_7_DAYS"
                    ? text(
                      "No suitable free slot was found in the next 7 days.",
                      "ไม่พบช่วงเวลาว่างที่เหมาะสมภายใน 7 วันข้างหน้า"
                    )
                    : text(
                      "Try Move to Tomorrow or Pick New Time instead.",
                      "ลองย้ายไปพรุ่งนี้ หรือเลือกเวลาใหม่แทน"
                    )}
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.smartSlotList}
                showsVerticalScrollIndicator={false}
              >
                {smartRescheduleSlots.map((slot, index) => {
                  const suggestedStart =
                    normalizeDate(slot?.suggested_start_time) ||
                    normalizeDate(slot?.start_time);
                  const suggestedEnd =
                    normalizeDate(slot?.suggested_end_time) ||
                    normalizeDate(slot?.end_time);

                  return (
                    <Pressable
                      key={`calendar-smart-slot-${index}`}
                      style={styles.smartSlotCard}
                      onPress={() => applySmartRescheduleSlot(slot)}
                      disabled={isRescheduling}
                    >
                      <View style={styles.smartSlotIcon}>
                        <Ionicons
                          name="sparkles-outline"
                          size={18}
                          color={UI.primary}
                        />
                      </View>

                      <View style={styles.smartSlotTextBox}>
                        <Text style={styles.smartSlotTitle}>
                          {formatTime(suggestedStart)} - {formatTime(suggestedEnd)}
                        </Text>
                        <Text style={styles.smartSlotSubtitle}>
                          {formatFullDate(suggestedStart)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            <Pressable
              style={styles.rescheduleCancelButton}
              onPress={closeSmartRescheduleModal}
              disabled={isLoadingSmartReschedule || isRescheduling}
            >
              <Text style={styles.rescheduleCancelButtonText}>
                {text("Close", "ปิด")}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteModal}
      >
        <Pressable style={styles.deleteOverlay} onPress={closeDeleteModal}>
          <Pressable
            style={styles.deleteModalBox}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.deleteModalTitle}>{getDeleteModalTitle()}</Text>

            <Text style={styles.deleteModalMessage}>
              {getDeleteModalMessage()}
            </Text>

            {deleteTargetTask?.planning_enabled ? (
              <>
                <Pressable
                  style={[
                    styles.deleteOneButton,
                    isDeleting && styles.disabledButton,
                  ]}
                  onPress={performDeleteSingleTask}
                  disabled={isDeleting}
                >
                  <Text style={styles.modalButtonText}>
                    {text("Delete main task only", "ลบเฉพาะกิจกรรมหลัก")}
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.deleteAllButton,
                    isDeleting && styles.disabledButton,
                  ]}
                  onPress={performDeletePlanningWithSessions}
                  disabled={isDeleting}
                >
                  <Text style={styles.modalButtonText}>
                    {text(
                      "Delete main task and all sessions",
                      "ลบกิจกรรมหลักและเซสชันทั้งหมด"
                    )}
                  </Text>
                </Pressable>
              </>
            ) : deleteTargetTask?.is_recurring &&
              deleteTargetTask?.recurrence_group_id ? (
              <>
                <Pressable
                  style={[
                    styles.deleteOneButton,
                    isDeleting && styles.disabledButton,
                  ]}
                  onPress={performDeleteSingleTask}
                  disabled={isDeleting}
                >
                  <Text style={styles.modalButtonText}>
                    {text("Delete this task only", "ลบเฉพาะกิจกรรมนี้")}
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.deleteAllButton,
                    isDeleting && styles.disabledButton,
                  ]}
                  onPress={performDeleteRecurringGroup}
                  disabled={isDeleting}
                >
                  <Text style={styles.modalButtonText}>
                    {text(
                      "Delete all recurring tasks",
                      "ลบกิจกรรมที่ทำซ้ำทั้งหมด"
                    )}
                  </Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                style={[
                  styles.deleteAllButton,
                  isDeleting && styles.disabledButton,
                ]}
                onPress={performDeleteSingleTask}
                disabled={isDeleting}
              >
                <Text style={styles.modalButtonText}>
                  {isDeleting
                    ? text("Deleting...", "กำลังลบ...")
                    : text("Delete Task", "ลบกิจกรรม")}
                </Text>
              </Pressable>
            )}

            <Pressable
              style={styles.cancelDeleteButton}
              onPress={closeDeleteModal}
              disabled={isDeleting}
            >
              <Text style={styles.cancelDeleteText}>
                {text("Cancel", "ยกเลิก")}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View >
  );
}
const styles = StyleSheet.create({
  taskDetailOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  taskDetailModalBox: {
    width: "100%",
    maxWidth: 430,
  },

  taskDetailCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: UI.cardSoft,
    borderWidth: 1,
    borderColor: UI.border,
    alignItems: "center",
    justifyContent: "center",
  },

  modalRescheduleButton: {
    marginTop: 14,
    height: 44,
    borderRadius: 14,
    backgroundColor: UI.primaryLight,
    borderWidth: 1,
    borderColor: UI.border,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },

  modalRescheduleButtonText: {
    fontSize: 14,
    fontWeight: "900",
    color: UI.primaryDark,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: UI.background,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 18,
    color: UI.textMuted,
    fontWeight: "700",
  },
  container: {
    flex: 1,
    backgroundColor: UI.background,
  },
  fabButton: {
    position: "absolute",
    right: 30,
    bottom: 135,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: UI.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: UI.background,
    zIndex: 20,
    elevation: 12,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 58,
    paddingHorizontal: 18,
    paddingBottom: 170,
  },
  headerCard: {
    backgroundColor: UI.card,
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    borderColor: UI.border,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 2,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  monthNavButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: UI.cardSoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: UI.border,
  },
  monthTitleButton: {
    flex: 1,
    minHeight: 42,
    marginHorizontal: 10,
    borderRadius: 16,
    backgroundColor: UI.cardSoft,
    borderWidth: 1,
    borderColor: UI.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 12,
  },
  monthTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: UI.text,
    letterSpacing: -0.3,
  },
  headerActionRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  todayButton: {
    flex: 1,
    backgroundColor: UI.primaryLight,
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  todayButtonText: {
    color: UI.primaryDark,
    fontWeight: "900",
    fontSize: 14,
  },
  addTaskButton: {
    flex: 1,
    backgroundColor: UI.primary,
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  addTaskButtonText: {
    color: UI.textLight,
    fontWeight: "900",
    fontSize: 14,
  },
  weekRow: {
    flexDirection: "row",
    marginBottom: 8,
    paddingHorizontal: 0,
  },
  weekText: {
    flex: 1,
    textAlign: "center",
    color: UI.textMuted,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: UI.card,
    borderRadius: 26,
    paddingVertical: 10,
    paddingHorizontal: 0,
    borderWidth: 1,
    borderColor: UI.border,
    marginBottom: 18,
    overflow: "hidden",
  },
  dayCellEmpty: {
    width: "14.285714%",
    height: 62,
  },
  dayCell: {
    width: "14.285714%",
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  dayCellSelected: {
    backgroundColor: UI.primaryLight,
  },
  dayNumberCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  todayCircle: {
    backgroundColor: UI.primary,
  },
  selectedCircle: {
    backgroundColor: UI.primaryDark,
  },
  dayNumber: {
    fontSize: 15,
    fontWeight: "900",
    color: UI.text,
  },
  todayNumber: {
    color: UI.textLight,
  },
  selectedNumber: {
    color: UI.textLight,
  },
  dotRow: {
    height: 10,
    marginTop: 2,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 3,
  },
  taskDot: {
    width: 5,
    height: 5,
    borderRadius: 2,
  },
  dayCountText: {
    marginTop: -1,
    fontSize: 8,
    color: UI.textMuted,
    fontWeight: "800",
  },
  dayPanel: {
    backgroundColor: UI.card,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: UI.border,
    padding: 16,
    marginBottom: 16,
  },
  dayPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  dayPanelTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: UI.text,
    letterSpacing: -0.3,
  },
  dayPanelSubtitle: {
    marginTop: 3,
    fontSize: 13,
    color: UI.textMuted,
    fontWeight: "700",
  },
  emptyDayCard: {
    backgroundColor: UI.cardSoft,
    borderRadius: 20,
    padding: 22,
    alignItems: "center",
    borderWidth: 1,
    borderColor: UI.border,
  },
  emptyDayTitle: {
    marginTop: 10,
    fontSize: 17,
    fontWeight: "900",
    color: UI.text,
  },
  emptyDayText: {
    marginTop: 5,
    fontSize: 13,
    color: UI.textMuted,
    textAlign: "center",
    fontWeight: "600",
  },
  timelineWrapper: {
    borderRadius: 22,
    backgroundColor: UI.cardSoft,
    borderWidth: 1,
    borderColor: UI.border,
    overflow: "hidden",
  },
  timelineScrollBox: {
    maxHeight: 400,
  },
  timelineCanvas: {
    position: "relative",
    marginVertical: 12,
    paddingTop: 2,
  },
  hourRow: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 1,
  },
  hourLabel: {
    width: 62,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "900",
    color: UI.textMuted,
    lineHeight: 16,
  },
  hourLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#D9DEE8",
    marginRight: 10,
  },
  hourLineMuted: {
    backgroundColor: "transparent",
  },
  timelineTask: {
    position: "absolute",
    left: 84,
    right: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 12,
    overflow: "hidden",
  },
  timelineTaskSelected: {
    borderWidth: 2.5,
  },
  timelineTaskHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  timelineTaskTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
  },
  timelineTaskTime: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "800",
  },
  timelineTagRow: {
    marginTop: 8,
    flexDirection: "row",
  },
  smallStatusTag: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  smallStatusTagText: {
    fontSize: 11,
    fontWeight: "900",
  },
  selectedTaskPanel: {
    backgroundColor: UI.card,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: UI.border,
    padding: 16,
    marginBottom: 16,
  },
  selectedTaskHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  selectedTaskIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedTaskTextBox: {
    flex: 1,
  },
  selectedTaskTopIconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: UI.primaryLight,
    borderWidth: 1,
    borderColor: UI.border,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedTaskTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: UI.text,
  },
  selectedTaskTime: {
    marginTop: 4,
    fontSize: 12,
    color: UI.textMuted,
    fontWeight: "700",
    lineHeight: 18,
  },
  selectedTaskDetail: {
    marginTop: 12,
    fontSize: 14,
    color: UI.textMuted,
    lineHeight: 20,
    fontWeight: "600",
  },
  infoTagRow: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  infoTag: {
    backgroundColor: UI.cardSoft,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: UI.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  infoTagText: {
    color: UI.textMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  conflictInfoTag: {
    backgroundColor: "#FEE2E2",
    borderColor: "#EF4444",
  },
  conflictInfoText: {
    color: "#991B1B",
    fontSize: 12,
    fontWeight: "900",
  },

  selectedTaskActionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
    alignItems: "stretch",
  },
  doneButton: {
    flex: 1,
    height: 46,
    backgroundColor: UI.success,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  doneButtonText: {
    color: UI.textLight,
    fontSize: 14,
    fontWeight: "900",
  },
  undoButton: {
    flex: 1,
    height: 46,
    backgroundColor: UI.cardSoft,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    borderWidth: 1,
    borderColor: UI.border,
  },
  undoButtonText: {
    color: UI.text,
    fontSize: 14,
    fontWeight: "900",
  },
  editButton: {
    flex: 1,
    height: 46,
    backgroundColor: UI.primary,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  editButtonText: {
    color: UI.textLight,
    fontSize: 14,
    fontWeight: "900",
  },
  deleteButton: {
    flex: 1,
    height: 46,
    backgroundColor: UI.danger,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  deleteButtonText: {
    color: UI.textLight,
    fontSize: 14,
    fontWeight: "900",
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  pickerModalBox: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: UI.card,
    borderRadius: 26,
    padding: 20,
    borderWidth: 1,
    borderColor: UI.border,
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 12,
  },
  pickerTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: UI.text,
  },
  pickerSubtitle: {
    marginTop: 3,
    fontSize: 13,
    color: UI.textMuted,
    fontWeight: "700",
  },
  pickerCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: UI.cardSoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: UI.border,
  },
  pickerSectionTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: UI.textMuted,
    marginBottom: 10,
  },
  monthPickerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 18,
  },
  monthPickerItem: {
    width: "30.8%",
    backgroundColor: UI.cardSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: UI.border,
    paddingVertical: 11,
    alignItems: "center",
  },
  monthPickerItemActive: {
    backgroundColor: UI.primary,
    borderColor: UI.primary,
  },
  monthPickerText: {
    color: UI.text,
    fontWeight: "900",
    fontSize: 14,
  },
  monthPickerTextActive: {
    color: UI.textLight,
  },
  yearPickerRow: {
    gap: 8,
    paddingBottom: 4,
    marginBottom: 18,
  },
  yearPickerItem: {
    backgroundColor: UI.cardSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: UI.border,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  yearPickerItemActive: {
    backgroundColor: UI.primary,
    borderColor: UI.primary,
  },
  yearPickerText: {
    color: UI.text,
    fontWeight: "900",
    fontSize: 14,
  },
  yearPickerTextActive: {
    color: UI.textLight,
  },
  pickerActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  pickerCancelButton: {
    flex: 1,
    backgroundColor: UI.cardSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: UI.border,
    paddingVertical: 13,
    alignItems: "center",
  },
  pickerCancelText: {
    color: UI.text,
    fontSize: 15,
    fontWeight: "900",
  },
  pickerApplyButton: {
    flex: 1,
    backgroundColor: UI.primary,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  pickerApplyText: {
    color: UI.textLight,
    fontSize: 15,
    fontWeight: "900",
  },
  deleteOverlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  deleteModalBox: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: UI.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: UI.border,
  },
  deleteModalTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: UI.text,
    marginBottom: 8,
  },
  deleteModalMessage: {
    fontSize: 15,
    color: UI.textMuted,
    lineHeight: 22,
    marginBottom: 18,
    fontWeight: "600",
  },
  deleteOneButton: {
    backgroundColor: UI.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  deleteAllButton: {
    backgroundColor: UI.danger,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  modalButtonText: {
    color: UI.textLight,
    fontSize: 15,
    fontWeight: "900",
  },
  cancelDeleteButton: {
    backgroundColor: UI.cardSoft,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: UI.border,
  },
  cancelDeleteText: {
    color: UI.text,
    fontSize: 15,
    fontWeight: "900",
  },
  rescheduleOverlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  rescheduleModalBox: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: UI.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: UI.border,
  },

  rescheduleModalTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: UI.text,
    marginBottom: 8,
  },

  rescheduleModalMessage: {
    fontSize: 14,
    color: UI.textMuted,
    lineHeight: 21,
    marginBottom: 14,
    fontWeight: "600",
  },

  reschedulePreviewBox: {
    backgroundColor: UI.cardSoft,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: UI.border,
    padding: 12,
    marginBottom: 14,
  },

  reschedulePreviewTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: UI.text,
    marginBottom: 4,
  },

  reschedulePreviewText: {
    fontSize: 12,
    color: UI.textMuted,
    fontWeight: "700",
    lineHeight: 18,
  },

  smartRescheduleButton: {
    backgroundColor: "#7C3AED",
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },

  smartRescheduleButtonText: {
    color: UI.textLight,
    fontSize: 14,
    fontWeight: "900",
  },

  reschedulePrimaryButton: {
    backgroundColor: UI.primary,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },

  reschedulePrimaryButtonText: {
    color: UI.textLight,
    fontSize: 14,
    fontWeight: "900",
  },

  rescheduleSecondaryButton: {
    backgroundColor: UI.primaryLight,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: UI.border,
  },

  rescheduleSecondaryButtonText: {
    color: UI.primaryDark,
    fontSize: 14,
    fontWeight: "900",
  },

  rescheduleCancelButton: {
    backgroundColor: UI.cardSoft,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: UI.border,
  },

  rescheduleCancelButtonText: {
    color: UI.text,
    fontSize: 14,
    fontWeight: "900",
  },

  smartLoadingBox: {
    backgroundColor: UI.cardSoft,
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    marginBottom: 14,
  },

  smartLoadingText: {
    color: UI.textMuted,
    fontSize: 14,
    fontWeight: "800",
  },

  smartEmptyBox: {
    backgroundColor: UI.cardSoft,
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    marginBottom: 14,
  },

  smartEmptyTitle: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: "900",
    color: UI.text,
  },

  smartEmptyText: {
    marginTop: 5,
    fontSize: 13,
    fontWeight: "600",
    color: UI.textMuted,
    textAlign: "center",
    lineHeight: 19,
  },

  smartSlotList: {
    maxHeight: 300,
    marginBottom: 14,
  },

  smartSlotCard: {
    backgroundColor: UI.cardSoft,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: UI.border,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  smartSlotIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: UI.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },

  smartSlotTextBox: {
    flex: 1,
  },

  smartSlotTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: UI.text,
  },

  smartSlotSubtitle: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "700",
    color: UI.textMuted,
  },
  disabledButton: {
    opacity: 0.55,
  },
});
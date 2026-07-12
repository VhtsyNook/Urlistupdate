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
  TextInput,
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

const SECTION_PREVIEW_LIMIT = 3;

export default function TasksScreen() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { language } = useLanguage();

  const isThai = language === "th";
  const locale = isThai ? "th-TH" : "en-US";
  const text = useCallback(
    (en, th) => (isThai ? th : en),
    [isThai]
  );

  const [tasks, setTasks] = useState([]);
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());

  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("time");

  const [showFilterArrow, setShowFilterArrow] = useState(true);

  const [showControls, setShowControls] = useState(false);

  const [expandedSections, setExpandedSections] = useState({});

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteTargetTask, setDeleteTargetTask] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [rescheduleModalVisible, setRescheduleModalVisible] = useState(false);
  const [rescheduleTargetTask, setRescheduleTargetTask] = useState(null);
  const [isRescheduling, setIsRescheduling] = useState(false);

  const [rescheduleConflictModalVisible, setRescheduleConflictModalVisible] =
    useState(false);
  const [rescheduleConflictResult, setRescheduleConflictResult] =
    useState(null);
  const [pendingRescheduleRange, setPendingRescheduleRange] = useState(null);

  const [smartRescheduleModalVisible, setSmartRescheduleModalVisible] =
    useState(false);
  const [smartRescheduleSlots, setSmartRescheduleSlots] = useState([]);
  const [smartRescheduleBusySlots, setSmartRescheduleBusySlots] = useState([]);
  const [smartRescheduleMessage, setSmartRescheduleMessage] = useState("");
  const [isLoadingSmartReschedule, setIsLoadingSmartReschedule] =
    useState(false);

  const [freeTimeModalVisible, setFreeTimeModalVisible] = useState(false);
  const [freeTimeSlots, setFreeTimeSlots] = useState([]);
  const [freeTimeBusySlots, setFreeTimeBusySlots] = useState([]);
  const [freeTimeDuration, setFreeTimeDuration] = useState(60);
  const [freeTimeMessage, setFreeTimeMessage] = useState("");
  const [isLoadingFreeTime, setIsLoadingFreeTime] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 10000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!rootNavigationState?.key || !isAuthReady) return;

    if (!user) {
      setTasks([]);
      router.replace("/login");
    }
  }, [rootNavigationState?.key, isAuthReady, user, router]);

  useEffect(() => {
    if (!isAuthReady || !user) {
      setTasks([]);
      return;
    }

    let unsubscribe = () => { };

    try {
      unsubscribe = listenTasks((data) => {
        setNowTick(Date.now());
        setTasks(data);
      });
    } catch (error) {
      console.error("Listen tasks error:", error);

      if (error?.message === "AUTH_REQUIRED") {
        router.replace("/login");
      } else {
        Alert.alert(
          text("Error", "เกิดข้อผิดพลาด"),
          text("Unable to load tasks.", "ไม่สามารถโหลดกิจกรรมได้")
        );
      }
    }

    return () => unsubscribe();
  }, [isAuthReady, user, router, text]);

  const normalizeDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === "function") return value.toDate();
    return new Date(value);
  };

  const isValidDate = (value) => {
    return value instanceof Date && !Number.isNaN(value.getTime());
  };

  const getComparableNowMs = (referenceTime = nowTick) => {
    if (referenceTime instanceof Date) return referenceTime.getTime();

    const numberValue = Number(referenceTime);
    if (!Number.isNaN(numberValue) && numberValue > 0) return numberValue;

    return Date.now();
  };

  const addMinutes = (date, minutes) => {
    const nextDate = new Date(date);
    nextDate.setMinutes(nextDate.getMinutes() + minutes);
    return nextDate;
  };

  const roundUpToNext15Minutes = (date) => {
    const roundedDate = new Date(date);

    roundedDate.setSeconds(0);
    roundedDate.setMilliseconds(0);

    const minutes = roundedDate.getMinutes();
    const remainder = minutes % 15;

    if (remainder !== 0) {
      roundedDate.setMinutes(minutes + (15 - remainder));
    }

    return roundedDate;
  };

  const isToday = (value) => {
    const date = normalizeDate(value);
    if (!isValidDate(date)) return false;

    const today = new Date();

    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  };

  const isUpcoming = (value) => {
    const date = normalizeDate(value);
    if (!isValidDate(date)) return false;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    return date > todayStart && !isToday(date);
  };

  const isOverdueTask = (task, referenceTime = nowTick) => {
    if (!task || task.is_completed === true) return false;

    const endDate = normalizeDate(task.end_time);
    if (!isValidDate(endDate)) return false;

    const nowMs = getComparableNowMs(referenceTime);

    return endDate.getTime() <= nowMs;
  };

  const isCompletedLateTask = (task) => {
    if (!task || !task.is_completed) return false;

    if (task.completed_late === true) return true;

    const endDate = normalizeDate(task.end_time);
    const completedDate =
      normalizeDate(task.completed_at) ||
      normalizeDate(task.completedAt) ||
      normalizeDate(task.completed_time);

    if (!isValidDate(endDate) || !isValidDate(completedDate)) return false;

    return completedDate.getTime() > endDate.getTime();
  };

  const getTaskDurationMs = (task) => {
    const startDate = normalizeDate(task?.start_time) || new Date();
    const endDate = normalizeDate(task?.end_time) || addMinutes(startDate, 60);

    return Math.max(15 * 60 * 1000, endDate.getTime() - startDate.getTime());
  };

  const getTaskDurationMinutes = (task) => {
    return Math.max(15, Math.ceil(getTaskDurationMs(task) / (1000 * 60)));
  };

  const buildQuickRescheduledTimeRange = (task, targetType) => {
    const originalStart = normalizeDate(task.start_time) || new Date();
    const durationMs = getTaskDurationMs(task);
    const now = new Date();

    const moveAfterLunchIfOverlap = (startDate, durationMilliseconds) => {
      const endDate = new Date(startDate.getTime() + durationMilliseconds);

      const lunchStart = new Date(startDate);
      lunchStart.setHours(12, 0, 0, 0);

      const lunchEnd = new Date(startDate);
      lunchEnd.setHours(13, 0, 0, 0);

      const overlapsLunch =
        startDate < lunchEnd && endDate > lunchStart;

      if (!overlapsLunch) {
        return startDate;
      }

      return roundUpToNext15Minutes(lunchEnd);
    };

    let newStart = new Date();

    if (targetType === "today") {
      newStart.setHours(
        originalStart.getHours(),
        originalStart.getMinutes(),
        0,
        0
      );

      if (newStart.getTime() <= now.getTime()) {
        newStart = roundUpToNext15Minutes(addMinutes(now, 15));
      }

      newStart = moveAfterLunchIfOverlap(newStart, durationMs);
    }

    if (targetType === "tomorrow") {
      newStart = new Date(now);
      newStart.setDate(now.getDate() + 1);
      newStart.setHours(
        originalStart.getHours(),
        originalStart.getMinutes(),
        0,
        0
      );

      newStart = moveAfterLunchIfOverlap(newStart, durationMs);
    }

    return {
      newStart,
      newEnd: new Date(newStart.getTime() + durationMs),
    };
  };

  const formatDate = (value) => {
    const date = normalizeDate(value);
    if (!isValidDate(date)) return "-";

    return date.toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (value) => {
    const date = normalizeDate(value);
    if (!isValidDate(date)) return "-";

    return date.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDurationMinutes = (minutes) => {
    const value = Number(minutes) || 0;

    if (value < 60) {
      return isThai ? `${value} นาที` : `${value} min`;
    }

    const hours = Math.floor(value / 60);
    const remainingMinutes = value % 60;

    if (remainingMinutes === 0) {
      return isThai ? `${hours} ชม.` : `${hours} hr`;
    }

    return isThai
      ? `${hours} ชม. ${remainingMinutes} นาที`
      : `${hours} hr ${remainingMinutes} min`;
  };

  const formatSlotDate = (value) => {
    const date = normalizeDate(value);
    if (!isValidDate(date)) return "-";

    return date.toLocaleDateString(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
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

  const isNextCalendarDay = (startValue, endValue) => {
    const startDate = normalizeDate(startValue);
    const endDate = normalizeDate(endValue);

    if (!isValidDate(startDate) || !isValidDate(endDate)) return false;

    const nextDay = new Date(startDate);
    nextDay.setDate(nextDay.getDate() + 1);

    return (
      nextDay.getFullYear() === endDate.getFullYear() &&
      nextDay.getMonth() === endDate.getMonth() &&
      nextDay.getDate() === endDate.getDate()
    );
  };

  const formatTaskDateRange = (startValue, endValue) => {
    const startDate = normalizeDate(startValue);
    const endDate = normalizeDate(endValue);

    if (!isValidDate(startDate) || !isValidDate(endDate)) return "-";

    if (isSameCalendarDay(startDate, endDate)) {
      return formatDate(startDate);
    }

    return `${formatDate(startDate)} → ${formatDate(endDate)}`;
  };

  const formatTaskTimeRange = (startValue, endValue) => {
    const startDate = normalizeDate(startValue);
    const endDate = normalizeDate(endValue);

    if (!isValidDate(startDate) || !isValidDate(endDate)) return "-";

    if (isSameCalendarDay(startDate, endDate)) {
      return `${formatTime(startDate)} - ${formatTime(endDate)}`;
    }

    if (isNextCalendarDay(startDate, endDate)) {
      return `${formatTime(startDate)} - ${formatTime(endDate)} ${isThai ? "(+1 วัน)" : "(+1 day)"
        }`;
    }

    return `${formatTime(startDate)} - ${formatTime(endDate)} (${formatDate(
      endDate
    )})`;
  };

  const formatConflictDateTime = (startValue, endValue) => {
    const startDate = normalizeDate(startValue);
    const endDate = normalizeDate(endValue);

    if (!isValidDate(startDate) || !isValidDate(endDate)) return "-";

    const isSameDay =
      startDate.getFullYear() === endDate.getFullYear() &&
      startDate.getMonth() === endDate.getMonth() &&
      startDate.getDate() === endDate.getDate();

    if (isSameDay) {
      return `${formatDate(startDate)} · ${formatTime(
        startDate
      )} - ${formatTime(endDate)}`;
    }

    return `${formatDate(startDate)} ${formatTime(startDate)} - ${formatDate(
      endDate
    )} ${formatTime(endDate)}`;
  };

  const getPriority = (task) => {
    const value = String(task?.priority || "Normal").toLowerCase();

    if (value === "high") return text("High", "สูง");
    if (value === "medium") return text("Medium", "ปานกลาง");
    if (value === "low") return text("Low", "ต่ำ");

    return text("Normal", "ทั่วไป");
  };

  const getPriorityStyle = (priority) => {
    const lower = String(priority).toLowerCase();

    if (lower === "high" || priority === "สูง") {
      return {
        backgroundColor: "#FEE2E2",
        color: COLORS.danger,
        icon: "flag-outline",
      };
    }

    if (lower === "medium" || priority === "ปานกลาง") {
      return {
        backgroundColor: "#FEF3C7",
        color: COLORS.warning,
        icon: "alert-outline",
      };
    }

    if (lower === "low" || priority === "ต่ำ") {
      return {
        backgroundColor: "#DCFCE7",
        color: COLORS.success,
        icon: "leaf-outline",
      };
    }

    return {
      backgroundColor: COLORS.cardSoft || "#F8FAFC",
      color: COLORS.textMuted,
      icon: "ellipse-outline",
    };
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

  const getTaskTypeLabel = (task) => {
    if (isOverdueTask(task)) return text("Overdue Task", "กิจกรรมที่เลยเวลา");
    if (isCompletedLateTask(task)) return text("Completed Late", "เสร็จล่าช้า");
    if (task.is_generated_session) {
      return text("Study / Planning Session", "เซสชันอ่าน/วางแผน");
    }
    if (task.planning_enabled) {
      return text("Main Planning Task", "กิจกรรมหลักแบบวางแผน");
    }
    if (task.is_recurring) return text("Recurring Task", "กิจกรรมที่ทำซ้ำ");
    if (task.is_completed) return text("Completed", "เสร็จแล้ว");
    return text("Normal Task", "กิจกรรมทั่วไป");
  };

  const getTaskAccent = (task) => {
    if (isOverdueTask(task)) {
      return {
        color: COLORS.danger,
        backgroundColor: "#FEE2E2",
        icon: "alert-circle-outline",
      };
    }

    if (isCompletedLateTask(task)) {
      return {
        color: COLORS.danger,
        backgroundColor: "#FEE2E2",
        icon: "time-outline",
      };
    }

    if (task.has_conflict) {
      return {
        color: COLORS.danger,
        backgroundColor: "#FEE2E2",
        icon: "alert-circle-outline",
      };
    }

    if (task.is_generated_session) {
      return {
        color: "#7C3AED",
        backgroundColor: "#EDE9FE",
        icon: "layers-outline",
      };
    }

    if (task.planning_enabled) {
      return {
        color: "#2563EB",
        backgroundColor: "#DBEAFE",
        icon: "analytics-outline",
      };
    }

    if (task.is_recurring) {
      return {
        color: "#F97316",
        backgroundColor: "#FFEDD5",
        icon: "repeat-outline",
      };
    }

    if (task.is_completed) {
      return {
        color: COLORS.success,
        backgroundColor: "#DCFCE7",
        icon: "checkmark-done-outline",
      };
    }

    return {
      color: COLORS.primary,
      backgroundColor: COLORS.primaryLight,
      icon: "list-outline",
    };
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

  const sortTasks = (items) => {
    return [...items].sort((a, b) => {
      if (sortBy === "priority") {
        const priorityRank = {
          high: 1,
          medium: 2,
          low: 3,
          normal: 4,
        };

        const rankA =
          priorityRank[String(a.priority || "normal").toLowerCase()] || 4;
        const rankB =
          priorityRank[String(b.priority || "normal").toLowerCase()] || 4;

        return rankA - rankB;
      }

      if (sortBy === "deadline") {
        const deadlineA = normalizeDate(a.deadline)?.getTime() || Infinity;
        const deadlineB = normalizeDate(b.deadline)?.getTime() || Infinity;

        return deadlineA - deadlineB;
      }

      const timeA = normalizeDate(a.start_time)?.getTime() || 0;
      const timeB = normalizeDate(b.start_time)?.getTime() || 0;

      return timeA - timeB;
    });
  };


  const filteredTasks = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    const result = tasks.filter((task) => {
      const title = String(task.title || "").trim().toLowerCase();

      const matchesSearch = !keyword || title.startsWith(keyword);

      if (!matchesSearch) return false;

      if (filter === "today") {
        return isToday(task.start_time) && !task.is_completed;
      }

      if (filter === "upcoming") {
        return isUpcoming(task.start_time) && !task.is_completed;
      }

      if (filter === "completed") {
        return task.is_completed;
      }

      if (filter === "conflict") {
        return task.has_conflict;
      }

      return true;
    });

    return sortTasks(result);
  }, [tasks, searchText, filter, sortBy, nowTick]);

  const searchSuggestions = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    if (!keyword) return [];

    return tasks
      .filter((task) => {
        const title = String(task.title || "").trim().toLowerCase();
        return title.startsWith(keyword);
      })
      .sort((a, b) => {
        const titleA = String(a.title || "").toLowerCase();
        const titleB = String(b.title || "").toLowerCase();

        return titleA.localeCompare(titleB);
      })
      .slice(0, 5);
  }, [tasks, searchText]);

  const taskSections = useMemo(() => {
    const referenceNow = getComparableNowMs(nowTick);

    const overdueTasks = [];
    const todaySessions = [];
    const planningTasks = [];
    const normalTasks = [];
    const recurringTasks = [];
    const completedLateTasks = [];
    const completedTasks = [];

    const addedTaskIds = new Set();

    const addOnce = (list, task) => {
      if (!task?.id) return;
      if (addedTaskIds.has(task.id)) return;

      addedTaskIds.add(task.id);
      list.push(task);
    };

    filteredTasks.forEach((task) => {
      if (!task) return;

      if (task.is_completed) {
        if (isCompletedLateTask(task)) {
          addOnce(completedLateTasks, task);
          return;
        }

        addOnce(completedTasks, task);
        return;
      }

      if (isOverdueTask(task, referenceNow)) {
        addOnce(overdueTasks, task);
        return;
      }

      if (task.is_generated_session) {
        if (isToday(task.start_time) || filter !== "today") {
          addOnce(todaySessions, task);
        }
        return;
      }

      if (task.planning_enabled) {
        addOnce(planningTasks, task);
        return;
      }

      if (task.is_recurring) {
        addOnce(recurringTasks, task);
        return;
      }

      addOnce(normalTasks, task);
    });

    return [
      {
        key: "overdue-tasks",
        title: text("Overdue Tasks", "กิจกรรมที่เลยเวลา"),
        icon: "alert-circle-outline",
        color: COLORS.danger,
        backgroundColor: "#FEE2E2",
        data: sortTasks(overdueTasks),
      },
      {
        key: "planning-sessions",
        title: text("Planning Sessions", "เซสชันวางแผน"),
        icon: "flash-outline",
        color: "#7C3AED",
        backgroundColor: "#EDE9FE",
        data: sortTasks(todaySessions),
      },
      {
        key: "planning-tasks",
        title: text("Planning Tasks", "กิจกรรมที่วางแผนไว้"),
        icon: "analytics-outline",
        color: "#2563EB",
        backgroundColor: "#DBEAFE",
        data: sortTasks(planningTasks),
      },
      {
        key: "normal-tasks",
        title: text("Normal Tasks", "กิจกรรมทั่วไป"),
        icon: "list-outline",
        color: COLORS.primary,
        backgroundColor: COLORS.primaryLight,
        data: sortTasks(normalTasks),
      },
      {
        key: "recurring-tasks",
        title: text("Recurring Tasks", "กิจกรรมที่ทำซ้ำ"),
        icon: "repeat-outline",
        color: "#F97316",
        backgroundColor: "#FFEDD5",
        data: sortTasks(recurringTasks),
      },
      {
        key: "completed-late",
        title: text("Completed Late", "กิจกรรมที่เสร็จล่าช้า"),
        icon: "time-outline",
        color: COLORS.danger,
        backgroundColor: "#FEE2E2",
        data: sortTasks(completedLateTasks),
      },
      {
        key: "completed",
        title: text("Completed", "กิจกรรมที่เสร็จแล้ว"),
        icon: "checkmark-done-outline",
        color: COLORS.success,
        backgroundColor: "#DCFCE7",
        data: sortTasks(completedTasks),
      },
    ].filter((section) => section.data.length > 0);
  }, [filteredTasks, sortBy, filter, nowTick, isThai]);

  const toggleSectionExpanded = (sectionKey) => {
    setExpandedSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }));
  };

  const handleDoneTask = async (taskId) => {
    try {
      await updateTaskStatus(taskId, "completed");
    } catch (error) {
      console.error("Done task error:", error);
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text(
          "Unable to update task status.",
          "ไม่สามารถอัปเดตสถานะกิจกรรมได้"
        )
      );
    }
  };

  const handleUndoTask = async (taskId) => {
    try {
      await undoTaskDone(taskId);
    } catch (error) {
      console.error("Undo task error:", error);
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text("Unable to restore this task.", "ไม่สามารถกู้คืนกิจกรรมนี้ได้")
      );
    }
  };

  const openDeleteModal = (task) => {
    setDeleteTargetTask(task);
    setDeleteModalVisible(true);
  };

  const closeDeleteModal = () => {
    if (isDeleting) return;

    setDeleteModalVisible(false);
    setDeleteTargetTask(null);
  };

  const openRescheduleModal = (task) => {
    setRescheduleTargetTask(task);
    setRescheduleModalVisible(true);
  };

  const closeRescheduleModal = () => {
    if (isRescheduling || isLoadingSmartReschedule) return;

    setRescheduleModalVisible(false);
    setRescheduleTargetTask(null);
  };

  const closeSmartRescheduleModal = () => {
    if (isRescheduling || isLoadingSmartReschedule) return;

    setSmartRescheduleModalVisible(false);
    setSmartRescheduleSlots([]);
    setSmartRescheduleBusySlots([]);
    setSmartRescheduleMessage("");
  };

  const getConflictItems = (result) => {
    return Array.isArray(result?.conflict_items) ? result.conflict_items : [];
  };

  const openRescheduleConflictModal = ({ result, newStart, newEnd }) => {
    setPendingRescheduleRange({
      start_time: newStart,
      end_time: newEnd,
    });
    setRescheduleConflictResult(result);
    setRescheduleConflictModalVisible(true);
  };

  const closeRescheduleConflictModal = () => {
    if (isRescheduling) return;

    setRescheduleConflictModalVisible(false);
    setRescheduleConflictResult(null);
    setPendingRescheduleRange(null);
  };

  const handlePickNewTimeFromConflict = () => {
    setRescheduleConflictModalVisible(false);
    setRescheduleConflictResult(null);
    setPendingRescheduleRange(null);
    openPickNewTime();
  };

  const saveRescheduledTask = async (task, newStart, newEnd) => {
    if (!task?.id) {
      throw new Error("TASK_ID_REQUIRED");
    }

    const result = await rescheduleTask(task.id, newStart, newEnd);

    if (result?.success === false && result?.has_conflict === true) {
      openRescheduleConflictModal({
        result,
        newStart,
        newEnd,
      });

      return result;
    }

    if (result?.success === false) {
      throw new Error("RESCHEDULE_FAILED");
    }

    return result;
  };

  const performQuickReschedule = async (targetType) => {
    if (!rescheduleTargetTask?.id || isRescheduling) return;

    try {
      setIsRescheduling(true);

      const { newStart, newEnd } = buildQuickRescheduledTimeRange(
        rescheduleTargetTask,
        targetType
      );

      const result = await saveRescheduledTask(
        rescheduleTargetTask,
        newStart,
        newEnd
      );

      if (result?.success === false && result?.has_conflict === true) {
        return;
      }

      closeRescheduleModal();
    } catch (error) {
      console.error("Reschedule task error:", error);

      if (error?.message === "AUTH_REQUIRED") {
        router.replace("/login");
        return;
      }

      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text("Unable to reschedule this task.", "ไม่สามารถจัดเวลาใหม่ให้กิจกรรมนี้ได้")
      );
    } finally {
      setIsRescheduling(false);
    }
  };

  const openPickNewTime = () => {
    if (!rescheduleTargetTask?.id || isRescheduling) return;

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
    if (!rescheduleTargetTask?.id || isLoadingSmartReschedule) return;

    try {
      const taskDurationMinutes = getTaskDurationMinutes(rescheduleTargetTask);

      const SMART_SEARCH_DAY_COUNT = 7;
      const SMART_DAY_START_HOUR = 8;
      const SMART_DAY_END_HOUR = 22;
      const SMART_BUFFER_MINUTES = 15;
      const SMART_MAX_TOTAL_SLOTS = 8;
      const SMART_MAX_SLOTS_PER_DAY = 8;

      // ทำให้ slot ไม่ซ้อนกันเอง
      // เช่น งาน 1 ชม. จะไม่ขึ้น 16:00-17:00 แล้วตามด้วย 16:30-17:30
      const smartSlotStepMinutes = taskDurationMinutes + SMART_BUFFER_MINUTES;

      const collectedSlots = [];
      const collectedBusySlots = [];

      setSmartRescheduleModalVisible(true);
      setIsLoadingSmartReschedule(true);
      setSmartRescheduleMessage("");
      setSmartRescheduleSlots([]);
      setSmartRescheduleBusySlots([]);

      for (let dayOffset = 0; dayOffset < SMART_SEARCH_DAY_COUNT; dayOffset++) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + dayOffset);

        const result = await getFreeTimeSlots({
          targetDate,
          durationMinutes: taskDurationMinutes,
          dayStartHour: SMART_DAY_START_HOUR,
          dayEndHour: SMART_DAY_END_HOUR,
          bufferMinutes: SMART_BUFFER_MINUTES,
          maxSlots: SMART_MAX_SLOTS_PER_DAY,
          includePastTime: false,
          slotStepMinutes: smartSlotStepMinutes,
        });

        const daySlots = Array.isArray(result?.slots) ? result.slots : [];
        const dayBusySlots = Array.isArray(result?.busy_slots)
          ? result.busy_slots
          : [];

        collectedSlots.push(...daySlots);
        collectedBusySlots.push(...dayBusySlots);

        if (collectedSlots.length >= SMART_MAX_TOTAL_SLOTS) {
          break;
        }
      }

      const limitedSlots = collectedSlots.slice(0, SMART_MAX_TOTAL_SLOTS);

      setSmartRescheduleSlots(limitedSlots);
      setSmartRescheduleBusySlots(collectedBusySlots);

      if (limitedSlots.length === 0) {
        setSmartRescheduleMessage("NO_SUITABLE_TIME_NEXT_7_DAYS");
      } else {
        setSmartRescheduleMessage("");
      }
    } catch (error) {
      console.error("Auto find best time error:", error);

      if (error?.message === "AUTH_REQUIRED") {
        router.replace("/login");
        return;
      }

      setSmartRescheduleMessage(
        text("Unable to find a suitable time.", "ไม่พบเวลาที่เหมาะสม")
      );
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text("Unable to find a suitable time.", "ไม่พบเวลาที่เหมาะสม")
      );
    } finally {
      setIsLoadingSmartReschedule(false);
    }
  };


  const handleUseSmartRescheduleSlot = async (slot) => {
    if (!rescheduleTargetTask?.id || isRescheduling) return;

    const startTime =
      normalizeDate(slot?.suggested_start_time) ||
      normalizeDate(slot?.start_time);
    const endTime =
      normalizeDate(slot?.suggested_end_time) || normalizeDate(slot?.end_time);

    if (!isValidDate(startTime) || !isValidDate(endTime)) {
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text("This time slot is not valid.", "ช่วงเวลานี้ไม่ถูกต้อง")
      );
      return;
    }

    try {
      setIsRescheduling(true);

      const result = await saveRescheduledTask(
        rescheduleTargetTask,
        startTime,
        endTime
      );

      if (result?.success === false && result?.has_conflict === true) {
        return;
      }

      setSmartRescheduleModalVisible(false);
      setRescheduleModalVisible(false);
      setSmartRescheduleSlots([]);
      setSmartRescheduleBusySlots([]);
      setSmartRescheduleMessage("");
      setRescheduleTargetTask(null);
    } catch (error) {
      console.error("Use smart reschedule slot error:", error);

      if (error?.message === "AUTH_REQUIRED") {
        router.replace("/login");
        return;
      }

      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text("Unable to reschedule this task.", "ไม่สามารถจัดเวลาใหม่ให้กิจกรรมนี้ได้")
      );
    } finally {
      setIsRescheduling(false);
    }
  };
  const openFreeTimeModal = async () => {
    if (isLoadingFreeTime) return;

    try {
      setFreeTimeModalVisible(true);
      setIsLoadingFreeTime(true);
      setFreeTimeMessage("");
      setFreeTimeSlots([]);
      setFreeTimeBusySlots([]);

      const result = await getFreeTimeSlots({
        targetDate: new Date(),
        durationMinutes: freeTimeDuration,
        dayStartHour: 4,
        dayEndHour: 23,
        bufferMinutes: 0,
        maxSlots: 200,
        includePastTime: false,
      });

      setFreeTimeSlots(result?.slots || []);
      setFreeTimeBusySlots(result?.busy_slots || []);
      setFreeTimeMessage(result?.message || "");
    } catch (error) {
      console.error("Get free time slots error:", error);

      if (error?.message === "AUTH_REQUIRED") {
        router.replace("/login");
        return;
      }

      setFreeTimeMessage(
        text("Unable to calculate free time.", "ไม่สามารถคำนวณเวลาว่างได้")
      );
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text("Unable to calculate free time.", "ไม่สามารถคำนวณเวลาว่างได้")
      );
    } finally {
      setIsLoadingFreeTime(false);
    }
  };

  const closeFreeTimeModal = () => {
    if (isLoadingFreeTime) return;

    setFreeTimeModalVisible(false);
    setFreeTimeMessage("");
  };

  const handleChangeFreeTimeDuration = async (duration) => {
    if (isLoadingFreeTime) return;

    try {
      setFreeTimeDuration(duration);
      setIsLoadingFreeTime(true);
      setFreeTimeMessage("");
      setFreeTimeSlots([]);
      setFreeTimeBusySlots([]);

      const result = await getFreeTimeSlots({
        targetDate: new Date(),
        durationMinutes: duration,
        dayStartHour: 4,
        dayEndHour: 23,
        bufferMinutes: 0,
        maxSlots: 200,
        includePastTime: false,
      });

      setFreeTimeSlots(result?.slots || []);
      setFreeTimeBusySlots(result?.busy_slots || []);
      setFreeTimeMessage(result?.message || "");
    } catch (error) {
      console.error("Change free time duration error:", error);

      if (error?.message === "AUTH_REQUIRED") {
        router.replace("/login");
        return;
      }

      setFreeTimeMessage(
        text("Unable to calculate free time.", "ไม่สามารถคำนวณเวลาว่างได้")
      );
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text("Unable to calculate free time.", "ไม่สามารถคำนวณเวลาว่างได้")
      );
    } finally {
      setIsLoadingFreeTime(false);
    }
  };

  const handleUseFreeTimeSlot = (slot) => {
    const startTime =
      normalizeDate(slot?.suggested_start_time) ||
      normalizeDate(slot?.start_time);
    const endTime =
      normalizeDate(slot?.suggested_end_time) || normalizeDate(slot?.end_time);

    if (!isValidDate(startTime) || !isValidDate(endTime)) {
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text("This time slot is not valid.", "ช่วงเวลานี้ไม่ถูกต้อง")
      );
      return;
    }

    setFreeTimeModalVisible(false);

    router.push({
      pathname: "/add-task",
      params: {
        from: "free-time",
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      },
    });
  };

  const performDeleteSingleTask = async () => {
    if (!deleteTargetTask?.id || isDeleting) return;

    try {
      setIsDeleting(true);
      await deleteTask(deleteTargetTask.id);
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
    if (!deleteTargetTask?.recurrence_group_id || isDeleting) return;

    try {
      setIsDeleting(true);
      await deleteRecurringTaskGroup(deleteTargetTask.recurrence_group_id);
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
    if (!deleteTargetTask?.id || isDeleting) return;

    try {
      setIsDeleting(true);
      await deletePlanningTaskWithSessions(deleteTargetTask.id);
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

  const handleEditTask = (taskId) => {
    router.push({
      pathname: "/edit-task",
      params: {
        id: String(taskId),
        from: "tasks",
      },
    });
  };

  const renderTaskCard = (task, sectionKey = "") => {
    const priority = getPriority(task);
    const priorityStyle = getPriorityStyle(priority);
    const accent = getTaskAccent(task);

    const isCompletedLate = isCompletedLateTask(task);
    const hideTypeTag = sectionKey === "completed-late";
    const showRescheduleButton = sectionKey === "overdue-tasks";

    return (
      <View key={task.id} style={styles.taskCard}>
        <Pressable
          style={[
            styles.checkButton,
            task.is_completed && styles.checkButtonActive,
            isCompletedLate && styles.checkButtonLateActive,
          ]}
          onPress={() =>
            task.is_completed ? handleUndoTask(task.id) : handleDoneTask(task.id)
          }
        >
          {task.is_completed ? (
            <Ionicons name="checkmark" size={18} color={COLORS.textLight} />
          ) : null}
        </Pressable>

        <View style={styles.taskInfo}>
          <View style={styles.taskTitleRow}>
            <Text
              style={[
                styles.taskTitle,
                task.is_completed && styles.taskTitleCompleted,
              ]}
              numberOfLines={1}
            >
              {task.title || text("Untitled Task", "ไม่มีชื่อกิจกรรม")}
            </Text>
          </View>

          {task.detail ? (
            <Text style={styles.taskDetail} numberOfLines={1}>
              {task.detail}
            </Text>
          ) : null}

          <View style={styles.metaRow}>
            <Ionicons
              name="calendar-outline"
              size={14}
              color={COLORS.textMuted}
            />
            <Text style={styles.metaText}>
              {formatTaskDateRange(task.start_time, task.end_time)}
            </Text>

            <Ionicons
              name="time-outline"
              size={14}
              color={COLORS.textMuted}
            />
            <Text style={styles.metaText}>
              {formatTaskTimeRange(task.start_time, task.end_time)}
            </Text>
          </View>

          {task.planning_enabled ? (
            <View style={styles.progressBox}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressText}>
                  {text("Progress", "ความคืบหน้า")}:{" "}
                  {task.planned_completed_count || 0}/
                  {task.planned_session_count || 0}{" "}
                  {text("sessions completed", "เซสชันเสร็จแล้ว")}
                </Text>
                <Text style={styles.progressPercent}>
                  {task.planned_session_count
                    ? Math.round(
                      ((task.planned_completed_count || 0) /
                        task.planned_session_count) *
                      100
                    )
                    : 0}
                  %
                </Text>
              </View>

              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${task.planned_session_count
                        ? Math.min(
                          100,
                          Math.round(
                            ((task.planned_completed_count || 0) /
                              task.planned_session_count) *
                            100
                          )
                        )
                        : 0
                        }%`,
                    },
                  ]}
                />
              </View>
            </View>
          ) : null}

          <View style={styles.tagRow}>
            {!hideTypeTag ? (
              <View
                style={[
                  styles.typeTag,
                  { backgroundColor: accent.backgroundColor },
                ]}
              >
                <Ionicons name={accent.icon} size={14} color={accent.color} />
                <Text style={[styles.typeText, { color: accent.color }]}>
                  {getTaskTypeLabel(task)}
                </Text>
              </View>
            ) : null}

            <View
              style={[
                styles.priorityTag,
                { backgroundColor: priorityStyle.backgroundColor },
              ]}
            >
              <Ionicons
                name={priorityStyle.icon}
                size={14}
                color={priorityStyle.color}
              />
              <Text
                style={[styles.priorityText, { color: priorityStyle.color }]}
              >
                {priority}
              </Text>
            </View>

            <View style={styles.repeatTag}>
              <Ionicons
                name={
                  task.is_generated_session ? "layers-outline" : "repeat-outline"
                }
                size={14}
                color={COLORS.primary}
              />
              <Text style={styles.repeatText}>{getRepeatLabel(task)}</Text>
            </View>

            {task.deadline ? (
              <View style={styles.deadlineTag}>
                <Ionicons
                  name="hourglass-outline"
                  size={14}
                  color={COLORS.warning}
                />
                <Text style={styles.deadlineText}>
                  {text("Deadline", "กำหนดส่ง")} {formatDate(task.deadline)}
                </Text>
              </View>
            ) : null}

            {isOverdueTask(task) ? (
              <View style={styles.overdueTag}>
                <Ionicons
                  name="alert-circle-outline"
                  size={14}
                  color={COLORS.danger}
                />
                <Text style={styles.overdueText}>
                  {text("Overdue", "เลยเวลา")}
                </Text>
              </View>
            ) : null}

            {task.has_conflict ? (
              <View style={styles.conflictTag}>
                <Ionicons
                  name="alert-circle-outline"
                  size={14}
                  color={COLORS.danger}
                />
                <Text style={styles.conflictText}>
                  {text("Conflict", "เวลาทับซ้อน")}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.actionColumn}>
          {showRescheduleButton ? (
            <Pressable
              style={[styles.iconAction, styles.rescheduleIconAction]}
              onPress={() => openRescheduleModal(task)}
            >
              <Ionicons
                name="calendar-number-outline"
                size={20}
                color={COLORS.primary}
              />
            </Pressable>
          ) : null}

          <Pressable
            style={styles.iconAction}
            onPress={() => handleEditTask(task.id)}
          >
            <Ionicons name="create-outline" size={20} color={COLORS.text} />
          </Pressable>

          <Pressable
            style={styles.iconAction}
            onPress={() => openDeleteModal(task)}
          >
            <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
          </Pressable>
        </View>
      </View>
    );
  };

  const renderSectionAction = (section, isExpanded, shouldShowToggle) => {
    if (!shouldShowToggle) {
      return (
        <View
          style={[
            styles.sectionCountBadge,
            { backgroundColor: section.backgroundColor },
          ]}
        >
          <Text style={[styles.sectionCountText, { color: section.color }]}>
            {section.data.length}
          </Text>
        </View>
      );
    }

    return (
      <Pressable
        style={[
          styles.sectionActionButton,
          { backgroundColor: section.backgroundColor },
        ]}
        onPress={() => toggleSectionExpanded(section.key)}
      >
        <Text style={[styles.sectionActionText, { color: section.color }]}>
          {isExpanded
            ? text("Show less", "แสดงน้อยลง")
            : `${text("See all", "ดูทั้งหมด")} ${section.data.length}`}
        </Text>

        <Ionicons
          name={isExpanded ? "chevron-up-outline" : "chevron-down-outline"}
          size={15}
          color={section.color}
        />
      </Pressable>
    );
  };

  const renderTaskSection = (section) => {
    const isExpanded = expandedSections[section.key] === true;
    const shouldShowToggle = section.data.length > SECTION_PREVIEW_LIMIT;
    const visibleTasks = isExpanded
      ? section.data
      : section.data.slice(0, SECTION_PREVIEW_LIMIT);

    return (
      <View key={section.key} style={styles.sectionBlock}>
        <View style={styles.sectionTop}>
          <View style={styles.sectionTitleBox}>
            <View
              style={[
                styles.sectionIcon,
                { backgroundColor: section.backgroundColor },
              ]}
            >
              <Ionicons name={section.icon} size={20} color={section.color} />
            </View>

            <View style={styles.sectionTextBox}>
              <Text style={styles.sectionName}>{section.title}</Text>
            </View>
          </View>

          {renderSectionAction(section, isExpanded, shouldShowToggle)}
        </View>

        {visibleTasks.map((task) => renderTaskCard(task, section.key))}
      </View>
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

  const filterOptions = [
    { label: text("All", "ทั้งหมด"), value: "all" },
    { label: text("Today", "วันนี้"), value: "today" },
    { label: text("Upcoming", "กำลังจะมาถึง"), value: "upcoming" },
    { label: text("Completed", "เสร็จแล้ว"), value: "completed" },
    { label: text("Conflict", "เวลาทับซ้อน"), value: "conflict" },
  ];

  const sortOptions = [
    { label: text("Time", "เวลา"), value: "time" },
    { label: text("Priority", "ความสำคัญ"), value: "priority" },
    { label: text("Deadline", "กำหนดส่ง"), value: "deadline" },
  ];

  const smartRescheduleDuration = rescheduleTargetTask
    ? getTaskDurationMinutes(rescheduleTargetTask)
    : 60;

  const rescheduleConflictItems = getConflictItems(rescheduleConflictResult);
  const rescheduleConflictPreviewItems = rescheduleConflictItems.slice(0, 5);
  const remainingRescheduleConflictCount =
    rescheduleConflictItems.length > 5 ? rescheduleConflictItems.length - 5 : 0;
  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.pageTitle}>{text("Tasks", "กิจกรรม")}</Text>
            <Text style={styles.pageSubtitle}></Text>
          </View>
        </View>
        <View style={styles.searchFilterRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={20} color={COLORS.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder={text("Search tasks", "ค้นหากิจกรรม")}
              placeholderTextColor={COLORS.textMuted}
              value={searchText}
              onChangeText={setSearchText}
            />
          </View>

          <Pressable
            style={[
              styles.filterIconButton,
              showControls && styles.filterIconButtonActive,
            ]}
            onPress={() => setShowControls((current) => !current)}
          >
            <Ionicons
              name="options-outline"
              size={24}
              color={showControls ? COLORS.textLight : COLORS.primary}
            />
          </Pressable>
        </View>

        {searchText.trim().length > 0 && searchSuggestions.length > 0 ? (
          <View style={styles.searchSuggestionBox}>
            {searchSuggestions.map((task) => (
              <Pressable
                key={task.id}
                style={styles.searchSuggestionItem}
                onPress={() => setSearchText(task.title || "")}
              >
                <Ionicons
                  name="search-outline"
                  size={16}
                  color={COLORS.textMuted}
                />

                <View style={styles.searchSuggestionTextBox}>
                  <Text style={styles.searchSuggestionTitle} numberOfLines={1}>
                    {task.title || text("Untitled Task", "ไม่มีชื่อกิจกรรม")}
                  </Text>

                  <Text style={styles.searchSuggestionTime} numberOfLines={1}>
                    {formatTaskDateRange(task.start_time, task.end_time)} •{" "}
                    {formatTaskTimeRange(task.start_time, task.end_time)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}


        {showControls ? (
          <>
            <Text style={styles.controlTitle}>{text("Filter", "ตัวกรอง")}</Text>

            <View style={styles.horizontalOptionsWrapper}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
                onScroll={(event) => {
                  const { contentOffset, contentSize, layoutMeasurement } =
                    event.nativeEvent;

                  const isNearEnd =
                    contentOffset.x + layoutMeasurement.width >=
                    contentSize.width - 24;

                  setShowFilterArrow(!isNearEnd);
                }}
                scrollEventThrottle={16}
              >
                {filterOptions.map((option) => (
                  <Pressable
                    key={option.value}
                    style={[
                      styles.chip,
                      filter === option.value && styles.chipActive,
                    ]}
                    onPress={() => setFilter(option.value)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        filter === option.value && styles.chipTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              {showFilterArrow ? (
                <View pointerEvents="none" style={styles.scrollArrowOverlay}>
                  <Text style={styles.scrollArrowText}>›</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.controlTitle}>{text("Sort by", "เรียงตาม")}</Text>

            <View style={styles.sortRow}>
              {sortOptions.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.sortButton,
                    sortBy === option.value && styles.sortButtonActive,
                  ]}
                  onPress={() => setSortBy(option.value)}
                >
                  <Text
                    style={[
                      styles.sortText,
                      sortBy === option.value && styles.sortTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{tasks.length}</Text>
            <Text style={styles.summaryLabel}>{text("All", "ทั้งหมด")}</Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>
              {tasks.filter((task) => isToday(task.start_time)).length}
            </Text>
            <Text style={styles.summaryLabel}>{text("Today", "วันนี้")}</Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>
              {tasks.filter((task) => task.is_generated_session).length}
            </Text>
            <Text style={styles.summaryLabel}>
              {text("Sessions", "เซสชัน")}
            </Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>
              {tasks.filter((task) => task.is_completed).length}
            </Text>
            <Text style={styles.summaryLabel}>{text("Done", "เสร็จแล้ว")}</Text>
          </View>
        </View>

        <View style={styles.smartSuggestionCard}>
          <View style={styles.smartSuggestionTextBox}>
            <View style={styles.smartSuggestionIcon}>
              <Ionicons
                name="sparkles-outline"
                size={22}
                color={COLORS.primary}
              />
            </View>

            <View style={styles.smartSuggestionCopy}>
              <Text style={styles.smartSuggestionTitle}>
                {text("Suggest Free Time", "แนะนำเวลาว่าง")}
              </Text>
              <Text style={styles.smartSuggestionSubtitle}></Text>
            </View>
          </View>

          <Pressable
            style={styles.smartSuggestionButton}
            onPress={openFreeTimeModal}
            disabled={isLoadingFreeTime}
          >
            <Text style={styles.smartSuggestionButtonText}>
              {isLoadingFreeTime
                ? text("Checking...", "กำลังตรวจสอบ...")
                : text("Find", "ค้นหา")}
            </Text>
          </Pressable>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>
            {text("Task Sections", "หมวดหมู่กิจกรรม")}
          </Text>
          <Text style={styles.listCount}>
            {filteredTasks.length} {text("item(s)", "รายการ")}
          </Text>
        </View>

        {filteredTasks.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons
              name="file-tray-outline"
              size={42}
              color={COLORS.textMuted}
            />
            <Text style={styles.emptyTitle}>
              {text("No tasks found", "ไม่พบกิจกรรม")}
            </Text>
            <Text style={styles.emptyText}>
              {text(
                "Try changing the filter or create a new task.",
                "ลองเปลี่ยนตัวกรอง หรือสร้างกิจกรรมใหม่"
              )}
            </Text>
          </View>
        ) : (
          taskSections.map(renderTaskSection)
        )}
      </ScrollView>

      <BottomNav activeTab="task" />

      <Pressable
        style={styles.fabButton}
        onPress={() =>
          router.push({
            pathname: "/add-task",
            params: {
              from: "tasks",
            },
          })
        }
      >
        <Ionicons name="add" size={34} color={COLORS.textLight} />
      </Pressable>

      <Modal
        visible={freeTimeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeFreeTimeModal}
      >
        <Pressable style={styles.overlay} onPress={closeFreeTimeModal}>
          <Pressable
            style={styles.freeTimeModalBox}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.freeTimeModalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {text("Suggested Free Time", "เวลาว่างที่แนะนำ")}
                </Text>
                <Text style={styles.freeTimeModalSubtitle}>
                  {text("Today", "วันนี้")} ·{" "}
                  {text("Need at least", "ต้องการอย่างน้อย")}{" "}
                  {formatDurationMinutes(freeTimeDuration)}
                </Text>
              </View>

              <Pressable
                style={styles.freeTimeCloseButton}
                onPress={closeFreeTimeModal}
                disabled={isLoadingFreeTime}
              >
                <Ionicons name="close" size={22} color={COLORS.text} />
              </Pressable>
            </View>

            <Text style={styles.modalMessage}>
              {text(
                "The system checks active tasks and shows available time slots you can use for a new task.",
                "ระบบจะตรวจสอบกิจกรรมที่มีอยู่ และแสดงช่วงเวลาว่างที่สามารถใช้เพิ่มกิจกรรมใหม่ได้"
              )}
            </Text>

            <Text style={styles.freeTimeSectionLabel}>
              {text("Task Duration", "ระยะเวลาของกิจกรรม")}
            </Text>

            <View style={styles.durationChipRow}>
              {[30, 60, 90, 120].map((duration) => (
                <Pressable
                  key={duration}
                  style={[
                    styles.durationChip,
                    freeTimeDuration === duration && styles.durationChipActive,
                    isLoadingFreeTime && styles.disabledButton,
                  ]}
                  onPress={() => handleChangeFreeTimeDuration(duration)}
                  disabled={isLoadingFreeTime}
                >
                  <Text
                    style={[
                      styles.durationChipText,
                      freeTimeDuration === duration &&
                      styles.durationChipTextActive,
                    ]}
                  >
                    {formatDurationMinutes(duration)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.freeTimeSummaryBox}>
              <View style={styles.freeTimeSummaryItem}>
                <Text style={styles.freeTimeSummaryNumber}>
                  {freeTimeSlots.length}
                </Text>
                <Text style={styles.freeTimeSummaryLabel}>
                  {text("Free Slots", "ช่วงว่าง")}
                </Text>
              </View>

              <View style={styles.freeTimeSummaryDivider} />

              <View style={styles.freeTimeSummaryItem}>
                <Text style={styles.freeTimeSummaryNumber}>
                  {freeTimeBusySlots.length}
                </Text>
                <Text style={styles.freeTimeSummaryLabel}>
                  {text("Busy Blocks", "ช่วงไม่ว่าง")}
                </Text>
              </View>
            </View>

            {isLoadingFreeTime ? (
              <View style={styles.freeTimeLoadingBox}>
                <Text style={styles.freeTimeLoadingText}>
                  {text(
                    "Calculating available time...",
                    "กำลังคำนวณเวลาว่าง..."
                  )}
                </Text>
              </View>
            ) : freeTimeSlots.length === 0 ? (
              <View style={styles.freeTimeEmptyBox}>
                <Ionicons
                  name="time-outline"
                  size={34}
                  color={COLORS.textMuted}
                />
                <Text style={styles.freeTimeEmptyTitle}>
                  {text("No free time found", "ไม่พบเวลาว่าง")}
                </Text>
                <Text style={styles.freeTimeEmptyText}>
                  {freeTimeMessage === "NO_TIME_LEFT_TODAY"
                    ? text(
                      "There is no remaining time today based on your schedule.",
                      "จากตารางกิจกรรมวันนี้ ไม่เหลือเวลาว่างแล้ว"
                    )
                    : text(
                      "Try choosing a shorter duration or reschedule some tasks.",
                      "ลองเลือกระยะเวลาที่สั้นลง หรือจัดเวลาใหม่ให้กิจกรรมบางรายการ"
                    )}
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.freeTimeList}
                contentContainerStyle={styles.freeTimeListContent}
                showsVerticalScrollIndicator={false}
              >
                {freeTimeSlots.map((slot, index) => {
                  const slotStart = normalizeDate(slot.start_time);
                  const suggestedStart = normalizeDate(
                    slot.suggested_start_time
                  );
                  const suggestedEnd = normalizeDate(slot.suggested_end_time);

                  return (
                    <View
                      key={`${slotStart?.toISOString() || "slot"}-${index}`}
                      style={styles.freeTimeSlotCard}
                    >
                      <View style={styles.freeTimeSlotTop}>
                        <View style={styles.freeTimeSlotIcon}>
                          <Ionicons
                            name="time-outline"
                            size={20}
                            color={COLORS.primary}
                          />
                        </View>

                        <View style={styles.freeTimeSlotInfo}>
                          <Text style={styles.freeTimeSlotTitle}>
                            {formatTaskTimeRange(suggestedStart, suggestedEnd)}
                          </Text>
                          <Text style={styles.freeTimeSlotSubtitle}>
                            {formatTaskDateRange(
                              suggestedStart,
                              suggestedEnd
                            )}{" "}
                            · {text("Duration", "ระยะเวลา")}{" "}
                            {formatDurationMinutes(freeTimeDuration)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.suggestedTimeBox}>
                        <Text style={styles.suggestedTimeLabel}>
                          {text("Suggested task time", "เวลากิจกรรมที่แนะนำ")}
                        </Text>
                        <Text style={styles.suggestedTimeValue}>
                          {formatConflictDateTime(
                            suggestedStart,
                            suggestedEnd
                          )}
                        </Text>
                      </View>

                      <Pressable
                        style={styles.useSlotButton}
                        onPress={() => handleUseFreeTimeSlot(slot)}
                      >
                        <Text style={styles.useSlotButtonText}>
                          {text("Use This Slot", "ใช้ช่วงเวลานี้")}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            <Pressable
              style={styles.cancelModalButton}
              onPress={closeFreeTimeModal}
              disabled={isLoadingFreeTime}
            >
              <Text style={styles.cancelModalButtonText}>
                {text("Close", "ปิด")}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={rescheduleModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeRescheduleModal}
      >
        <Pressable style={styles.overlay} onPress={closeRescheduleModal}>
          <Pressable
            style={styles.modalBox}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.modalTitle}>
              {text("Reschedule Task", "จัดเวลาใหม่")}
            </Text>

            <Text style={styles.modalMessage}>
              {text(
                "Move this overdue task to a new time while keeping its original duration.",
                "ย้ายกิจกรรมที่เลยเวลาไปยังเวลาใหม่ โดยคงระยะเวลาเดิมไว้"
              )}
            </Text>

            {rescheduleTargetTask ? (
              <View style={styles.previewBox}>
                <Text style={styles.previewTitle} numberOfLines={1}>
                  {rescheduleTargetTask.title ||
                    text("Untitled Task", "ไม่มีชื่อกิจกรรม")}
                </Text>

                <Text style={styles.previewText}>
                  {text("Current", "เวลาปัจจุบัน")}:{" "}
                  {formatConflictDateTime(
                    rescheduleTargetTask.start_time,
                    rescheduleTargetTask.end_time
                  )}
                </Text>
              </View>
            ) : null}

            <Pressable
              style={[
                styles.smartModalButton,
                (isRescheduling || isLoadingSmartReschedule) &&
                styles.disabledButton,
              ]}
              onPress={openSmartRescheduleModal}
              disabled={isRescheduling || isLoadingSmartReschedule}
            >
              <Ionicons
                name="sparkles-outline"
                size={20}
                color={COLORS.textLight}
              />
              <Text style={styles.smartModalButtonText}>
                {isLoadingSmartReschedule
                  ? text("Finding Best Time...", "กำลังหาเวลาที่เหมาะสม...")
                  : text("Auto Find Best Time", "หาเวลาที่เหมาะสมอัตโนมัติ")}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.primaryModalButton,
                isRescheduling && styles.disabledButton,
              ]}
              onPress={() => performQuickReschedule("today")}
              disabled={isRescheduling}
            >
              <Ionicons
                name="today-outline"
                size={20}
                color={COLORS.textLight}
              />
              <Text style={styles.primaryModalButtonText}>
                {isRescheduling
                  ? text("Rescheduling...", "กำลังจัดเวลาใหม่...")
                  : text("Move to Today", "ย้ายมาวันนี้")}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.secondaryModalButton,
                isRescheduling && styles.disabledButton,
              ]}
              onPress={() => performQuickReschedule("tomorrow")}
              disabled={isRescheduling}
            >
              <Ionicons
                name="calendar-outline"
                size={20}
                color={COLORS.primary}
              />
              <Text style={styles.secondaryModalButtonText}>
                {text("Move to Tomorrow", "ย้ายไปพรุ่งนี้")}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.secondaryModalButton,
                isRescheduling && styles.disabledButton,
              ]}
              onPress={openPickNewTime}
              disabled={isRescheduling}
            >
              <Ionicons name="time-outline" size={20} color={COLORS.primary} />
              <Text style={styles.secondaryModalButtonText}>
                {text("Pick New Time", "เลือกเวลาใหม่")}
              </Text>
            </Pressable>

            <Pressable
              style={styles.cancelModalButton}
              onPress={closeRescheduleModal}
              disabled={isRescheduling || isLoadingSmartReschedule}
            >
              <Text style={styles.cancelModalButtonText}>
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
        <Pressable style={styles.overlay} onPress={closeSmartRescheduleModal}>
          <Pressable
            style={styles.freeTimeModalBox}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.freeTimeModalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {text("Auto Find Best Time", "หาเวลาที่เหมาะสมอัตโนมัติ")}
                </Text>
                <Text style={styles.freeTimeModalSubtitle}>
                  {text("Next 7 days", "ภายใน 7 วันข้างหน้า")} ·{" "}
                  {text("Need at least", "ต้องการอย่างน้อย")}{" "}
                  {formatDurationMinutes(smartRescheduleDuration)}
                </Text>
              </View>

              <Pressable
                style={styles.freeTimeCloseButton}
                onPress={closeSmartRescheduleModal}
                disabled={isLoadingSmartReschedule || isRescheduling}
              >
                <Ionicons name="close" size={22} color={COLORS.text} />
              </Pressable>
            </View>

            <Text style={styles.modalMessage}>
              {text(
                "The system finds free slots that can fit this overdue task. Choose a slot to reschedule it automatically.",
                "ระบบจะค้นหาช่วงเวลาว่างที่เหมาะกับกิจกรรมที่เลยเวลา แล้วสามารถเลือกเพื่อจัดเวลาใหม่อัตโนมัติ"
              )}
            </Text>

            {rescheduleTargetTask ? (
              <View style={styles.previewBox}>
                <Text style={styles.previewTitle} numberOfLines={1}>
                  {rescheduleTargetTask.title ||
                    text("Untitled Task", "ไม่มีชื่อกิจกรรม")}
                </Text>

                <Text style={styles.previewText}>
                  {text("Current", "เวลาปัจจุบัน")}:{" "}
                  {formatConflictDateTime(
                    rescheduleTargetTask.start_time,
                    rescheduleTargetTask.end_time
                  )}
                </Text>
              </View>
            ) : null}

            <View style={styles.freeTimeSummaryBox}>
              <View style={styles.freeTimeSummaryItem}>
                <Text style={styles.freeTimeSummaryNumber}>
                  {smartRescheduleSlots.length}
                </Text>
                <Text style={styles.freeTimeSummaryLabel}>
                  {text("Best Slots", "ช่วงเวลาที่เหมาะสม")}
                </Text>
              </View>

              <View style={styles.freeTimeSummaryDivider} />

              <View style={styles.freeTimeSummaryItem}>
                <Text style={styles.freeTimeSummaryNumber}>
                  {smartRescheduleBusySlots.length}
                </Text>
                <Text style={styles.freeTimeSummaryLabel}>
                  {text("Busy Blocks", "ช่วงไม่ว่าง")}
                </Text>
              </View>
            </View>

            {isLoadingSmartReschedule ? (
              <View style={styles.freeTimeLoadingBox}>
                <Text style={styles.freeTimeLoadingText}>
                  {text("Finding suitable time...", "กำลังหาเวลาที่เหมาะสม...")}
                </Text>
              </View>
            ) : smartRescheduleSlots.length === 0 ? (
              <View style={styles.freeTimeEmptyBox}>
                <Ionicons
                  name="sparkles-outline"
                  size={34}
                  color={COLORS.textMuted}
                />
                <Text style={styles.freeTimeEmptyTitle}>
                  {text("No suitable time found", "ไม่พบเวลาที่เหมาะสม")}
                </Text>
                <Text style={styles.freeTimeEmptyText}>
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
                style={styles.freeTimeList}
                contentContainerStyle={styles.freeTimeListContent}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
                keyboardShouldPersistTaps="handled"
              >
                {smartRescheduleSlots.map((slot, index) => {
                  const slotStart = normalizeDate(slot.start_time);
                  const suggestedStart = normalizeDate(
                    slot.suggested_start_time
                  );
                  const suggestedEnd = normalizeDate(slot.suggested_end_time);

                  return (
                    <View
                      key={`smart-${slotStart?.toISOString() || "slot"}-${index}`}
                      style={styles.freeTimeSlotCard}
                    >
                      <View style={styles.freeTimeSlotTop}>
                        <View style={styles.freeTimeSlotIcon}>
                          <Ionicons
                            name="sparkles-outline"
                            size={20}
                            color={COLORS.primary}
                          />
                        </View>

                        <View style={styles.freeTimeSlotInfo}>
                          <Text style={styles.freeTimeSlotTitle}>
                            {formatTaskTimeRange(suggestedStart, suggestedEnd)}
                          </Text>
                          <Text style={styles.freeTimeSlotSubtitle}>
                            {formatTaskDateRange(
                              suggestedStart,
                              suggestedEnd
                            )}{" "}
                            · {text("Duration", "ระยะเวลา")}{" "}
                            {formatDurationMinutes(smartRescheduleDuration)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.suggestedTimeBox}>
                        <Text style={styles.suggestedTimeLabel}>
                          {text("New task time", "เวลาใหม่ของกิจกรรม")}
                        </Text>
                        <Text style={styles.suggestedTimeValue}>
                          {formatConflictDateTime(
                            suggestedStart,
                            suggestedEnd
                          )}
                        </Text>
                      </View>

                      <Pressable
                        style={[
                          styles.useSlotButton,
                          isRescheduling && styles.disabledButton,
                        ]}
                        onPress={() => handleUseSmartRescheduleSlot(slot)}
                        disabled={isRescheduling}
                      >
                        <Text style={styles.useSlotButtonText}>
                          {isRescheduling
                            ? text("Rescheduling...", "กำลังจัดเวลาใหม่...")
                            : text("Use This Time", "ใช้เวลานี้")}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            <Pressable
              style={styles.cancelModalButton}
              onPress={closeSmartRescheduleModal}
              disabled={isLoadingSmartReschedule || isRescheduling}
            >
              <Text style={styles.cancelModalButtonText}>
                {text("Close", "ปิด")}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={rescheduleConflictModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeRescheduleConflictModal}
      >
        <Pressable style={styles.overlay} onPress={closeRescheduleConflictModal}>
          <Pressable
            style={styles.freeTimeModalBox}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.freeTimeModalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {text("Time Conflict Detected", "พบเวลาทับซ้อน")}
                </Text>
                <Text style={styles.freeTimeModalSubtitle}>
                  {text(
                    "Reschedule was not saved",
                    "ยังไม่ได้บันทึกการจัดเวลาใหม่"
                  )}
                </Text>
              </View>

              <Pressable
                style={styles.freeTimeCloseButton}
                onPress={closeRescheduleConflictModal}
                disabled={isRescheduling}
              >
                <Ionicons name="close" size={22} color={COLORS.text} />
              </Pressable>
            </View>

            <Text style={styles.modalMessage}>
              {text(
                "The new time overlaps with another active task. Choose a different time to avoid duplicated schedules.",
                "เวลาใหม่ทับซ้อนกับกิจกรรมอื่น กรุณาเลือกเวลาอื่นเพื่อป้องกันตารางซ้ำกัน"
              )}
            </Text>

            {pendingRescheduleRange ? (
              <View style={styles.previewBox}>
                <Text style={styles.previewTitle}>
                  {text("Requested New Time", "เวลาใหม่ที่ต้องการ")}
                </Text>
                <Text style={styles.previewText}>
                  {formatConflictDateTime(
                    pendingRescheduleRange.start_time,
                    pendingRescheduleRange.end_time
                  )}
                </Text>
              </View>
            ) : null}

            <View style={styles.conflictListBox}>
              {rescheduleConflictPreviewItems.length === 0 ? (
                <Text style={styles.conflictEmptyText}>
                  {text("No conflict details found.", "ไม่พบรายละเอียดเวลาทับซ้อน")}
                </Text>
              ) : (
                rescheduleConflictPreviewItems.map((item, index) => (
                  <View
                    key={`${item.task_id || "conflict"}-${index}`}
                    style={styles.conflictItem}
                  >
                    <Text style={styles.conflictItemTitle} numberOfLines={1}>
                      {item.title || text("Untitled Task", "ไม่มีชื่อกิจกรรม")}
                    </Text>

                    <Text style={styles.conflictItemTime}>
                      {text("Existing", "กิจกรรมเดิม")}:{" "}
                      {formatConflictDateTime(item.start_time, item.end_time)}
                    </Text>

                    {item.conflict_instance_start_time ? (
                      <Text style={styles.conflictNewTime}>
                        {text("New", "เวลาใหม่")}:{" "}
                        {formatConflictDateTime(
                          item.conflict_instance_start_time,
                          item.conflict_instance_end_time
                        )}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}

              {remainingRescheduleConflictCount > 0 ? (
                <Text style={styles.conflictMoreText}>
                  +{remainingRescheduleConflictCount}{" "}
                  {text("more conflict(s)", "รายการที่ทับซ้อนเพิ่มเติม")}
                </Text>
              ) : null}
            </View>

            <Pressable
              style={styles.primaryModalButton}
              onPress={handlePickNewTimeFromConflict}
              disabled={isRescheduling}
            >
              <Ionicons
                name="time-outline"
                size={20}
                color={COLORS.textLight}
              />
              <Text style={styles.primaryModalButtonText}>
                {text("Pick New Time", "เลือกเวลาใหม่")}
              </Text>
            </Pressable>

            <Pressable
              style={styles.cancelModalButton}
              onPress={closeRescheduleConflictModal}
              disabled={isRescheduling}
            >
              <Text style={styles.cancelModalButtonText}>
                {text("Cancel", "ยกเลิก")}
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
        <Pressable style={styles.overlay} onPress={closeDeleteModal}>
          <Pressable
            style={styles.modalBox}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.modalTitle}>{getDeleteModalTitle()}</Text>

            <Text style={styles.modalMessage}>{getDeleteModalMessage()}</Text>

            {deleteTargetTask?.planning_enabled ? (
              <Pressable
                style={[
                  styles.dangerModalButton,
                  isDeleting && styles.disabledButton,
                ]}
                onPress={performDeletePlanningWithSessions}
                disabled={isDeleting}
              >
                <Text style={styles.dangerModalButtonText}>
                  {text(
                    "Delete Study Plan and All Sessions",
                    "ลบแผนการเรียนและเซสชันทั้งหมด"
                  )}
                </Text>
              </Pressable>
            ) : deleteTargetTask?.is_recurring &&
              deleteTargetTask?.recurrence_group_id ? (
              <>
                <Pressable
                  style={[
                    styles.primaryModalButton,
                    isDeleting && styles.disabledButton,
                  ]}
                  onPress={performDeleteSingleTask}
                  disabled={isDeleting}
                >
                  <Text style={styles.primaryModalButtonText}>
                    {text("Delete this task only", "ลบเฉพาะกิจกรรมนี้")}
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.dangerModalButton,
                    isDeleting && styles.disabledButton,
                  ]}
                  onPress={performDeleteRecurringGroup}
                  disabled={isDeleting}
                >
                  <Text style={styles.dangerModalButtonText}>
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
                  styles.dangerModalButton,
                  isDeleting && styles.disabledButton,
                ]}
                onPress={performDeleteSingleTask}
                disabled={isDeleting}
              >
                <Text style={styles.dangerModalButtonText}>
                  {isDeleting
                    ? text("Deleting...", "กำลังลบ...")
                    : text("Delete Task", "ลบกิจกรรม")}
                </Text>
              </Pressable>
            )}

            <Pressable
              style={styles.cancelModalButton}
              onPress={closeDeleteModal}
              disabled={isDeleting}
            >
              <Text style={styles.cancelModalButtonText}>
                {text("Cancel", "ยกเลิก")}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  searchSuggestionBox: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: -4,
    marginBottom: 14,
    overflow: "hidden",
  },

  searchSuggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider || COLORS.border,
  },
  searchSuggestionTextBox: {
    flex: 1,
  },

  searchSuggestionTime: {
    marginTop: 2,
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: "600",
  },
  searchSuggestionTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.text,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 18,
    color: COLORS.textMuted,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  fabButton: {
    position: "absolute",
    right: 30,
    bottom: 135,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: COLORS.background,
    zIndex: 20,
    elevation: 12,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 22,
    paddingTop: 62,
    paddingBottom: 170,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 22,
  },
  pageTitle: {
    fontSize: 36,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: -0.7,
    marginTop: 0,
    marginBottom: 0,
    lineHeight: 42,
  },
  pageSubtitle: {
    marginTop: 6,
    fontSize: 16,
    color: COLORS.textMuted,
    maxWidth: 260,
  },

  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
    paddingHorizontal: 10,
  },
  controlTitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: "800",
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    //paddingBottom: 14,
    paddingRight: 56,
  },
  chip: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 14,
  },
  chipTextActive: {
    color: COLORS.textLight,
  },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
    //paddingRight: 56,
  },
  /*
  sortButton: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 11,
    borderRadius: 14,
    alignItems: "center",
  }, 
  */
  sortButton: {
    backgroundColor: COLORS.card,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 11,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
  },
  sortButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  /*sortText: {
  color: COLORS.textMuted,
  fontWeight: "800",
},*/
  sortText: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.text,
    includeFontPadding: false,
  },
  sortTextActive: {
    color: COLORS.textLight,
  },
  summaryCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 22,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryNumber: {
    fontSize: 23,
    color: COLORS.text,
    fontWeight: "900",
  },
  summaryLabel: {
    marginTop: 4,
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: "700",
  },
  summaryDivider: {
    width: 1,
    height: 34,
    backgroundColor: COLORS.border,
  },
  horizontalOptionsWrapper: {
    position: "relative",
    marginBottom: 14,
    minHeight: 48,
    justifyContent: "center",
  },

  scrollArrowOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: 46,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: 4,
    backgroundColor: "rgba(246, 247, 251, 0.72)",
  },

  scrollArrowText: {
    fontSize: 30,
    lineHeight: 30,
    color: COLORS.textMuted,
    fontWeight: "700",
    opacity: 0.7,
  },
  smartSuggestionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  smartSuggestionTextBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  smartSuggestionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  smartSuggestionCopy: {
    flex: 1,
    justifyContent: "center",
  },
  smartSuggestionTitle: {
    fontSize: 17,
    color: COLORS.text,
    fontWeight: "900",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  smartSuggestionSubtitle: {
    //marginTop: 4,
    //fontSize: 13,
    //color: COLORS.textMuted,
    //fontWeight: "600",
    display: "none",
  },
  smartSuggestionButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
  },
  smartSuggestionButtonText: {
    color: COLORS.textLight,
    fontSize: 14,
    fontWeight: "900",
  },
  listHeader: {
    marginTop: 2,
    marginBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  listTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: COLORS.text,
  },
  listCount: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: "700",
  },
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    alignItems: "center",
    marginTop: 4,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.text,
  },
  emptyText: {
    marginTop: 6,
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  sectionBlock: {
    marginBottom: 24,
  },
  sectionTop: {
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitleBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTextBox: {
    flex: 1,
  },
  sectionName: {
    fontSize: 20,
    fontWeight: "900",
    color: COLORS.text,
  },
  sectionCountBadge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  sectionCountText: {
    fontSize: 13,
    fontWeight: "900",
  },
  sectionActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  sectionActionText: {
    fontSize: 13,
    fontWeight: "900",
  },
  taskCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
    marginBottom: 12,
    flexDirection: "row",
    gap: 12,
  },
  checkButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkButtonActive: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  checkButtonLateActive: {
    backgroundColor: COLORS.danger,
    borderColor: COLORS.danger,
  },
  taskInfo: {
    flex: 1,
  },
  taskTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  taskTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.text,
  },
  taskTitleCompleted: {
    color: COLORS.textMuted,
    textDecorationLine: "line-through",
  },
  taskDetail: {
    marginTop: 5,
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 8,
  },
  metaText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: "700",
  },
  progressBox: {
    marginTop: 10,
    backgroundColor: COLORS.cardSoft || "#F8FAFC",
    borderRadius: 14,
    padding: 10,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  progressText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: "900",
  },
  progressPercent: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: "900",
  },
  progressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: "#DBEAFE",
    overflow: "hidden",
    marginTop: 8,
  },
  progressFill: {
    height: "100%",
    backgroundColor: COLORS.primary,
    borderRadius: 999,
  },
  tagRow: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  typeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
  },
  typeText: {
    fontSize: 11,
    fontWeight: "900",
  },
  priorityTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: "900",
  },
  repeatTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.primaryLight,
  },
  repeatText: {
    fontSize: 11,
    fontWeight: "900",
    color: COLORS.primary,
  },
  deadlineTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#FEF3C7",
  },
  deadlineText: {
    fontSize: 11,
    fontWeight: "900",
    color: COLORS.warning,
  },
  overdueTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#FEE2E2",
  },
  overdueText: {
    fontSize: 11,
    fontWeight: "900",
    color: COLORS.danger,
  },
  conflictTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#FEE2E2",
  },
  conflictText: {
    fontSize: 11,
    fontWeight: "900",
    color: COLORS.danger,
  },
  actionColumn: {
    gap: 8,
  },
  iconAction: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: COLORS.cardSoft || "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  rescheduleIconAction: {
    backgroundColor: COLORS.primaryLight,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalBox: {
    width: "100%",
    maxWidth: 430,
    borderRadius: 28,
    backgroundColor: COLORS.card,
    padding: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: COLORS.text,
  },
  modalMessage: {
    marginTop: 10,
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 21,
    fontWeight: "600",
  },
  previewBox: {
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: COLORS.cardSoft || "#F8FAFC",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  previewTitle: {
    fontSize: 15,
    color: COLORS.text,
    fontWeight: "900",
  },
  previewText: {
    marginTop: 6,
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: "700",
  },
  primaryModalButton: {
    marginTop: 12,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryModalButtonText: {
    color: COLORS.textLight,
    fontSize: 15,
    fontWeight: "900",
  },
  secondaryModalButton: {
    marginTop: 10,
    backgroundColor: COLORS.primaryLight,
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryModalButtonText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: "900",
  },
  dangerModalButton: {
    marginTop: 12,
    backgroundColor: COLORS.danger,
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: "center",
  },
  dangerModalButtonText: {
    color: COLORS.textLight,
    fontSize: 15,
    fontWeight: "900",
  },
  cancelModalButton: {
    marginTop: 12,
    backgroundColor: COLORS.cardSoft || "#F8FAFC",
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelModalButtonText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },
  disabledButton: {
    opacity: 0.55,
  },
  smartModalButton: {
    marginTop: 14,
    backgroundColor: "#7C3AED",
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  smartModalButtonText: {
    color: COLORS.textLight,
    fontSize: 15,
    fontWeight: "900",
  },
  freeTimeModalBox: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "82%",
    borderRadius: 24,
    backgroundColor: COLORS.card,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  freeTimeModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "flex-start",
  },
  freeTimeModalSubtitle: {
    marginTop: 5,
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: "700",
  },
  freeTimeCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: COLORS.cardSoft || "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  freeTimeSectionLabel: {
    marginTop: 16,
    marginBottom: 10,
    fontSize: 14,
    color: COLORS.text,
    fontWeight: "900",
  },
  durationChipRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  durationChip: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: COLORS.cardSoft || "#F8FAFC",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  durationChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  durationChipText: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: "900",
  },
  durationChipTextActive: {
    color: COLORS.textLight,
  },
  freeTimeSummaryBox: {
    marginTop: 16,
    backgroundColor: COLORS.cardSoft || "#F8FAFC",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  freeTimeSummaryItem: {
    flex: 1,
    alignItems: "center",
  },
  freeTimeSummaryNumber: {
    fontSize: 22,
    color: COLORS.text,
    fontWeight: "900",
  },
  freeTimeSummaryLabel: {
    marginTop: 4,
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: "800",
  },
  freeTimeSummaryDivider: {
    width: 1,
    height: 34,
    backgroundColor: COLORS.border,
  },
  freeTimeLoadingBox: {
    marginTop: 16,
    padding: 18,
    borderRadius: 20,
    backgroundColor: COLORS.cardSoft || "#F8FAFC",
    alignItems: "center",
  },
  freeTimeLoadingText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: "800",
  },
  freeTimeEmptyBox: {
    marginTop: 16,
    padding: 18,
    borderRadius: 20,
    backgroundColor: COLORS.cardSoft || "#F8FAFC",
    alignItems: "center",
  },
  freeTimeEmptyTitle: {
    marginTop: 10,
    fontSize: 17,
    color: COLORS.text,
    fontWeight: "900",
  },
  freeTimeEmptyText: {
    marginTop: 6,
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 19,
    fontWeight: "600",
  },
  freeTimeList: {
    marginTop: 16,
    maxHeight: 360,
  },
  freeTimeListContent: {
    paddingBottom: 16,
  },
  freeTimeSlotCard: {
    padding: 14,
    borderRadius: 20,
    backgroundColor: COLORS.cardSoft || "#F8FAFC",
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
  },
  freeTimeSlotTop: {
    flexDirection: "row",
    gap: 12,
  },
  freeTimeSlotIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  freeTimeSlotInfo: {
    flex: 1,
  },
  freeTimeSlotTitle: {
    fontSize: 15,
    color: COLORS.text,
    fontWeight: "900",
  },
  freeTimeSlotSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: "700",
  },
  suggestedTimeBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  suggestedTimeLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: "900",
  },
  suggestedTimeValue: {
    marginTop: 4,
    fontSize: 13,
    color: COLORS.text,
    fontWeight: "800",
  },
  useSlotButton: {
    marginTop: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  useSlotButtonText: {
    color: COLORS.textLight,
    fontSize: 14,
    fontWeight: "900",
  },
  searchFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },

  filterIconButton: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },

  filterIconButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  conflictListBox: {
    marginTop: 14,
    gap: 10,
  },
  conflictEmptyText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: "700",
  },
  conflictItem: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  conflictItemTitle: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: "900",
  },
  conflictItemTime: {
    marginTop: 5,
    fontSize: 12,
    color: COLORS.danger,
    fontWeight: "800",
  },
  conflictNewTime: {
    marginTop: 4,
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: "700",
  },
  conflictMoreText: {
    fontSize: 13,
    color: COLORS.danger,
    fontWeight: "900",
  },
});
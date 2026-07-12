import { Ionicons } from "@expo/vector-icons";
import { useRootNavigationState, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
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

  const [tasks, setTasks] = useState([]);
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());

  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("time");

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
        Alert.alert("Error", "Unable to load tasks.");
      }
    }

    return () => unsubscribe();
  }, [isAuthReady, user, router]);

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
    if (referenceTime instanceof Date) {
      return referenceTime.getTime();
    }

    const numberValue = Number(referenceTime);

    if (!Number.isNaN(numberValue) && numberValue > 0) {
      return numberValue;
    }

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
    }

    if (targetType === "tomorrow") {
      newStart.setDate(now.getDate() + 1);
      newStart.setHours(
        originalStart.getHours(),
        originalStart.getMinutes(),
        0,
        0
      );
    }

    return {
      newStart,
      newEnd: new Date(newStart.getTime() + durationMs),
    };
  };

  const formatDate = (value) => {
    const date = normalizeDate(value);
    if (!isValidDate(date)) return "-";

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (value) => {
    const date = normalizeDate(value);
    if (!isValidDate(date)) return "-";

    return date.toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDurationMinutes = (minutes) => {
    const value = Number(minutes) || 0;

    if (value < 60) {
      return `${value} min`;
    }

    const hours = Math.floor(value / 60);
    const remainingMinutes = value % 60;

    if (remainingMinutes === 0) {
      return `${hours} hr`;
    }

    return `${hours} hr ${remainingMinutes} min`;
  };

  const formatSlotDate = (value) => {
    const date = normalizeDate(value);
    if (!isValidDate(date)) return "-";

    return date.toLocaleDateString("en-US", {
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

    return `${formatDate(startDate)} â†’ ${formatDate(endDate)}`;
  };

  const formatTaskTimeRange = (startValue, endValue) => {
    const startDate = normalizeDate(startValue);
    const endDate = normalizeDate(endValue);

    if (!isValidDate(startDate) || !isValidDate(endDate)) return "-";

    if (isSameCalendarDay(startDate, endDate)) {
      return `${formatTime(startDate)} - ${formatTime(endDate)}`;
    }

    if (isNextCalendarDay(startDate, endDate)) {
      return `${formatTime(startDate)} - ${formatTime(endDate)} (+1 day)`;
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
      return `${formatDate(startDate)} Â· ${formatTime(startDate)} - ${formatTime(
        endDate
      )}`;
    }

    return `${formatDate(startDate)} ${formatTime(startDate)} - ${formatDate(
      endDate
    )} ${formatTime(endDate)}`;
  };

  const getPriority = (task) => {
    return task.priority || "Normal";
  };

  const getPriorityStyle = (priority) => {
    const lower = String(priority).toLowerCase();

    if (lower === "high") {
      return {
        backgroundColor: "#FEE2E2",
        color: COLORS.danger,
        icon: "flag-outline",
      };
    }

    if (lower === "medium") {
      return {
        backgroundColor: "#FEF3C7",
        color: COLORS.warning,
        icon: "alert-outline",
      };
    }

    if (lower === "low") {
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
    if (task?.is_generated_session) return "Planning Session";

    if (task?.planning_enabled) {
      return `${task.planned_completed_count || 0}/${task.planned_session_count || 0} sessions`;
    }

    if (!task?.is_recurring) return "Does not repeat";

    const type = String(task.recurrence_type || "").toLowerCase();
    const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
      return "Daily";
    }

    if (type === "custom" || type === "custom_days") {
      return `Every ${task.recurrence_interval_days || "-"} day(s)`;
    }

    if (type === "everyweek" || type === "weekly") {
      const interval = Number(task.recurrence_week_interval) || 1;
      const dayText = weekdayText ? ` on ${weekdayText}` : "";

      if (interval === 1) {
        return `Weekly${dayText}`;
      }

      return `Every ${interval} weeks${dayText}`;
    }

    if (type === "monthly") {
      const interval = Number(task.recurrence_month_interval) || 1;
      const monthDay = task.recurrence_month_day || "-";

      if (interval === 1) {
        return `Monthly on day ${monthDay}`;
      }

      return `Every ${interval} months on day ${monthDay}`;
    }

    return "Repeat";
  };

  const getTaskTypeLabel = (task) => {
    if (isOverdueTask(task)) return "Overdue Task";
    if (isCompletedLateTask(task)) return "Completed Late";
    if (task.is_generated_session) return "Study / Planning Session";
    if (task.planning_enabled) return "Main Planning Task";
    if (task.is_recurring) return "Recurring Task";
    if (task.is_completed) return "Completed";
    return "Normal Task";
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
    if (!deleteTargetTask) return "Delete Task";

    if (deleteTargetTask.planning_enabled) return "Delete Planning Task";
    if (deleteTargetTask.is_generated_session) return "Delete Planning Session";
    if (deleteTargetTask.is_recurring) return "Delete Recurring Task";

    return "Delete Task";
  };

  const getDeleteModalMessage = () => {
    if (!deleteTargetTask) return "";

    if (deleteTargetTask.planning_enabled) {
      return "This task has generated planning sessions. What do you want to delete?";
    }

    if (deleteTargetTask.is_generated_session) {
      return "This is a generated planning session. Do you want to delete only this session?";
    }

    if (deleteTargetTask.is_recurring) {
      return "This is a recurring task. What do you want to delete?";
    }

    return "Are you sure you want to delete this task?";
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
      const title = String(task.title || "").toLowerCase();
      const detail = String(task.detail || "").toLowerCase();

      const matchesSearch =
        !keyword || title.includes(keyword) || detail.includes(keyword);

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
        title: "Overdue Tasks",
        subtitle: "Tasks that passed their end time",
        icon: "alert-circle-outline",
        color: COLORS.danger,
        backgroundColor: "#FEE2E2",
        data: sortTasks(overdueTasks),
      },
      {
        key: "today-sessions",
        title: "Today Sessions",
        subtitle: "Sessions you should work on",
        icon: "flash-outline",
        color: "#7C3AED",
        backgroundColor: "#EDE9FE",
        data: sortTasks(todaySessions),
      },
      {
        key: "planning-tasks",
        title: "Planning Tasks",
        subtitle: "Main plans with progress",
        icon: "analytics-outline",
        color: "#2563EB",
        backgroundColor: "#DBEAFE",
        data: sortTasks(planningTasks),
      },
      {
        key: "normal-tasks",
        title: "Normal Tasks",
        subtitle: "One-time tasks",
        icon: "list-outline",
        color: COLORS.primary,
        backgroundColor: COLORS.primaryLight,
        data: sortTasks(normalTasks),
      },
      {
        key: "recurring-tasks",
        title: "Recurring Tasks",
        subtitle: "Repeated tasks",
        icon: "repeat-outline",
        color: "#F97316",
        backgroundColor: "#FFEDD5",
        data: sortTasks(recurringTasks),
      },
      {
        key: "completed-late",
        title: "Completed Late",
        subtitle: "Finished after the planned end time",
        icon: "time-outline",
        color: COLORS.danger,
        backgroundColor: "#FEE2E2",
        data: sortTasks(completedLateTasks),
      },
      {
        key: "completed",
        title: "Completed",
        subtitle: "",
        icon: "checkmark-done-outline",
        color: COLORS.success,
        backgroundColor: "#DCFCE7",
        data: sortTasks(completedTasks),
      },
    ].filter((section) => section.data.length > 0);
  }, [filteredTasks, sortBy, filter, nowTick]);

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
      Alert.alert("Error", "Unable to update task status.");
    }
  };

  const handleUndoTask = async (taskId) => {
    try {
      await undoTaskDone(taskId);
    } catch (error) {
      console.error("Undo task error:", error);
      Alert.alert("Error", "Unable to restore this task.");
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

      Alert.alert("Error", "Unable to reschedule this task.");
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
      const searchDayCount = 7;
      const collectedSlots = [];
      const collectedBusySlots = [];

      setSmartRescheduleModalVisible(true);
      setIsLoadingSmartReschedule(true);
      setSmartRescheduleMessage("");
      setSmartRescheduleSlots([]);
      setSmartRescheduleBusySlots([]);

      for (let dayOffset = 0; dayOffset < searchDayCount; dayOffset++) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + dayOffset);

        const result = await getFreeTimeSlots({
          targetDate,
          durationMinutes: taskDurationMinutes,
          dayStartHour: 4,
          dayEndHour: 23,
          bufferMinutes: 0,
          maxSlots: 20,
          includePastTime: false,
        });

        const daySlots = result?.slots || [];
        const dayBusySlots = result?.busy_slots || [];

        collectedSlots.push(...daySlots);
        collectedBusySlots.push(...dayBusySlots);

        if (collectedSlots.length >= 10) {
          break;
        }
      }

      const limitedSlots = collectedSlots.slice(0, 10);

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

      setSmartRescheduleMessage("Unable to find a suitable time.");
      Alert.alert("Error", "Unable to find a suitable time.");
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
      Alert.alert("Error", "This time slot is not valid.");
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

      Alert.alert("Error", "Unable to reschedule this task.");
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

      setFreeTimeMessage("Unable to calculate free time.");
      Alert.alert("Error", "Unable to calculate free time.");
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

      setFreeTimeMessage("Unable to calculate free time.");
      Alert.alert("Error", "Unable to calculate free time.");
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
      Alert.alert("Error", "This time slot is not valid.");
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
      Alert.alert("Error", "Unable to delete this task.");
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
      Alert.alert("Error", "Unable to delete recurring tasks.");
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
      Alert.alert("Error", "Unable to delete planning task and sessions.");
    } finally {
      setIsDeleting(false);
      setDeleteModalVisible(false);
      setDeleteTargetTask(null);
    }
  };

  /*const handleEditTask = (taskId) => {
    router.push({
      pathname: "/edit-task",
      params: { id: String(taskId) },
    });
  };*/
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
              {task.title || "Untitled Task"}
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
                  Progress: {task.planned_completed_count || 0}/
                  {task.planned_session_count || 0} sessions completed
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
                  Deadline {formatDate(task.deadline)}
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
                <Text style={styles.overdueText}>Overdue</Text>
              </View>
            ) : null}

            {task.has_conflict ? (
              <View style={styles.conflictTag}>
                <Ionicons
                  name="alert-circle-outline"
                  size={14}
                  color={COLORS.danger}
                />
                <Text style={styles.conflictText}>Conflict</Text>
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
          {isExpanded ? "Show less" : `See all ${section.data.length}`}
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
              <Text style={styles.sectionDescription}>{section.subtitle}</Text>
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
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Redirecting to login...</Text>
      </View>
    );
  }

  const filterOptions = [
    { label: "All", value: "all" },
    { label: "Today", value: "today" },
    { label: "Upcoming", value: "upcoming" },
    { label: "Completed", value: "completed" },
    { label: "Conflict", value: "conflict" },
  ];

  const sortOptions = [
    { label: "Time", value: "time" },
    { label: "Priority", value: "priority" },
    { label: "Deadline", value: "deadline" },
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
            <Text style={styles.pageTitle}>Tasks</Text>
            <Text style={styles.pageSubtitle}>
              
            </Text>
          </View>

          <Pressable
            style={styles.addButton}
            onPress={() =>
              router.push({
                pathname: "/add-task",
                params: {
                  from: "tasks",
                },
              })
            }
          >
            <Ionicons name="add" size={28} color={COLORS.textLight} />
          </Pressable>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={20} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search tasks"
            placeholderTextColor={COLORS.textMuted}
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>

        <Text style={styles.controlTitle}>Filter</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
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

        <Text style={styles.controlTitle}>Sort by</Text>

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

        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{tasks.length}</Text>
            <Text style={styles.summaryLabel}>All</Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>
              {tasks.filter((task) => isToday(task.start_time)).length}
            </Text>
            <Text style={styles.summaryLabel}>Today</Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>
              {tasks.filter((task) => task.is_generated_session).length}
            </Text>
            <Text style={styles.summaryLabel}>Sessions</Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>
              {tasks.filter((task) => task.is_completed).length}
            </Text>
            <Text style={styles.summaryLabel}>Done</Text>
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
              <Text style={styles.smartSuggestionTitle}>Suggest Free Time</Text>
              <Text style={styles.smartSuggestionSubtitle}>
                
              </Text>
            </View>
          </View>

          <Pressable
            style={styles.smartSuggestionButton}
            onPress={openFreeTimeModal}
            disabled={isLoadingFreeTime}
          >
            <Text style={styles.smartSuggestionButtonText}>
              {isLoadingFreeTime ? "Checking..." : "Find"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Task Sections</Text>
          <Text style={styles.listCount}>{filteredTasks.length} item(s)</Text>
        </View>

        {filteredTasks.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons
              name="file-tray-outline"
              size={42}
              color={COLORS.textMuted}
            />
            <Text style={styles.emptyTitle}>No tasks found</Text>
            <Text style={styles.emptyText}>
              Try changing the filter or create a new task.
            </Text>
          </View>
        ) : (
          taskSections.map(renderTaskSection)
        )}
      </ScrollView>

      <BottomNav activeTab="task" />

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
                <Text style={styles.modalTitle}>Suggested Free Time</Text>
                <Text style={styles.freeTimeModalSubtitle}>
                  Today Â· Need at least {formatDurationMinutes(freeTimeDuration)}
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
              The system checks active tasks and shows available time slots you
              can use for a new task.
            </Text>

            <Text style={styles.freeTimeSectionLabel}>Task Duration</Text>

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
                <Text style={styles.freeTimeSummaryLabel}>Free Slots</Text>
              </View>

              <View style={styles.freeTimeSummaryDivider} />

              <View style={styles.freeTimeSummaryItem}>
                <Text style={styles.freeTimeSummaryNumber}>
                  {freeTimeBusySlots.length}
                </Text>
                <Text style={styles.freeTimeSummaryLabel}>Busy Blocks</Text>
              </View>
            </View>

            {isLoadingFreeTime ? (
              <View style={styles.freeTimeLoadingBox}>
                <Text style={styles.freeTimeLoadingText}>
                  Calculating available time...
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
                  No free time found
                </Text>
                <Text style={styles.freeTimeEmptyText}>
                  {freeTimeMessage === "NO_TIME_LEFT_TODAY"
                    ? "There is no remaining time today based on your schedule."
                    : "Try choosing a shorter duration or reschedule some tasks."}
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
                  const slotEnd = normalizeDate(slot.end_time);
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
                            {formatTaskDateRange(suggestedStart, suggestedEnd)} Â·{" "}
                            Duration {formatDurationMinutes(freeTimeDuration)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.suggestedTimeBox}>
                        <Text style={styles.suggestedTimeLabel}>
                          Suggested task time
                        </Text>
                        <Text style={styles.suggestedTimeValue}>
                          {formatConflictDateTime(suggestedStart, suggestedEnd)}
                        </Text>
                      </View>

                      <Pressable
                        style={styles.useSlotButton}
                        onPress={() => handleUseFreeTimeSlot(slot)}
                      >
                        <Text style={styles.useSlotButtonText}>
                          Use This Slot
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
              <Text style={styles.cancelModalButtonText}>Close</Text>
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
            <Text style={styles.modalTitle}>Reschedule Task</Text>

            <Text style={styles.modalMessage}>
              Move this overdue task to a new time while keeping its original
              duration.
            </Text>

            {rescheduleTargetTask ? (
              <View style={styles.previewBox}>
                <Text style={styles.previewTitle} numberOfLines={1}>
                  {rescheduleTargetTask.title || "Untitled Task"}
                </Text>

                <Text style={styles.previewText}>
                  Current:{" "}
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
                  ? "Finding Best Time..."
                  : "Auto Find Best Time"}
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
                {isRescheduling ? "Rescheduling..." : "Move to Today"}
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
                Move to Tomorrow
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
              <Text style={styles.secondaryModalButtonText}>Pick New Time</Text>
            </Pressable>

            <Pressable
              style={styles.cancelModalButton}
              onPress={closeRescheduleModal}
              disabled={isRescheduling || isLoadingSmartReschedule}
            >
              <Text style={styles.cancelModalButtonText}>Cancel</Text>
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
          style={styles.overlay}
          onPress={closeSmartRescheduleModal}
        >
          <Pressable
            style={styles.freeTimeModalBox}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.freeTimeModalHeader}>
              <View>
                <Text style={styles.modalTitle}>Auto Find Best Time</Text>
                <Text style={styles.freeTimeModalSubtitle}>
                  Next 7 days Â· Need at least{" "}
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
              The system finds free slots that can fit this overdue task. Choose
              a slot to reschedule it automatically.
            </Text>

            {rescheduleTargetTask ? (
              <View style={styles.previewBox}>
                <Text style={styles.previewTitle} numberOfLines={1}>
                  {rescheduleTargetTask.title || "Untitled Task"}
                </Text>

                <Text style={styles.previewText}>
                  Current:{" "}
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
                <Text style={styles.freeTimeSummaryLabel}>Best Slots</Text>
              </View>

              <View style={styles.freeTimeSummaryDivider} />

              <View style={styles.freeTimeSummaryItem}>
                <Text style={styles.freeTimeSummaryNumber}>
                  {smartRescheduleBusySlots.length}
                </Text>
                <Text style={styles.freeTimeSummaryLabel}>Busy Blocks</Text>
              </View>
            </View>

            {isLoadingSmartReschedule ? (
              <View style={styles.freeTimeLoadingBox}>
                <Text style={styles.freeTimeLoadingText}>
                  Finding suitable time...
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
                  No suitable time found
                </Text>
                <Text style={styles.freeTimeEmptyText}>
                  {smartRescheduleMessage === "NO_SUITABLE_TIME_NEXT_7_DAYS"
                    ? "No suitable free slot was found in the next 7 days."
                    : "Try Move to Tomorrow or Pick New Time instead."}
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.freeTimeList}
                contentContainerStyle={styles.freeTimeListContent}
                showsVerticalScrollIndicator={false}
              >
                {smartRescheduleSlots.map((slot, index) => {
                  const slotStart = normalizeDate(slot.start_time);
                  const slotEnd = normalizeDate(slot.end_time);
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
                            {formatTaskDateRange(suggestedStart, suggestedEnd)} Â·{" "}
                            Duration {formatDurationMinutes(smartRescheduleDuration)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.suggestedTimeBox}>
                        <Text style={styles.suggestedTimeLabel}>
                          New task time
                        </Text>
                        <Text style={styles.suggestedTimeValue}>
                          {formatConflictDateTime(suggestedStart, suggestedEnd)}
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
                            ? "Rescheduling..."
                            : "Use This Time"}
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
              <Text style={styles.cancelModalButtonText}>Close</Text>
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
                <Text style={styles.modalTitle}>Time Conflict Detected</Text>
                <Text style={styles.freeTimeModalSubtitle}>
                  Reschedule was not saved
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
              The new time overlaps with another active task. Choose a different
              time to avoid duplicated schedules.
            </Text>

            {pendingRescheduleRange ? (
              <View style={styles.previewBox}>
                <Text style={styles.previewTitle}>Requested New Time</Text>
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
                  No conflict details found.
                </Text>
              ) : (
                rescheduleConflictPreviewItems.map((item, index) => (
                  <View
                    key={`${item.task_id || "conflict"}-${index}`}
                    style={styles.conflictItem}
                  >
                    <Text style={styles.conflictItemTitle} numberOfLines={1}>
                      {item.title || "Untitled Task"}
                    </Text>

                    <Text style={styles.conflictItemTime}>
                      Existing:{" "}
                      {formatConflictDateTime(item.start_time, item.end_time)}
                    </Text>

                    {item.conflict_instance_start_time ? (
                      <Text style={styles.conflictNewTime}>
                        New:{" "}
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
                  +{remainingRescheduleConflictCount} more conflict(s)
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
              <Text style={styles.primaryModalButtonText}>Pick New Time</Text>
            </Pressable>

            <Pressable
              style={styles.cancelModalButton}
              onPress={closeRescheduleConflictModal}
              disabled={isRescheduling}
            >
              <Text style={styles.cancelModalButtonText}>Cancel</Text>
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
              <>
                

                <Pressable
                  style={[
                    styles.dangerModalButton,
                    isDeleting && styles.disabledButton,
                  ]}
                  onPress={performDeletePlanningWithSessions}
                  disabled={isDeleting}
                >
                  <Text style={styles.dangerModalButtonText}>
                    Delete Study Plan and All Sessions
                  </Text>
                </Pressable>
              </>
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
                    Delete this task only
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
                    Delete all recurring tasks
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
                  {isDeleting ? "Deleting..." : "Delete Task"}
                </Text>
              </Pressable>
            )}

            <Pressable
              style={styles.cancelModalButton}
              onPress={closeDeleteModal}
              disabled={isDeleting}
            >
              <Text style={styles.cancelModalButtonText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
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
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 22,
    paddingTop: 62,
    paddingBottom: 130,
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
  },
  pageSubtitle: {
    marginTop: 6,
    fontSize: 16,
    color: COLORS.textMuted,
    maxWidth: 260,
  },
  addButton: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBox: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 18,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
  },
  controlTitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: "800",
    marginBottom: 10,
  },
  chipRow: {
    gap: 8,
    paddingBottom: 14,
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
    gap: 8,
    marginBottom: 18,
  },
  sortButton: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 11,
    borderRadius: 14,
    alignItems: "center",
  },
  sortButtonActive: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primary,
  },
  sortText: {
    color: COLORS.textMuted,
    fontWeight: "800",
  },
  sortTextActive: {
    color: COLORS.primary,
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
    fontSize: 22,
    fontWeight: "900",
    color: COLORS.text,
  },
  summaryLabel: {
    marginTop: 4,
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: "700",
  },
  summaryDivider: {
    width: 1,
    height: 36,
    backgroundColor: COLORS.divider || COLORS.border,
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  listTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.text,
  },
  listCount: {
    fontSize: 13,
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
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 18,
    color: COLORS.text,
    fontWeight: "800",
  },
  emptyText: {
    marginTop: 6,
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  sectionBlock: {
    marginBottom: 22,
  },
  sectionTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitleBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    paddingRight: 8,
  },
  sectionTextBox: {
    flex: 1,
  },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionName: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.text,
  },
  sectionDescription: {
    marginTop: 2,
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: "600",
  },
  sectionCountBadge: {
    minWidth: 34,
    height: 30,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  sectionCountText: {
    fontSize: 13,
    fontWeight: "900",
  },
  sectionActionButton: {
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  sectionActionText: {
    fontSize: 12,
    fontWeight: "900",
  },
  taskCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  checkButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.primary,
    marginTop: 2,
    alignItems: "center",
    justifyContent: "center",
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
    gap: 8,
  },
  taskTitle: {
    flex: 1,
    fontSize: 18,
    color: COLORS.text,
    fontWeight: "800",
  },
  taskTitleCompleted: {
    color: COLORS.completed,
    textDecorationLine: "line-through",
  },
  taskDetail: {
    marginTop: 4,
    fontSize: 14,
    color: COLORS.textMuted,
  },
  progressBox: {
    marginTop: 10,
    backgroundColor: COLORS.cardSoft,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
    flex: 1,
  },
  progressPercent: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "900",
    marginLeft: 8,
  },
  progressTrack: {
    marginTop: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  metaRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  metaText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: "600",
    marginRight: 8,
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
    fontSize: 12,
    fontWeight: "800",
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
    fontSize: 12,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  repeatTag: {
    backgroundColor: COLORS.primaryLight,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
  },
  repeatText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  deadlineTag: {
    backgroundColor: "#FEF3C7",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
  },
  deadlineText: {
    color: COLORS.warning,
    fontSize: 12,
    fontWeight: "800",
  },
  overdueTag: {
    backgroundColor: "#FEE2E2",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
  },
  overdueText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: "800",
  },
  conflictTag: {
    backgroundColor: "#FEE2E2",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
  },
  conflictText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: "800",
  },
  actionColumn: {
    gap: 8,
  },
  iconAction: {
    width: 36,
    height: 36,
    borderRadius: 13,
    backgroundColor: COLORS.cardSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rescheduleIconAction: {
    backgroundColor: COLORS.primaryLight,
  },
  smartSuggestionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  smartSuggestionTextBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  smartSuggestionIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  smartSuggestionCopy: {
    flex: 1,
  },
  smartSuggestionTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: COLORS.text,
  },
  smartSuggestionSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: "600",
    lineHeight: 17,
  },
  smartSuggestionButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  smartSuggestionButtonText: {
    color: COLORS.textLight,
    fontSize: 14,
    fontWeight: "900",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  freeTimeModalBox: {
    width: "100%",
    maxWidth: 450,
    maxHeight: "88%",
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  freeTimeModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  freeTimeModalSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: "700",
  },
  freeTimeCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.cardSoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  freeTimeSectionLabel: {
    fontSize: 13,
    fontWeight: "900",
    color: COLORS.textMuted,
    marginBottom: 9,
  },
  durationChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  durationChip: {
    backgroundColor: COLORS.cardSoft,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  durationChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  durationChipText: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: "800",
  },
  durationChipTextActive: {
    color: COLORS.textLight,
  },
  freeTimeSummaryBox: {
    backgroundColor: COLORS.cardSoft,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  freeTimeSummaryItem: {
    flex: 1,
    alignItems: "center",
  },
  freeTimeSummaryNumber: {
    fontSize: 20,
    fontWeight: "900",
    color: COLORS.text,
  },
  freeTimeSummaryLabel: {
    marginTop: 3,
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: "800",
  },
  freeTimeSummaryDivider: {
    width: 1,
    height: 34,
    backgroundColor: COLORS.border,
  },
  freeTimeLoadingBox: {
    backgroundColor: COLORS.cardSoft,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    alignItems: "center",
    marginBottom: 12,
  },
  freeTimeLoadingText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: "800",
  },
  freeTimeEmptyBox: {
    backgroundColor: COLORS.cardSoft,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    alignItems: "center",
    marginBottom: 12,
  },
  freeTimeEmptyTitle: {
    marginTop: 8,
    fontSize: 16,
    color: COLORS.text,
    fontWeight: "900",
  },
  freeTimeEmptyText: {
    marginTop: 5,
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 19,
    fontWeight: "600",
  },
  freeTimeList: {
    maxHeight: 330,
    marginBottom: 12,
  },
  freeTimeListContent: {
    gap: 10,
    paddingBottom: 2,
  },
  freeTimeSlotCard: {
    backgroundColor: COLORS.cardSoft,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
  },
  freeTimeSlotTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  freeTimeSlotIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  freeTimeSlotInfo: {
    flex: 1,
  },
  freeTimeSlotTitle: {
    fontSize: 17,
    color: COLORS.text,
    fontWeight: "900",
  },
  freeTimeSlotSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: "700",
  },
  suggestedTimeBox: {
    marginTop: 10,
    backgroundColor: COLORS.card,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
  },
  suggestedTimeLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: "800",
    marginBottom: 3,
  },
  suggestedTimeValue: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: "900",
  },
  useSlotButton: {
    marginTop: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 13,
    paddingVertical: 10,
    alignItems: "center",
  },
  useSlotButtonText: {
    color: COLORS.textLight,
    fontSize: 14,
    fontWeight: "900",
  },
  modalBox: {
    width: "100%",
    maxWidth: 430,
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: COLORS.text,
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 15,
    color: COLORS.textMuted,
    lineHeight: 22,
    marginBottom: 16,
  },
  previewBox: {
    backgroundColor: COLORS.cardSoft,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: 14,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
  },
  previewText: {
    marginTop: 4,
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: "700",
  },
  smartModalButton: {
    backgroundColor: "#7C3AED",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    flexDirection: "row",
    gap: 8,
  },
  smartModalButtonText: {
    color: COLORS.textLight,
    fontSize: 16,
    fontWeight: "900",
  },
  primaryModalButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    flexDirection: "row",
    gap: 8,
  },
  primaryModalButtonText: {
    color: COLORS.textLight,
    fontSize: 16,
    fontWeight: "900",
  },
  secondaryModalButton: {
    backgroundColor: COLORS.primaryLight,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  secondaryModalButtonText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: "900",
  },
  dangerModalButton: {
    backgroundColor: COLORS.danger,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  dangerModalButtonText: {
    color: COLORS.textLight,
    fontSize: 16,
    fontWeight: "800",
  },
  cancelModalButton: {
    backgroundColor: COLORS.cardSoft,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelModalButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "800",
  },
  conflictListBox: {
    backgroundColor: COLORS.cardSoft,
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  conflictEmptyText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  conflictItem: {
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  conflictItemTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "900",
  },
  conflictItemTime: {
    marginTop: 4,
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
  },
  conflictNewTime: {
    marginTop: 3,
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  conflictMoreText: {
    marginTop: 8,
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  disabledButton: {
    opacity: 0.55,
  },
});

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
  View,
} from "react-native";

import BottomNav from "../src/components/BottomNav";
import { auth } from "../src/config/firebase";
import { COLORS } from "../src/constants/theme";
import {
  deletePlanningTaskWithSessions,
  deleteRecurringTaskGroup,
  deleteTask,
  listenTasks,
  undoTaskDone,
  updateTaskStatus,
} from "../src/services/taskService";

const TIMELINE_BASE_START_HOUR = 4;
const TIMELINE_BASE_END_HOUR = 23;
const HOUR_HEIGHT = 74;

const MONTHS = [
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
    label: "Normal",
  },
  high: {
    backgroundColor: "#FEE2E2",
    borderColor: "#DC2626",
    textColor: "#991B1B",
    icon: "flag-outline",
    label: "High",
  },
  medium: {
    backgroundColor: "#FEF3C7",
    borderColor: "#D97706",
    textColor: "#92400E",
    icon: "alert-outline",
    label: "Medium",
  },
  low: {
    backgroundColor: "#DCFCE7",
    borderColor: "#16A34A",
    textColor: "#166534",
    icon: "leaf-outline",
    label: "Low",
  },
  planning: {
    backgroundColor: "#F3E8FF",
    borderColor: "#7C3AED",
    textColor: "#5B21B6",
    icon: "layers-outline",
    label: "Planning",
  },
  conflict: {
    backgroundColor: "#FEE2E2",
    borderColor: "#991B1B",
    textColor: "#7F1D1D",
    icon: "alert-circle-outline",
    label: "Conflict",
  },
  overdue: {
    backgroundColor: "#FFE4E6",
    borderColor: "#E11D48",
    textColor: "#9F1239",
    icon: "time-outline",
    label: "Overdue",
  },
  completed: {
    backgroundColor: "#F3F4F6",
    borderColor: "#9CA3AF",
    textColor: "#6B7280",
    icon: "checkmark-done-outline",
    label: "Completed",
  },
  completedLate: {
    backgroundColor: "#FEE2E2",
    borderColor: "#EF4444",
    textColor: "#991B1B",
    icon: "checkmark-circle-outline",
    label: "Completed Late",
  },
};

const WEEK_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

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

const formatTime = (value) => {
  const date = normalizeDate(value);
  if (!isValidDate(date)) return "-";

  return date.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatFullDate = (value) => {
  const date = normalizeDate(value);
  if (!isValidDate(date)) return "-";

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatMonthYear = (date) => {
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
};

const formatSelectedDateTitle = (date) => {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
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

const formatTaskDateTimeRange = (startValue, endValue) => {
  const startDate = normalizeDate(startValue);
  const endDate = normalizeDate(endValue);

  if (!isValidDate(startDate) || !isValidDate(endDate)) return "-";

  if (isSameCalendarDay(startDate, endDate)) {
    return `${formatFullDate(startDate)} Â· ${formatTime(startDate)} - ${formatTime(
      endDate
    )}`;
  }

  return `${formatFullDate(startDate)} ${formatTime(startDate)} - ${formatFullDate(
    endDate
  )} ${formatTime(endDate)}`;
};

const buildMonthDays = (year, month) => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days = [];

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

  const today = new Date();

  const minDate = new Date(today.getFullYear(), today.getMonth() - 120, 1);
  const maxDate = new Date(today.getFullYear(), today.getMonth() + 120, 1);

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

  const [monthPickerVisible, setMonthPickerVisible] = useState(false);
  const [tempMonth, setTempMonth] = useState(currentDate.getMonth());
  const [tempYear, setTempYear] = useState(currentDate.getFullYear());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

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
    if (!isAuthReady || !user) {
      setTasks([]);
      return;
    }

    let unsubscribe = () => { };

    try {
      unsubscribe = listenTasks((data) => {
        setTasks(data || []);
      });
    } catch (error) {
      console.error("Listen calendar tasks error:", error);

      if (error?.message === "AUTH_REQUIRED") {
        router.replace("/login");
      } else {
        Alert.alert("Error", "Unable to load calendar tasks.");
      }
    }

    return () => unsubscribe();
  }, [isAuthReady, user, router]);

  const ensureLoggedIn = () => {
    if (!auth.currentUser) {
      Alert.alert("Login Required", "à¸à¸£à¸¸à¸“à¸²à¹€à¸‚à¹‰à¸²à¸ªà¸¹à¹ˆà¸£à¸°à¸šà¸šà¸à¹ˆà¸­à¸™à¹ƒà¸Šà¹‰à¸‡à¸²à¸™");
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
      Alert.alert("Invalid date", "This month is outside the allowed range.");
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
      Alert.alert("Error", "à¹„à¸¡à¹ˆà¸žà¸šà¸£à¸«à¸±à¸ªà¸‡à¸²à¸™");
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

  const handleDoneTask = async (taskId) => {
    if (!ensureLoggedIn()) return;

    try {
      await updateTaskStatus(taskId, "completed");
      setSelectedTaskId(null);
    } catch (error) {
      console.error("Done task error:", error);
      Alert.alert("Error", "Unable to update task status.");
    }
  };

  const handleUndoCompletedTask = async (taskId) => {
    if (!ensureLoggedIn()) return;

    try {
      await undoTaskDone(taskId);
      setSelectedTaskId(null);
    } catch (error) {
      console.error("Undo completed task error:", error);
      Alert.alert("Error", "Unable to restore this task.");
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
      Alert.alert("Error", "Unable to delete this task.");
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
      Alert.alert("Error", "Unable to delete recurring tasks.");
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
      Alert.alert("Error", "Unable to delete planning task and sessions.");
    } finally {
      setIsDeleting(false);
      setDeleteModalVisible(false);
      setDeleteTargetTask(null);
    }
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

  const monthDays = useMemo(() => {
    return buildMonthDays(year, month);
  }, [year, month]);

  const tasksForDay = (date, includeCompleted = true) => {
    return tasks
      .filter((task) => {
        if (!includeCompleted && task.is_completed) return false;
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
          <Text style={styles.dayCountText}>{dayTasks.length} tasks</Text>
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
            minHeight: layout.height,
            backgroundColor: taskStyle.backgroundColor,
            borderColor: taskStyle.borderColor,
          },
          isSelected && styles.timelineTaskSelected,
        ]}
        onPress={() => setSelectedTaskId(isSelected ? null : task.id)}
      >
        <View style={styles.timelineTaskHeader}>
          <Text
            style={[styles.timelineTaskTitle, { color: taskStyle.textColor }]}
            numberOfLines={1}
          >
            {task.title || "Untitled Task"}
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
              {taskStyle.label}
            </Text>
          </View>
        </View>
      </Pressable>
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
              <Ionicons name="calendar-outline" size={16} color={UI.primaryDark} />
              <Text style={styles.todayButtonText}>Today</Text>
            </Pressable>

            <Pressable style={styles.addTaskButton} onPress={handleAddTask}>
              <Ionicons name="add" size={20} color={UI.textLight} />
              <Text style={styles.addTaskButtonText}>Add Task</Text>
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
                {selectedDayTasks.length} task(s) Â· {completedSelectedTasks.length} done
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
              <Text style={styles.emptyDayTitle}>No tasks on this day</Text>
              <Text style={styles.emptyDayText}>
                Tap Add Task to create a new schedule.
              </Text>
            </View>
          ) : (
            <View style={styles.timelineWrapper}>
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
            </View>
          )}
        </View>

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
                  {selectedTask.title || "Untitled Task"}
                </Text>
                <Text style={styles.selectedTaskTime}>
                  {formatTaskDateTimeRange(
                    selectedTask.start_time,
                    selectedTask.end_time
                  )}
                </Text>
              </View>
            </View>

            {selectedTask.detail ? (
              <Text style={styles.selectedTaskDetail}>
                {selectedTask.detail}
              </Text>
            ) : null}

            <View style={styles.infoTagRow}>
              <View style={styles.infoTag}>
                <Text style={styles.infoTagText}>
                  Priority: {selectedTask.priority || "Normal"}
                </Text>
              </View>

              <View style={styles.infoTag}>
                <Text style={styles.infoTagText}>
                  Repeat: {getRepeatLabel(selectedTask)}
                </Text>
              </View>

              {selectedTask.has_conflict ? (
                <View style={[styles.infoTag, styles.conflictInfoTag]}>
                  <Text style={styles.conflictInfoText}>Conflict</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.selectedTaskActionRow}>
              {selectedTask.is_completed ? (
                <Pressable
                  style={styles.undoButton}
                  onPress={() => handleUndoCompletedTask(selectedTask.id)}
                >
                  <Ionicons name="refresh-outline" size={18} color={UI.text} />
                  <Text style={styles.undoButtonText}>Undo</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={styles.doneButton}
                  onPress={() => handleDoneTask(selectedTask.id)}
                >
                  <Ionicons name="checkmark" size={18} color={UI.textLight} />
                  <Text style={styles.doneButtonText}>Done</Text>
                </Pressable>
              )}

              <Pressable
                style={styles.editButton}
                onPress={() => handleEditTask(selectedTask)}
              >
                <Ionicons name="create-outline" size={18} color={UI.textLight} />
                <Text style={styles.editButtonText}>Edit</Text>
              </Pressable>

              <Pressable
                style={styles.deleteButton}
                onPress={() => openDeleteModal(selectedTask)}
              >
                <Ionicons name="trash-outline" size={18} color={UI.textLight} />
                <Text style={styles.deleteButtonText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <BottomNav activeTab="calendar" />

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
                <Text style={styles.pickerTitle}>Select Month</Text>
                <Text style={styles.pickerSubtitle}>
                  Jump directly to a month and year
                </Text>
              </View>

              <Pressable style={styles.pickerCloseButton} onPress={closeMonthPicker}>
                <Ionicons name="close" size={22} color={UI.text} />
              </Pressable>
            </View>

            <Text style={styles.pickerSectionTitle}>Month</Text>

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

            <Text style={styles.pickerSectionTitle}>Year</Text>

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
              <Pressable style={styles.pickerCancelButton} onPress={closeMonthPicker}>
                <Text style={styles.pickerCancelText}>Cancel</Text>
              </Pressable>

              <Pressable style={styles.pickerApplyButton} onPress={applyMonthPicker}>
                <Text style={styles.pickerApplyText}>Apply</Text>
              </Pressable>
            </View>
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
                  <Text style={styles.modalButtonText}>Delete main task only</Text>
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
                    Delete main task and all sessions
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
                  <Text style={styles.modalButtonText}>Delete this task only</Text>
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
                    Delete all recurring tasks
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
                  {isDeleting ? "Deleting..." : "Delete Task"}
                </Text>
              </Pressable>
            )}

            <Pressable
              style={styles.cancelDeleteButton}
              onPress={closeDeleteModal}
              disabled={isDeleting}
            >
              <Text style={styles.cancelDeleteText}>Cancel</Text>
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
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 58,
    paddingHorizontal: 18,
    paddingBottom: 130,
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
    paddingHorizontal: 4,
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
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: UI.border,
    marginBottom: 18,
  },
  dayCellEmpty: {
    width: `${100 / 7}%`,
    height: 62,
  },
  dayCell: {
    width: `${100 / 7}%`,
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
    marginTop: 4,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 3,
  },
  taskDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
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
  },
  doneButton: {
    flex: 1,
    backgroundColor: UI.success,
    borderRadius: 14,
    paddingVertical: 12,
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
    backgroundColor: UI.cardSoft,
    borderRadius: 14,
    paddingVertical: 12,
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
    backgroundColor: UI.primary,
    borderRadius: 14,
    paddingVertical: 12,
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
    backgroundColor: UI.danger,
    borderRadius: 14,
    paddingVertical: 12,
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
  disabledButton: {
    opacity: 0.55,
  },
});

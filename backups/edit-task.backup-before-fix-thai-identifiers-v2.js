import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";
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

import TimePickerModal from "../src/components/TimePickerModal";
import { auth } from "../src/config/firebase";
import { COLORS } from "../src/constants/theme";
import {
  getTaskById,
  rescheduleTask,
  updateTask,
} from "../src/services/taskService";
import {
  RECURRENCE_TYPES,
  WEEKDAY_OPTIONS,
} from "../src/utils/recurrence";

export default function EditTask() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const id = params?.id;
  const from = params?.from ? String(params.from) : "";

  const isRescheduleMode = from === "reschedule";
  const isFromCalendar = from === "calendar";
  const isFromTasks = from === "tasks";

  const getReturnPath = () => {
    if (isFromCalendar) return "/calentask";
    if (isFromTasks || isRescheduleMode) return "/tasks";
    return "/tasks";
  };

  const handleBack = () => {
    router.replace(getReturnPath());
  };

  const handleAfterSave = () => {
    router.replace(getReturnPath());
  };

  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");

  const [startDateTime, setStartDateTime] = useState(new Date());
  const [endDateTime, setEndDateTime] = useState(
    new Date(Date.now() + 60 * 60 * 1000)
  );

  const [repeatType, setRepeatType] = useState(RECURRENCE_TYPES.NONE);
  const [customDays, setCustomDays] = useState(1);
  const [selectedWeekdays, setSelectedWeekdays] = useState([
    new Date().getDay(),
  ]);
  const [weekInterval, setWeekInterval] = useState(1);
  const [monthDay, setMonthDay] = useState(new Date().getDate());
  const [monthInterval, setMonthInterval] = useState(1);
  const [recurrenceIndex, setRecurrenceIndex] = useState(null);
  const [recurrenceGroupId, setRecurrenceGroupId] = useState(null);
  const [editScope, setEditScope] = useState("single");

  const [priority, setPriority] = useState("Medium");
  const [deadlineDate, setDeadlineDate] = useState(
    new Date(Date.now() + 24 * 60 * 60 * 1000)
  );
  const [estimatedDuration, setEstimatedDuration] = useState(60);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [timePickerTarget, setTimePickerTarget] = useState(null);

  const [conflictModalVisible, setConflictModalVisible] = useState(false);
  const [conflictResult, setConflictResult] = useState(null);
  const [pendingTaskPayload, setPendingTaskPayload] = useState(null);

  const [editScopeModalVisible, setEditScopeModalVisible] = useState(false);
  const [pendingEditPayload, setPendingEditPayload] = useState(null);

  const repeatOptions = [
    { label: "Does not repeat", value: RECURRENCE_TYPES.NONE },
    { label: "Daily", value: RECURRENCE_TYPES.DAILY },
    { label: "Every N days", value: RECURRENCE_TYPES.CUSTOM_DAYS },
    { label: "Weekly", value: RECURRENCE_TYPES.WEEKLY },
    { label: "Monthly", value: RECURRENCE_TYPES.MONTHLY },
  ];

  const customDayOptions = Array.from({ length: 31 }, (_, index) => index + 1);

  const weekIntervalOptions = [1, 2, 3, 4, 5, 6, 8, 12];

  const monthDayOptions = Array.from({ length: 31 }, (_, index) => index + 1);

  const monthIntervalOptions = [1, 2, 3, 4, 6, 12];

  const priorityOptions = [
    {
      label: "Low",
      value: "Low",
      description: "Not urgent",
    },
    {
      label: "Medium",
      value: "Medium",
      description: "Normal task",
    },
    {
      label: "High",
      value: "High",
      description: "Important",
    },
  ];

  const durationOptions = [15, 30, 45, 60, 90, 120, 180, 240];

  const normalizeDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === "function") return value.toDate();
    return new Date(value);
  };

  const isValidDate = (value) => {
    return value instanceof Date && !Number.isNaN(value.getTime());
  };

  const normalizeRepeatType = (value) => {
    const type = String(value || RECURRENCE_TYPES.NONE).toLowerCase();

    if (type === "everyday") return RECURRENCE_TYPES.DAILY;
    if (type === "daily") return RECURRENCE_TYPES.DAILY;

    if (type === "everyweek") return RECURRENCE_TYPES.WEEKLY;
    if (type === "weekly") return RECURRENCE_TYPES.WEEKLY;

    if (type === "custom") return RECURRENCE_TYPES.CUSTOM_DAYS;
    if (type === "custom_days") return RECURRENCE_TYPES.CUSTOM_DAYS;

    if (type === "monthly") return RECURRENCE_TYPES.MONTHLY;

    return RECURRENCE_TYPES.NONE;
  };

  const normalizePositiveNumber = (value, fallback = 1, maxValue = 100) => {
    const numberValue = Number(value);

    if (!Number.isFinite(numberValue) || numberValue <= 0) {
      return fallback;
    }

    return Math.min(maxValue, Math.max(1, Math.floor(numberValue)));
  };

  const addMinutes = (date, minutes) => {
    const baseDate = normalizeDate(date) || new Date();
    const nextDate = new Date(baseDate);
    nextDate.setMinutes(nextDate.getMinutes() + minutes);
    return nextDate;
  };

  const buildDateWithTime = (dateSource, timeSource) => {
    const baseDate = normalizeDate(dateSource) || new Date();
    const baseTime = normalizeDate(timeSource) || new Date();

    const result = new Date(baseDate);
    result.setHours(baseTime.getHours(), baseTime.getMinutes(), 0, 0);

    return result;
  };

  const normalizeEndDateForStart = (startValue, endValue) => {
    const start = normalizeDate(startValue);
    const end = normalizeDate(endValue);

    if (!isValidDate(start) || !isValidDate(end)) {
      return addMinutes(start || new Date(), 60);
    }

    const normalizedEnd = buildDateWithTime(start, end);

    if (normalizedEnd <= start) {
      normalizedEnd.setDate(normalizedEnd.getDate() + 1);
    }

    return normalizedEnd;
  };

  const getSafeTaskTimeRange = () => {
    const safeStartTime = normalizeDate(startDateTime) || new Date();
    const safeEndTime = normalizeEndDateForStart(safeStartTime, endDateTime);

    return {
      safeStartTime,
      safeEndTime,
    };
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const loadTask = async () => {
      if (!isAuthReady) return;

      if (!user) {
        setIsLoading(false);
        router.replace("/login");
        return;
      }

      try {
        setIsLoading(true);

        if (!id) {
          Alert.alert("Error", "Task ID was not found.");
          handleBack();
          return;
        }

        const task = await getTaskById(String(id));
        const start = normalizeDate(task.start_time) || new Date();
        const end =
          normalizeDate(task.end_time) ||
          new Date(Date.now() + 60 * 60 * 1000);

        const safeRepeatType =
          task.is_recurring === true
            ? normalizeRepeatType(task.recurrence_type)
            : RECURRENCE_TYPES.NONE;

        setTitle(task.title || "");
        setDetail(task.detail || "");

        setStartDateTime(start);
        setEndDateTime(end);

        setPriority(task.priority || "Medium");
        setDeadlineDate(
          normalizeDate(task.deadline) ||
          normalizeDate(task.end_time) ||
          new Date(Date.now() + 24 * 60 * 60 * 1000)
        );
        setEstimatedDuration(task.estimated_duration_minutes || 60);

        setRepeatType(safeRepeatType);

        setCustomDays(
          safeRepeatType === RECURRENCE_TYPES.CUSTOM_DAYS
            ? normalizePositiveNumber(task.recurrence_interval_days, 1, 100)
            : 1
        );

        setSelectedWeekdays(
          safeRepeatType === RECURRENCE_TYPES.WEEKLY &&
            Array.isArray(task.recurrence_weekdays) &&
            task.recurrence_weekdays.length > 0
            ? [...new Set(task.recurrence_weekdays)]
              .map((day) => Number(day))
              .filter((day) => day >= 0 && day <= 6)
              .sort((a, b) => a - b)
            : [start.getDay()]
        );

        setWeekInterval(
          safeRepeatType === RECURRENCE_TYPES.WEEKLY
            ? normalizePositiveNumber(task.recurrence_week_interval, 1, 12)
            : 1
        );

        setMonthDay(
          safeRepeatType === RECURRENCE_TYPES.MONTHLY
            ? normalizePositiveNumber(
              task.recurrence_month_day,
              start.getDate(),
              31
            )
            : start.getDate()
        );

        setMonthInterval(
          safeRepeatType === RECURRENCE_TYPES.MONTHLY
            ? normalizePositiveNumber(task.recurrence_month_interval, 1, 12)
            : 1
        );

        setRecurrenceIndex(task.recurrence_index || null);
        setRecurrenceGroupId(task.recurrence_group_id || null);
        setEditScope("single");
      } catch (error) {
        console.error("Load task error:", error);

        if (error?.message === "AUTH_REQUIRED") {
          router.replace("/login");
          return;
        }

        if (error?.message === "PERMISSION_DENIED") {
          Alert.alert("Error", "You do not have permission to edit this task.");
          handleBack();
          return;
        }

        Alert.alert("Error", "Unable to load this task.");
        handleBack();
      } finally {
        setIsLoading(false);
      }
    };

    loadTask();
  }, [id, isAuthReady, user, router]);

  const ensureLoggedIn = () => {
    if (!auth.currentUser) {
      Alert.alert("Login Required", "Please log in before using this feature.");
      router.replace("/login");
      return false;
    }

    return true;
  };

  const getPickerValue = (target) => {
    if (target === "start") return startDateTime;
    if (target === "end") return endDateTime;
    if (target === "deadline") return deadlineDate;

    return new Date();
  };

  const pad2 = (value) => String(value).padStart(2, "0");

  const handleDatePickerValueChange = (target, selectedValue) => {
    if (!selectedValue || !target) return;

    if (target === "deadline") {
      const newDeadline = new Date(deadlineDate);

      newDeadline.setFullYear(selectedValue.getFullYear());
      newDeadline.setMonth(selectedValue.getMonth());
      newDeadline.setDate(selectedValue.getDate());
      newDeadline.setHours(23, 59, 59, 999);

      setDeadlineDate(newDeadline);
      return;
    }

    if (target === "start") {
      const newStartDateTime = buildDateWithTime(selectedValue, startDateTime);
      const newEndDateTime = normalizeEndDateForStart(
        newStartDateTime,
        endDateTime
      );

      setStartDateTime(newStartDateTime);
      setEndDateTime(newEndDateTime);

      if (repeatType === RECURRENCE_TYPES.MONTHLY) {
        setMonthDay(newStartDateTime.getDate());
      }

      if (
        repeatType === RECURRENCE_TYPES.WEEKLY &&
        (!selectedWeekdays || selectedWeekdays.length === 0)
      ) {
        setSelectedWeekdays([newStartDateTime.getDay()]);
      }

      return;
    }

    if (target === "end") {
      const currentEndDateTime = normalizeEndDateForStart(
        startDateTime,
        endDateTime
      );
      const newEndDateTime = new Date(currentEndDateTime);

      newEndDateTime.setFullYear(selectedValue.getFullYear());
      newEndDateTime.setMonth(selectedValue.getMonth());
      newEndDateTime.setDate(selectedValue.getDate());

      if (newEndDateTime <= startDateTime) {
        Alert.alert("Error", "End date and time must be later than start time.");
        return;
      }

      setEndDateTime(newEndDateTime);
    }
  };

  const openTimePicker = (target) => {
    if (isSaving) return;

    setTimePickerTarget(target);
    setTimePickerVisible(true);
  };

  const closeTimePicker = () => {
    setTimePickerVisible(false);
    setTimePickerTarget(null);
  };

  const handleConfirmTime = ({ hour, minute }) => {
    if (!timePickerTarget) {
      closeTimePicker();
      return;
    }

    if (timePickerTarget === "start") {
      const selectedStart = new Date(startDateTime);
      selectedStart.setHours(hour, minute, 0, 0);

      const normalizedEnd = normalizeEndDateForStart(
        selectedStart,
        endDateTime
      );

      setStartDateTime(selectedStart);
      setEndDateTime(normalizedEnd);
    }

    if (timePickerTarget === "end") {
      const selectedEnd = buildDateWithTime(startDateTime, endDateTime);
      selectedEnd.setHours(hour, minute, 0, 0);

      if (selectedEnd <= startDateTime) {
        selectedEnd.setDate(selectedEnd.getDate() + 1);
      }

      setEndDateTime(selectedEnd);
    }

    closeTimePicker();
  };

  const openPicker = (target, mode) => {
    if (isSaving) return;

    if (mode === "time") {
      openTimePicker(target);
      return;
    }

    DateTimePickerAndroid.open({
      value: getPickerValue(target) || new Date(),
      mode: "date",
      is24Hour: true,
      display: "default",
      onChange: (event, selectedValue) => {
        if (event?.type === "dismissed") return;
        if (!selectedValue) return;

        handleDatePickerValueChange(target, selectedValue);
      },
    });
  };

  const formatDate = (value) => {
    const date = normalizeDate(value);

    if (!isValidDate(date)) return "";

    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (value) => {
    const date = normalizeDate(value);

    if (!isValidDate(date)) return "";

    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  };

  const formatDuration = (minutes) => {
    if (minutes < 60) return `${minutes} min`;

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (remainingMinutes === 0) return `${hours} hr`;

    return `${hours} hr ${remainingMinutes} min`;
  };

  const formatConflictDate = (value) => {
    const date = normalizeDate(value);

    if (!isValidDate(date)) return "-";

    return date.toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
    });
  };

  const handleCustomDaysChange = (value) => {
    const onlyNumber = value.replace(/[^0-9]/g, "");
    const numberValue = Number(onlyNumber);

    if (!onlyNumber) {
      setCustomDays("");
      return;
    }

    if (numberValue > 100) {
      setCustomDays(100);
      return;
    }

    setCustomDays(numberValue);
  };

  const handlePositiveNumberChange = (value, setter, maxValue = 100) => {
    const onlyNumber = value.replace(/[^0-9]/g, "");
    const numberValue = Number(onlyNumber);

    if (!onlyNumber) {
      setter("");
      return;
    }

    if (numberValue > maxValue) {
      setter(maxValue);
      return;
    }

    setter(numberValue);
  };

  const handleToggleWeekday = (weekdayValue) => {
    setSelectedWeekdays((prev) => {
      if (prev.includes(weekdayValue)) {
        const next = prev.filter((day) => day !== weekdayValue);
        return next.length > 0 ? next : prev;
      }

      return [...prev, weekdayValue].sort((a, b) => a - b);
    });
  };

  const getWeekdayNames = () => {
    return selectedWeekdays
      .map(
        (day) =>
          WEEKDAY_OPTIONS.find((option) => option.value === day)?.fullLabel || ""
      )
      .filter(Boolean)
      .join(", ");
  };

  const handleRepeatTypeChange = (nextType) => {
    setRepeatType(nextType);

    if (nextType === RECURRENCE_TYPES.WEEKLY && selectedWeekdays.length === 0) {
      setSelectedWeekdays([startDateTime.getDay()]);
    }

    if (nextType === RECURRENCE_TYPES.MONTHLY) {
      setMonthDay(startDateTime.getDate());
    }
  };

  const buildTaskPayload = () => {
    const { safeStartTime, safeEndTime } = getSafeTaskTimeRange();

    return {
      title: title.trim(),
      detail: detail.trim(),

      start_time: safeStartTime,
      end_time: safeEndTime,

      task_type: "fixed",

      priority,
      deadline: deadlineDate,
      estimated_duration_minutes: Number(estimatedDuration),

      is_recurring: repeatType !== RECURRENCE_TYPES.NONE,
      recurrence_type: repeatType,
      recurrence_interval_days:
        repeatType === RECURRENCE_TYPES.CUSTOM_DAYS
          ? Number(customDays)
          : repeatType === RECURRENCE_TYPES.DAILY
            ? 1
            : null,
      recurrence_weekdays:
        repeatType === RECURRENCE_TYPES.WEEKLY ? selectedWeekdays : null,
      recurrence_week_interval:
        repeatType === RECURRENCE_TYPES.WEEKLY ? Number(weekInterval) : null,
      recurrence_month_day:
        repeatType === RECURRENCE_TYPES.MONTHLY ? Number(monthDay) : null,
      recurrence_month_interval:
        repeatType === RECURRENCE_TYPES.MONTHLY ? Number(monthInterval) : null,
      recurrence_index: recurrenceIndex,
      recurrence_group_id:
        repeatType !== RECURRENCE_TYPES.NONE ? recurrenceGroupId : null,

      updated_at: new Date(),
    };
  };

  const resetConflictState = () => {
    setConflictModalVisible(false);
    setConflictResult(null);
    setPendingTaskPayload(null);
  };

  const handleChangeTimeFromConflict = () => {
    setConflictModalVisible(false);
  };

  const handleCancelConflict = () => {
    resetConflictState();
  };

  const executeUpdate = async (taskPayload, scope = "single") => {
    try {
      setIsSaving(true);

      if (isRescheduleMode) {
        const result = await rescheduleTask(
          String(id),
          taskPayload.start_time,
          taskPayload.end_time
        );

        if (result?.success === true || result === undefined) {
          handleAfterSave();
          return;
        }

        Alert.alert("Error", "Unable to reschedule this task. Please try again.");
        return;
      }

      const result = await updateTask(String(id), taskPayload, {
        editScope: scope,
      });

      if (result?.has_conflict === true && result?.success === false) {
        setEditScope(scope);
        setPendingTaskPayload(taskPayload);
        setConflictResult(result);
        setConflictModalVisible(true);
        return;
      }

      if (result?.success === true || result === undefined) {
        handleAfterSave();
        return;
      }

      Alert.alert("Error", "Unable to update this task. Please try again.");
    } catch (error) {
      console.error(
        isRescheduleMode ? "Reschedule task error:" : "Update task error:",
        error
      );

      if (error?.message === "AUTH_REQUIRED") {
        router.replace("/login");
        return;
      }

      if (error?.message === "PERMISSION_DENIED") {
        Alert.alert("Error", "You do not have permission to edit this task.");
        return;
      }

      Alert.alert(
        "Error",
        isRescheduleMode
          ? "Unable to reschedule this task. Please try again."
          : "Unable to update this task. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleChooseEditScope = async (scope) => {
    if (!pendingEditPayload) return;

    setEditScope(scope);
    setEditScopeModalVisible(false);

    await executeUpdate(pendingEditPayload, scope);

    setPendingEditPayload(null);
  };

  const handleSaveAnyway = async () => {
    if (!ensureLoggedIn()) return;
    if (!pendingTaskPayload || isSaving) return;

    try {
      setIsSaving(true);

      const result = await updateTask(String(id), pendingTaskPayload, {
        saveAnyway: true,
        editScope,
      });

      if (result?.success === true || result === undefined) {
        resetConflictState();
        handleAfterSave();
        return;
      }

      Alert.alert("Error", "Unable to save changes. Please try again.");
    } catch (error) {
      console.error("Save anyway edit error:", error);

      if (error?.message === "AUTH_REQUIRED") {
        router.replace("/login");
        return;
      }

      if (error?.message === "PERMISSION_DENIED") {
        Alert.alert("Error", "You do not have permission to edit this task.");
        return;
      }

      Alert.alert("Error", "Unable to save changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!ensureLoggedIn()) return;
    if (isSaving) return;

    if (!id) {
      Alert.alert("Error", "Task ID was not found.");
      return;
    }

    if (!title.trim()) {
      Alert.alert("Error", "Please enter a title.");
      return;
    }

    const { safeStartTime, safeEndTime } = getSafeTaskTimeRange();

    if (safeEndTime <= safeStartTime) {
      Alert.alert("Error", "End time must be later than start time.");
      return;
    }

    if (
      repeatType === RECURRENCE_TYPES.CUSTOM_DAYS &&
      (!customDays || Number(customDays) < 1 || Number(customDays) > 100)
    ) {
      Alert.alert(
        "Error",
        "Custom repeat interval must be between 1 and 100 days."
      );
      return;
    }

    if (
      repeatType === RECURRENCE_TYPES.WEEKLY &&
      (!selectedWeekdays || selectedWeekdays.length === 0)
    ) {
      Alert.alert("Error", "Please select at least one weekday.");
      return;
    }

    if (
      repeatType === RECURRENCE_TYPES.WEEKLY &&
      (!weekInterval || Number(weekInterval) < 1 || Number(weekInterval) > 12)
    ) {
      Alert.alert("Error", "Week interval must be between 1 and 12 weeks.");
      return;
    }

    if (
      repeatType === RECURRENCE_TYPES.MONTHLY &&
      (!monthDay || Number(monthDay) < 1 || Number(monthDay) > 31)
    ) {
      Alert.alert("Error", "Month day must be between 1 and 31.");
      return;
    }

    if (
      repeatType === RECURRENCE_TYPES.MONTHLY &&
      (!monthInterval || Number(monthInterval) < 1 || Number(monthInterval) > 12)
    ) {
      Alert.alert("Error", "Month interval must be between 1 and 12 months.");
      return;
    }

    if (!priority) {
      Alert.alert("Error", "Please select a priority.");
      return;
    }

    if (!estimatedDuration || Number(estimatedDuration) <= 0) {
      Alert.alert("Error", "Please select estimated duration.");
      return;
    }

    const taskPayload = buildTaskPayload();

    if (!isRescheduleMode && recurrenceGroupId) {
      setPendingEditPayload(taskPayload);
      setEditScopeModalVisible(true);
      return;
    }

    await executeUpdate(taskPayload, "single");
  };

  const getPriorityChipStyle = (value) => {
    if (value === "High") {
      return {
        backgroundColor: "#FEE2E2",
        borderColor: "#FCA5A5",
      };
    }

    if (value === "Medium") {
      return {
        backgroundColor: "#FEF3C7",
        borderColor: "#FDE68A",
      };
    }

    return {
      backgroundColor: "#DCFCE7",
      borderColor: "#BBF7D0",
    };
  };

  const getPriorityTextColor = (value) => {
    if (value === "High") return COLORS.danger;
    if (value === "Medium") return COLORS.warning;
    return COLORS.success;
  };

  const conflictItems = conflictResult?.conflict_items || [];
  const conflictPreviewItems = conflictItems.slice(0, 5);
  const remainingConflictCount =
    conflictItems.length > 5 ? conflictItems.length - 5 : 0;

  if (isLoading || !isAuthReady) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading task...</Text>
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
    <View style={styles.screen}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topNav}>
          <Pressable style={styles.navIconButton} onPress={handleBack}>
            <Text style={styles.backIconText}>{"<"}</Text>
          </Pressable>

          <Text style={styles.navTitle}>
            {isRescheduleMode ? "Reschedule Task" : "Edit Task"}
          </Text>

          <Pressable
            style={[styles.doneButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleUpdate}
            disabled={isSaving}
          >
            <Text style={styles.doneButtonText}>Save</Text>
          </Pressable>
        </View>

        {!isRescheduleMode ? (
          <View style={styles.card}>
            <TextInput
              style={styles.titleInput}
              placeholder="Title"
              placeholderTextColor={COLORS.textMuted}
              value={title}
              onChangeText={setTitle}
              numberOfLines={1}
            />

            <View style={styles.line} />

            <TextInput
              style={styles.detailInput}
              placeholder="Detail / Note"
              placeholderTextColor={COLORS.textMuted}
              value={detail}
              onChangeText={setDetail}
              multiline
              textAlignVertical="top"
            />
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.rescheduleTitle} numberOfLines={2}>
              {title || "Untitled Task"}
            </Text>

            {detail ? (
              <>
                <View style={styles.line} />
                <Text style={styles.rescheduleDetail}>{detail}</Text>
              </>
            ) : null}
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Start</Text>

            <Pressable
              style={styles.pickerBox}
              onPress={() => openPicker("start", "date")}
            >
              <Text style={styles.pickerText}>{formatDate(startDateTime)}</Text>
            </Pressable>

            <Pressable
              style={styles.timeBox}
              onPress={() => openPicker("start", "time")}
            >
              <Text style={styles.pickerText}>{formatTime(startDateTime)}</Text>
            </Pressable>
          </View>

          <View style={styles.line} />

          <View style={styles.row}>
            <Text style={styles.label}>End</Text>

            <Pressable
              style={styles.pickerBox}
              onPress={() => openPicker("end", "date")}
            >
              <Text style={styles.pickerText}>{formatDate(endDateTime)}</Text>
            </Pressable>

            <Pressable
              style={styles.timeBox}
              onPress={() => openPicker("end", "time")}
            >
              <Text style={styles.pickerText}>{formatTime(endDateTime)}</Text>
            </Pressable>
          </View>
        </View>

        {!isRescheduleMode ? (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Time Management</Text>

              <Text style={styles.subSectionTitle}>Priority</Text>

              <View style={styles.priorityContainer}>
                {priorityOptions.map((option) => {
                  const active = priority === option.value;

                  return (
                    <Pressable
                      key={option.value}
                      style={[
                        styles.priorityButton,
                        getPriorityChipStyle(option.value),
                        active && styles.priorityButtonActive,
                        active &&
                        option.value === "Low" &&
                        styles.priorityLowActive,
                        active &&
                        option.value === "Medium" &&
                        styles.priorityMediumActive,
                        active &&
                        option.value === "High" &&
                        styles.priorityHighActive,
                      ]}
                      onPress={() => setPriority(option.value)}
                    >
                      <Text
                        style={[
                          styles.priorityText,
                          {
                            color: active
                              ? COLORS.textLight
                              : getPriorityTextColor(option.value),
                          },
                        ]}
                      >
                        {active ? "Selected " : ""}
                        {option.label}
                      </Text>

                      <Text
                        style={[
                          styles.priorityDescription,
                          active && styles.priorityDescriptionActive,
                        ]}
                      >
                        {option.description}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.line} />

              <View style={styles.row}>
                <Text style={styles.label}>Deadline</Text>

                <Pressable
                  style={styles.deadlineBox}
                  onPress={() => openPicker("deadline", "date")}
                >
                  <Text style={styles.pickerText}>
                    {formatDate(deadlineDate)}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.line} />

              <Text style={styles.subSectionTitle}>Estimated Duration</Text>

              <View style={styles.durationContainer}>
                {durationOptions.map((duration) => (
                  <Pressable
                    key={duration}
                    style={[
                      styles.durationButton,
                      estimatedDuration === duration &&
                      styles.durationButtonActive,
                    ]}
                    onPress={() => setEstimatedDuration(duration)}
                  >
                    <Text
                      style={[
                        styles.durationText,
                        estimatedDuration === duration &&
                        styles.durationTextActive,
                      ]}
                    >
                      {formatDuration(duration)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.helpText}>
                These values help the system recommend suitable tasks for
                available free time.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Repeat</Text>

              {recurrenceGroupId ? (
                <Text style={styles.repeatNoticeText}>
                  This task is part of a recurring task group. You will choose
                  how to apply changes when saving.
                </Text>
              ) : null}

              <View style={styles.repeatContainer}>
                {repeatOptions.map((option) => (
                  <Pressable
                    key={option.value}
                    style={[
                      styles.repeatButton,
                      repeatType === option.value && styles.repeatButtonActive,
                    ]}
                    onPress={() => handleRepeatTypeChange(option.value)}
                  >
                    <Text
                      style={[
                        styles.repeatText,
                        repeatType === option.value && styles.repeatTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {repeatType === RECURRENCE_TYPES.NONE && (
                <Text style={styles.helpText}>
                  This task will be created only once.
                </Text>
              )}

              {repeatType === RECURRENCE_TYPES.DAILY && (
                <Text style={styles.helpText}>
                  This task will repeat every day at the same time.
                </Text>
              )}

              {repeatType === RECURRENCE_TYPES.CUSTOM_DAYS && (
                <>
                  <View style={styles.line} />

                  <View style={styles.inputRow}>
                    <Text style={styles.smallLabel}>Repeat every</Text>

                    <TextInput
                      style={styles.numberInput}
                      value={String(customDays)}
                      onChangeText={handleCustomDaysChange}
                      keyboardType="number-pad"
                      placeholder="1"
                      placeholderTextColor={COLORS.textMuted}
                      maxLength={3}
                    />

                    <Text style={styles.smallLabel}>day(s)</Text>
                  </View>

                  <View style={styles.customDayContainer}>
                    {customDayOptions.map((day) => (
                      <Pressable
                        key={day}
                        style={[
                          styles.dayButton,
                          Number(customDays) === day &&
                          styles.dayButtonActive,
                        ]}
                        onPress={() => setCustomDays(day)}
                      >
                        <Text
                          style={[
                            styles.dayButtonText,
                            Number(customDays) === day &&
                            styles.dayButtonTextActive,
                          ]}
                        >
                          {day}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.helpText}>
                    For example, 3 means the task repeats every 3 days.
                  </Text>
                </>
              )}

              {repeatType === RECURRENCE_TYPES.WEEKLY && (
                <>
                  <View style={styles.line} />

                  <View style={styles.inputRow}>
                    <Text style={styles.smallLabel}>Repeat every</Text>

                    <TextInput
                      style={styles.numberInput}
                      value={String(weekInterval)}
                      onChangeText={(value) =>
                        handlePositiveNumberChange(
                          value,
                          setWeekInterval,
                          12
                        )
                      }
                      keyboardType="number-pad"
                      placeholder="1"
                      placeholderTextColor={COLORS.textMuted}
                      maxLength={2}
                    />

                    <Text style={styles.smallLabel}>week(s)</Text>
                  </View>

                  <View style={styles.customDayContainer}>
                    {weekIntervalOptions.map((week) => (
                      <Pressable
                        key={week}
                        style={[
                          styles.dayButton,
                          Number(weekInterval) === week &&
                          styles.dayButtonActive,
                        ]}
                        onPress={() => setWeekInterval(week)}
                      >
                        <Text
                          style={[
                            styles.dayButtonText,
                            Number(weekInterval) === week &&
                            styles.dayButtonTextActive,
                          ]}
                        >
                          {week}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.subSectionTitle}>Repeat on</Text>

                  <View style={styles.weekdayContainer}>
                    {WEEKDAY_OPTIONS.map((day) => {
                      const active = selectedWeekdays.includes(day.value);

                      return (
                        <Pressable
                          key={day.value}
                          style={[
                            styles.weekdayButton,
                            active && styles.weekdayButtonActive,
                          ]}
                          onPress={() => handleToggleWeekday(day.value)}
                        >
                          <Text
                            style={[
                              styles.weekdayText,
                              active && styles.weekdayTextActive,
                            ]}
                          >
                            {day.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={styles.helpText}>
                    This task will repeat every {weekInterval || 1} week(s) on{" "}
                    {getWeekdayNames()}.
                  </Text>
                </>
              )}

              {repeatType === RECURRENCE_TYPES.MONTHLY && (
                <>
                  <View style={styles.line} />

                  <View style={styles.inputRow}>
                    <Text style={styles.smallLabel}>Repeat every</Text>

                    <TextInput
                      style={styles.numberInput}
                      value={String(monthInterval)}
                      onChangeText={(value) =>
                        handlePositiveNumberChange(
                          value,
                          setMonthInterval,
                          12
                        )
                      }
                      keyboardType="number-pad"
                      placeholder="1"
                      placeholderTextColor={COLORS.textMuted}
                      maxLength={2}
                    />

                    <Text style={styles.smallLabel}>month(s)</Text>
                  </View>

                  <View style={styles.customDayContainer}>
                    {monthIntervalOptions.map((month) => (
                      <Pressable
                        key={month}
                        style={[
                          styles.dayButton,
                          Number(monthInterval) === month &&
                          styles.dayButtonActive,
                        ]}
                        onPress={() => setMonthInterval(month)}
                      >
                        <Text
                          style={[
                            styles.dayButtonText,
                            Number(monthInterval) === month &&
                            styles.dayButtonTextActive,
                          ]}
                        >
                          {month}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <View style={styles.inputRow}>
                    <Text style={styles.smallLabel}>On day</Text>

                    <TextInput
                      style={styles.numberInput}
                      value={String(monthDay)}
                      onChangeText={(value) =>
                        handlePositiveNumberChange(value, setMonthDay, 31)
                      }
                      keyboardType="number-pad"
                      placeholder="1"
                      placeholderTextColor={COLORS.textMuted}
                      maxLength={2}
                    />

                    <Text style={styles.smallLabel}>of month</Text>
                  </View>

                  <View style={styles.customDayContainer}>
                    {monthDayOptions.map((day) => (
                      <Pressable
                        key={day}
                        style={[
                          styles.dayButton,
                          Number(monthDay) === day && styles.dayButtonActive,
                        ]}
                        onPress={() => setMonthDay(day)}
                      >
                        <Text
                          style={[
                            styles.dayButtonText,
                            Number(monthDay) === day &&
                            styles.dayButtonTextActive,
                          ]}
                        >
                          {day}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.helpText}>
                    This task will repeat every {monthInterval || 1} month(s) on
                    day {monthDay || startDateTime.getDate()}.
                  </Text>
                </>
              )}
            </View>
          </>
        ) : (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Reschedule Mode</Text>
            <Text style={styles.infoText}>
              Only the start and end time will be updated. Other task details
              will stay the same.
            </Text>
          </View>
        )}

        <Pressable
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleUpdate}
          disabled={isSaving}
        >
          <Text style={styles.saveText}>
            {isSaving
              ? isRescheduleMode
                ? "Rescheduling..."
                : "Checking..."
              : isRescheduleMode
                ? "Save New Time"
                : "Save Changes"}
          </Text>
        </Pressable>

        <Pressable style={styles.cancelButton} onPress={handleBack}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </ScrollView>

      <TimePickerModal
        visible={timePickerVisible}
        title={
          timePickerTarget === "start"
            ? "Select start time"
            : "Select end time"
        }
        initialDate={getPickerValue(timePickerTarget)}
        onClose={closeTimePicker}
        onConfirm={handleConfirmTime}
      />

      <Modal
        visible={editScopeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setEditScopeModalVisible(false);
          setPendingEditPayload(null);
        }}
      >
        <Pressable
          style={styles.conflictOverlay}
          onPress={() => {
            setEditScopeModalVisible(false);
            setPendingEditPayload(null);
          }}
        >
          <Pressable
            style={styles.editScopeModalBox}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.editScopeModalTitle}>Apply changes to</Text>

            <Text style={styles.editScopeModalMessage}>
              This task is part of a recurring task group. Choose whether to
              update only this task or recreate the whole recurring group.
            </Text>

            <Pressable
              style={styles.editScopeModalPrimaryButton}
              onPress={() => handleChooseEditScope("single")}
            >
              <Text style={styles.editScopeModalPrimaryText}>
                This task only
              </Text>
            </Pressable>

            <Pressable
              style={styles.editScopeModalDangerButton}
              onPress={() => handleChooseEditScope("all")}
            >
              <Text style={styles.editScopeModalDangerText}>
                All recurring tasks
              </Text>
            </Pressable>

            <Pressable
              style={styles.editScopeModalCancelButton}
              onPress={() => {
                setEditScopeModalVisible(false);
                setPendingEditPayload(null);
              }}
            >
              <Text style={styles.editScopeModalCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!isRescheduleMode && conflictModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleChangeTimeFromConflict}
      >
        <Pressable
          style={styles.conflictOverlay}
          onPress={handleChangeTimeFromConflict}
        >
          <Pressable
            style={styles.conflictModalBox}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.conflictModalTitle}>Time Conflict Detected</Text>

            <Text style={styles.conflictModalMessage}>
              {`Found ${conflictResult?.conflict_count || 0} conflicting task${(conflictResult?.conflict_count || 0) > 1 ? "s" : ""
                }${conflictResult?.conflict_instance_count
                  ? ` from ${conflictResult.conflict_instance_count} time slot${conflictResult.conflict_instance_count > 1 ? "s" : ""
                  }`
                  : ""
                }.`}
            </Text>

            <View style={styles.conflictListBox}>
              {conflictPreviewItems.length === 0 ? (
                <Text style={styles.conflictEmptyText}>
                  No conflict details found
                </Text>
              ) : (
                conflictPreviewItems.map((item, index) => (
                  <View
                    key={`${item.task_id}-${index}`}
                    style={styles.conflictItem}
                  >
                    <Text style={styles.conflictItemTitle} numberOfLines={1}>
                      {item.title || "Untitled Task"}
                    </Text>

                    <Text style={styles.conflictItemTime}>
                      {formatConflictDate(item.start_time)} -{" "}
                      {formatTime(item.start_time)} to{" "}
                      {formatTime(item.end_time)}
                    </Text>

                    {item.conflict_instance_start_time ? (
                      <Text style={styles.conflictNewTime}>
                        New:{" "}
                        {formatConflictDate(
                          item.conflict_instance_start_time
                        )}{" "}
                        - {formatTime(item.conflict_instance_start_time)} to{" "}
                        {formatTime(item.conflict_instance_end_time)}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}

              {remainingConflictCount > 0 && (
                <Text style={styles.conflictMoreText}>
                  +{remainingConflictCount} more conflicts
                </Text>
              )}
            </View>

            <Pressable
              style={styles.changeTimeButton}
              onPress={handleChangeTimeFromConflict}
            >
              <Text style={styles.changeTimeText}>Change Time</Text>
            </Pressable>

            <Pressable
              style={[
                styles.saveAnywayButton,
                isSaving && styles.saveButtonDisabled,
              ]}
              onPress={handleSaveAnyway}
              disabled={isSaving}
            >
              <Text style={styles.saveAnywayText}>
                {isSaving ? "Saving..." : "Save Anyway"}
              </Text>
            </Pressable>

            <Pressable
              style={styles.cancelConflictButton}
              onPress={handleCancelConflict}
            >
              <Text style={styles.cancelConflictText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
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
  content: {
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 40,
  },
  topNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  navIconButton: {
    minWidth: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  backIconText: {
    fontSize: 24,
    color: COLORS.text,
    fontWeight: "900",
  },
  navTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.text,
  },
  doneButton: {
    minWidth: 58,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  doneButtonText: {
    color: COLORS.textLight,
    fontSize: 14,
    fontWeight: "900",
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    marginBottom: 18,
    paddingHorizontal: 18,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  titleInput: {
    fontSize: 28,
    paddingVertical: 18,
    color: COLORS.text,
  },
  detailInput: {
    fontSize: 20,
    minHeight: 90,
    paddingVertical: 18,
    color: COLORS.text,
  },
  rescheduleTitle: {
    fontSize: 26,
    paddingVertical: 18,
    color: COLORS.text,
    fontWeight: "900",
  },
  rescheduleDetail: {
    fontSize: 16,
    paddingVertical: 14,
    color: COLORS.textMuted,
    lineHeight: 22,
  },
  line: {
    height: 1,
    backgroundColor: COLORS.divider || COLORS.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    gap: 8,
  },
  label: {
    fontSize: 20,
    flex: 1,
    color: COLORS.text,
    fontWeight: "700",
  },
  pickerBox: {
    backgroundColor: COLORS.cardSoft,
    borderRadius: 14,
    padding: 10,
    width: 145,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  timeBox: {
    backgroundColor: COLORS.cardSoft,
    borderRadius: 14,
    padding: 10,
    width: 90,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  deadlineBox: {
    backgroundColor: COLORS.cardSoft,
    borderRadius: 14,
    padding: 10,
    width: 190,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pickerText: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    paddingVertical: 14,
    color: COLORS.text,
  },
  subSectionTitle: {
    fontSize: 15,
    color: COLORS.textMuted,
    fontWeight: "800",
    marginBottom: 10,
  },
  priorityContainer: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 16,
  },
  priorityButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
  priorityButtonActive: {
    borderWidth: 2,
    transform: [{ scale: 1.02 }],
  },
  priorityLowActive: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  priorityMediumActive: {
    backgroundColor: COLORS.warning,
    borderColor: COLORS.warning,
  },
  priorityHighActive: {
    backgroundColor: COLORS.danger,
    borderColor: COLORS.danger,
  },
  priorityText: {
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },
  priorityDescription: {
    marginTop: 4,
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: "center",
    fontWeight: "700",
  },
  priorityDescriptionActive: {
    color: COLORS.textLight,
  },
  durationContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 14,
  },
  durationButton: {
    backgroundColor: COLORS.cardSoft,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  durationButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  durationText: {
    color: COLORS.text,
    fontWeight: "800",
  },
  durationTextActive: {
    color: COLORS.textLight,
  },
  repeatNoticeText: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 18,
    paddingBottom: 12,
    fontWeight: "700",
  },
  repeatContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingBottom: 16,
  },
  repeatButton: {
    backgroundColor: COLORS.cardSoft,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  repeatButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  repeatText: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
  },
  repeatTextActive: {
    color: COLORS.textLight,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 10,
  },
  smallLabel: {
    fontSize: 17,
    color: COLORS.text,
  },
  numberInput: {
    backgroundColor: COLORS.cardSoft,
    width: 70,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 17,
    textAlign: "center",
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  customDayContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 14,
  },
  dayButton: {
    backgroundColor: COLORS.cardSoft,
    minWidth: 48,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dayButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dayButtonText: {
    color: COLORS.text,
    fontWeight: "700",
  },
  dayButtonTextActive: {
    color: COLORS.textLight,
  },
  weekdayContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 14,
  },
  weekdayButton: {
    backgroundColor: COLORS.cardSoft,
    minWidth: 54,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  weekdayButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  weekdayText: {
    color: COLORS.text,
    fontWeight: "800",
  },
  weekdayTextActive: {
    color: COLORS.textLight,
  },
  helpText: {
    fontSize: 14,
    color: COLORS.textMuted,
    paddingBottom: 14,
    lineHeight: 20,
  },
  infoCard: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.primary,
    padding: 16,
    marginBottom: 18,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.primary,
    marginBottom: 6,
  },
  infoText: {
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 20,
    fontWeight: "700",
  },
  saveButton: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 14,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveText: {
    color: COLORS.textLight,
    fontSize: 18,
    fontWeight: "bold",
  },
  cancelButton: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 40,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelText: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "bold",
  },
  conflictOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay || "rgba(0, 0, 0, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  editScopeModalBox: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  editScopeModalTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: COLORS.text,
    marginBottom: 8,
  },
  editScopeModalMessage: {
    fontSize: 15,
    color: COLORS.textMuted,
    lineHeight: 22,
    marginBottom: 16,
    fontWeight: "700",
  },
  editScopeModalPrimaryButton: {
    backgroundColor: COLORS.cardSoft,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  editScopeModalPrimaryText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "900",
  },
  editScopeModalDangerButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  editScopeModalDangerText: {
    color: COLORS.textLight,
    fontSize: 16,
    fontWeight: "900",
  },
  editScopeModalCancelButton: {
    backgroundColor: COLORS.cardSoft,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  editScopeModalCancelText: {
    color: COLORS.textMuted,
    fontSize: 16,
    fontWeight: "900",
  },
  conflictModalBox: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "86%",
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  conflictModalTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 8,
  },
  conflictModalMessage: {
    fontSize: 16,
    color: COLORS.textMuted,
    lineHeight: 22,
    marginBottom: 14,
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
  },
  conflictItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  conflictItemTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
  },
  conflictItemTime: {
    marginTop: 3,
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  conflictNewTime: {
    marginTop: 3,
    color: COLORS.textMuted,
    fontSize: 12,
  },
  conflictMoreText: {
    marginTop: 8,
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  changeTimeButton: {
    backgroundColor: COLORS.cardSoft,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  changeTimeText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
  saveAnywayButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  saveAnywayText: {
    color: COLORS.textLight,
    fontSize: 16,
    fontWeight: "700",
  },
  cancelConflictButton: {
    backgroundColor: COLORS.cardSoft,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  cancelConflictText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
});
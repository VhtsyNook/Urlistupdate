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
import { addTask } from "../src/services/taskService";
import {
  RECURRENCE_TYPES,
  WEEKDAY_OPTIONS,
} from "../src/utils/recurrence";

export default function AddTask() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const from = params?.from ? String(params.from) : "";
  const startTime = params?.startTime;
  const endTime = params?.endTime;
  const selectedDateParam = params?.selectedDate;

  const isFromFreeTime = from === "free-time";
  const isFromปฏิทิน = from === "calendar";

  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const [title, setชื่องาน] = useState("");
  const [detail, setรายละเอียด] = useState("");
  const [academicTaskType, setAcademicTaskType] = useState("normal");

  const [startDateTime, setเริ่มDateTime] = useState(new Date());
  const [endDateTime, setสิ้นสุดDateTime] = useState(
    new Date(Date.now() + 60 * 60 * 1000)
  );

  const [repeatType, setการทำซ้ำType] = useState(RECURRENCE_TYPES.NONE);
  const [customDays, setCustomDays] = useState(1);
  const [selectedWeekdays, setSelectedWeekdays] = useState([
    new Date().getDay(),
  ]);
  const [weekInterval, setWeekInterval] = useState(1);
  const [monthDay, setMonthDay] = useState(new Date().getDate());
  const [monthInterval, setMonthInterval] = useState(1);

  const [priority, setความสำคัญ] = useState("ปานกลาง");
  const [deadlineDate, setกำหนดส่งDate] = useState(
    new Date(Date.now() + 24 * 60 * 60 * 1000)
  );
  const [estimatedDuration, setEstimatedDuration] = useState(60);

  const [planningEnabled, setPlanningEnabled] = useState(false);
  const [totalPlannedMinutes, setTotalPlannedMinutes] = useState(600);
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(60);
  const [planBeforeกำหนดส่งDays, setPlanBeforeกำหนดส่งDays] = useState(1);
  const [autoSchedule, setAutoSchedule] = useState(true);
  const [addReviewSession, setAddReviewSession] = useState(true);
  const [preferredStudyWindow, setPreferredStudyWindow] = useState("evening");

  const [isSaving, setIsSaving] = useState(false);

  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [timePickerTarget, setTimePickerTarget] = useState(null);

  const [conflictModalVisible, setConflictModalVisible] = useState(false);
  const [conflictResult, setConflictResult] = useState(null);
  const [pendingTaskPayload, setPendingTaskPayload] = useState(null);

  const repeatOptions = [
    { label: "ไม่ทำซ้ำ", value: RECURRENCE_TYPES.NONE },
    { label: "ทุกวัน", value: RECURRENCE_TYPES.DAILY },
    { label: "ทุก N วัน", value: RECURRENCE_TYPES.CUSTOM_DAYS },
    { label: "ทุกสัปดาห์", value: RECURRENCE_TYPES.WEEKLY },
    { label: "ทุกเดือน", value: RECURRENCE_TYPES.MONTHLY },
  ];

  const academicTaskTypeOptions = [
    {
      label: "งานทั่วไป",
      value: "normal",
      description: "",
    },
    {
      label: "งานสอบ",
      value: "exam",
      description: "งานสอบ or important deadline",
    },
    {
      label: "แผนอ่านหนังสือ",
      value: "study_plan",
      description: "",
    },
  ];


  const customDayOptions = Array.from({ length: 31 }, (_, index) => index + 1);

  const weekIntervalOptions = [1, 2, 3, 4, 5, 6, 8, 12];

  const monthDayOptions = Array.from({ length: 31 }, (_, index) => index + 1);

  const monthIntervalOptions = [1, 2, 3, 4, 6, 12];

  const priorityOptions = [
    {
      label: "ต่ำ",
      value: "ต่ำ",
      description: "Not urgent",
    },
    {
      label: "ปานกลาง",
      value: "ปานกลาง",
      description: "งานทั่วไป task",
    },
    {
      label: "สูง",
      value: "สูง",
      description: "Important",
    },
  ];

  const durationOptions = [15, 30, 45, 60, 90, 120, 180, 240];

  const totalPlanOptions = [120, 180, 240, 300, 360, 480, 600, 720, 900, 1200];
  const sessionOptions = [30, 45, 60, 90, 120];
  const beforeกำหนดส่งOptions = [0, 1, 2, 3, 5, 7];

  const studyWindowOptions = [
    {
      label: "ช่วงเช้า",
      value: "morning",
      description: "09:00 - 12:00",
      startHour: 9,
      startMinute: 0,
      endHour: 12,
      endMinute: 0,
    },
    {
      label: "ช่วงบ่าย",
      value: "afternoon",
      description: "13:00 - 17:00",
      startHour: 13,
      startMinute: 0,
      endHour: 17,
      endMinute: 0,
    },
    {
      label: "ช่วงเย็น",
      value: "evening",
      description: "19:00 - 22:00",
      startHour: 19,
      startMinute: 0,
      endHour: 22,
      endMinute: 0,
    },
    {
      label: "ทั้งวัน",
      value: "all_day",
      description: "08:00 - 22:00",
      startHour: 8,
      startMinute: 0,
      endHour: 22,
      endMinute: 0,
    },
  ];

  const getPreferredStudyWindowConfig = () => {
    return (
      studyWindowOptions.find(
        (option) => option.value === preferredStudyWindow
      ) || studyWindowOptions[2]
    );
  };

  const getReturnPath = () => {
    if (isFromปฏิทิน) return "/calentask";
    if (from === "tasks" || isFromFreeTime) return "/tasks";
    return "/";
  };

  const handleBack = () => {
    router.replace(getReturnPath());
  };

  const handleAfterบันทึก = () => {
    router.replace(getReturnPath());
  };

  const addMinutes = (date, minutes) => {
    const result = new Date(date);
    result.setMinutes(result.getMinutes() + Number(minutes || 0));
    return result;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    if (!user) {
      router.replace("/login");
    }
  }, [isAuthReady, user, router]);

  useEffect(() => {
    if (!isFromFreeTime) return;

    const parsedเริ่มTime = startTime ? new Date(String(startTime)) : null;
    const parsedสิ้นสุดTime = endTime ? new Date(String(endTime)) : null;

    const isValidเริ่ม =
      parsedเริ่มTime instanceof Date &&
      !Number.isNaN(parsedเริ่มTime.getTime());
    const isValidสิ้นสุด =
      parsedสิ้นสุดTime instanceof Date &&
      !Number.isNaN(parsedสิ้นสุดTime.getTime());

    if (!isValidเริ่ม || !isValidสิ้นสุด || parsedสิ้นสุดTime <= parsedเริ่มTime) {
      return;
    }

    setเริ่มDateTime(parsedเริ่มTime);
    setสิ้นสุดDateTime(parsedสิ้นสุดTime);
    setกำหนดส่งDate(parsedสิ้นสุดTime);

    const durationMinutes = Math.max(
      15,
      Math.round(
        (parsedสิ้นสุดTime.getTime() - parsedเริ่มTime.getTime()) / (1000 * 60)
      )
    );

    setEstimatedDuration(durationMinutes);
    setSessionDurationMinutes(
      [30, 45, 60, 90, 120].includes(durationMinutes)
        ? durationMinutes
        : 60
    );
  }, [isFromFreeTime, startTime, endTime]);

  useEffect(() => {
    if (!isFromปฏิทิน || !selectedDateParam || isFromFreeTime) return;

    const parsedSelectedDate = new Date(String(selectedDateParam));

    if (
      !(parsedSelectedDate instanceof Date) ||
      Number.isNaN(parsedSelectedDate.getTime())
    ) {
      return;
    }

    const now = new Date();

    const nextเริ่ม = new Date(parsedSelectedDate);
    nextเริ่ม.setHours(now.getHours(), now.getMinutes(), 0, 0);

    const nextสิ้นสุด = new Date(nextเริ่ม);
    nextสิ้นสุด.setHours(nextสิ้นสุด.getHours() + 1);

    const nextกำหนดส่ง = new Date(parsedSelectedDate);
    nextกำหนดส่ง.setHours(23, 59, 59, 999);

    setเริ่มDateTime(nextเริ่ม);
    setสิ้นสุดDateTime(nextสิ้นสุด);
    setกำหนดส่งDate(nextกำหนดส่ง);
  }, [isFromปฏิทิน, selectedDateParam, isFromFreeTime]);

  const ensureLoggedIn = () => {
    if (!auth.currentUser) {
      Alert.alert("Login Required", "Please log in before using this feature.");
      router.replace("/login");
      return false;
    }

    return true;
  };

  const normalizeDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === "function") return value.toDate();
    return new Date(value);
  };

  const isValidDate = (value) => {
    return value instanceof Date && !Number.isNaN(value.getTime());
  };

  const buildDateWithTime = (dateSource, timeSource) => {
    const baseDate = normalizeDate(dateSource) || new Date();
    const baseTime = normalizeDate(timeSource) || new Date();

    const result = new Date(baseDate);
    result.setHours(baseTime.getHours(), baseTime.getMinutes(), 0, 0);

    return result;
  };

  const normalizeสิ้นสุดDateForเริ่ม = (startValue, endValue) => {
    const start = normalizeDate(startValue);
    const end = normalizeDate(endValue);

    if (!isValidDate(start) || !isValidDate(end)) {
      return addMinutes(start || new Date(), 60);
    }

    const normalizedสิ้นสุด = buildDateWithTime(start, end);

    if (normalizedสิ้นสุด <= start) {
      normalizedสิ้นสุด.setDate(normalizedสิ้นสุด.getDate() + 1);
    }

    return normalizedสิ้นสุด;
  };

  const getSafeTaskTimeRange = () => {
    const safeเริ่มTime = normalizeDate(startDateTime) || new Date();
    const safeสิ้นสุดTime = normalizeสิ้นสุดDateForเริ่ม(safeเริ่มTime, endDateTime);

    return {
      safeเริ่มTime,
      safeสิ้นสุดTime,
    };
  };

  const formatDate = (date) => {
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const pad2 = (value) => String(value).padเริ่ม(2, "0");

  const formatTime = (value) => {
    const date = normalizeDate(value);

    if (!date) return "";

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

    if (!date) return "-";

    return date.toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
    });
  };

  const getPickerValue = (target) => {
    if (target === "start") return startDateTime;
    if (target === "end") return endDateTime;
    if (target === "deadline") return deadlineDate;

    return new Date();
  };

  const handleDatePickerValueChange = (target, selectedValue) => {
    if (!selectedValue || !target) return;

    if (target === "deadline") {
      const newกำหนดส่ง = new Date(deadlineDate);

      newกำหนดส่ง.setFullYear(selectedValue.getFullYear());
      newกำหนดส่ง.setMonth(selectedValue.getMonth());
      newกำหนดส่ง.setDate(selectedValue.getDate());
      newกำหนดส่ง.setHours(23, 59, 59, 999);

      setกำหนดส่งDate(newกำหนดส่ง);
      return;
    }

    if (target === "start") {
      const newเริ่มDateTime = buildDateWithTime(selectedValue, startDateTime);
      const newสิ้นสุดDateTime = normalizeสิ้นสุดDateForเริ่ม(
        newเริ่มDateTime,
        endDateTime
      );

      setเริ่มDateTime(newเริ่มDateTime);
      setสิ้นสุดDateTime(newสิ้นสุดDateTime);

      return;
    }

    if (target === "end") {
      const newสิ้นสุดDateTime = new Date(endDateTime);

      newสิ้นสุดDateTime.setFullYear(selectedValue.getFullYear());
      newสิ้นสุดDateTime.setMonth(selectedValue.getMonth());
      newสิ้นสุดDateTime.setDate(selectedValue.getDate());

      if (newสิ้นสุดDateTime <= startDateTime) {
        Alert.alert("Error", "สิ้นสุด date and time must be later than start time.");
        return;
      }

      setสิ้นสุดDateTime(newสิ้นสุดDateTime);
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
      const selectedเริ่ม = new Date(startDateTime);
      selectedเริ่ม.setHours(hour, minute, 0, 0);

      const normalizedสิ้นสุด = normalizeสิ้นสุดDateForเริ่ม(
        selectedเริ่ม,
        endDateTime
      );

      setเริ่มDateTime(selectedเริ่ม);
      setสิ้นสุดDateTime(normalizedสิ้นสุด);
    }

    if (timePickerTarget === "end") {
      const selectedสิ้นสุด = buildDateWithTime(startDateTime, endDateTime);
      selectedสิ้นสุด.setHours(hour, minute, 0, 0);

      if (selectedสิ้นสุด <= startDateTime) {
        selectedสิ้นสุด.setDate(selectedสิ้นสุด.getDate() + 1);
      }

      setสิ้นสุดDateTime(selectedสิ้นสุด);
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

  const handleAcademicTaskTypeChange = (nextType) => {
    setAcademicTaskType(nextType);

    if (nextType === "normal") {
      return;
    }

    if (nextType === "exam") {
      setPlanningEnabled(false);
      setการทำซ้ำType(RECURRENCE_TYPES.NONE);
      setความสำคัญ("สูง");
      setกำหนดส่งDate(endDateTime);
      return;
    }

    if (nextType === "study_plan") {
      setPlanningEnabled(true);
      setการทำซ้ำType(RECURRENCE_TYPES.NONE);
      setความสำคัญ("สูง");
      setกำหนดส่งDate(endDateTime);
      return;
    }
  };

  const handlePlanningToggle = () => {
    setPlanningEnabled((prev) => {
      const nextValue = !prev;

      if (nextValue) {
        setAcademicTaskType("study_plan");
        setการทำซ้ำType(RECURRENCE_TYPES.NONE);
        setCustomDays(1);
        setWeekInterval(1);
        setMonthDay(startDateTime.getDate());
        setMonthInterval(1);
      } else if (academicTaskType === "study_plan") {
        setAcademicTaskType("normal");
      }

      return nextValue;
    });
  };

  const getTaskTypeForPayload = () => {
    if (planningEnabled) return "planned_task";
    if (academicTaskType === "exam") return "exam";
    return "fixed";
  };

  const handleการทำซ้ำTypeChange = (nextType) => {
    if (planningEnabled && nextType !== RECURRENCE_TYPES.NONE) {
      Alert.alert(
        "โหมดวางแผน is enabled",
        "Planning tasks cannot be repeated. Please turn off โหมดวางแผน first."
      );
      return;
    }

    setการทำซ้ำType(nextType);

    if (nextType === RECURRENCE_TYPES.WEEKLY && selectedWeekdays.length === 0) {
      setSelectedWeekdays([startDateTime.getDay()]);
    }

    if (nextType === RECURRENCE_TYPES.MONTHLY) {
      setMonthDay(startDateTime.getDate());
    }
  };

  const buildTaskPayload = () => {
    const { safeเริ่มTime, safeสิ้นสุดTime } = getSafeTaskTimeRange();
    const studyWindowConfig = getPreferredStudyWindowConfig();

    return {
      title: title.trim(),
      detail: detail.trim(),

      start_time: safeเริ่มTime,
      end_time: safeสิ้นสุดTime,

      task_type: getTaskTypeForPayload(),
      academic_task_type: academicTaskType,

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

      priority: priority,
      deadline: deadlineDate,
      estimated_duration_minutes: Number(estimatedDuration),

      planning_enabled: planningEnabled,
      total_planned_minutes: planningEnabled ? Number(totalPlannedMinutes) : null,
      session_duration_minutes: planningEnabled
        ? Number(sessionDurationMinutes)
        : null,
      plan_before_deadline_days: planningEnabled
        ? Number(planBeforeกำหนดส่งDays)
        : null,
      auto_schedule: planningEnabled ? autoSchedule : false,
      add_review_session: planningEnabled ? addReviewSession : false,
      preferred_study_window: planningEnabled ? preferredStudyWindow : null,
      preferred_study_start_hour: planningEnabled
        ? studyWindowConfig.startHour
        : null,
      preferred_study_start_minute: planningEnabled
        ? studyWindowConfig.startMinute
        : null,
      preferred_study_end_hour: planningEnabled ? studyWindowConfig.endHour : null,
      preferred_study_end_minute: planningEnabled
        ? studyWindowConfig.endMinute
        : null,
      is_generated_session: false,
      parent_task_id: null,

      created_at: new Date(),
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

  const handleยกเลิกConflict = () => {
    resetConflictState();
  };

  const handleบันทึกAnyway = async () => {
    if (!ensureLoggedIn()) return;
    if (!pendingTaskPayload || isSaving) return;

    try {
      setIsSaving(true);

      const result = await addTask(pendingTaskPayload, {
        saveAnyway: true,
      });

      if (result?.success === true) {
        resetConflictState();
        handleAfterบันทึก();
        return;
      }

      Alert.alert("Error", "Unable to save this task. Please try again.");
    } catch (error) {
      console.error("บันทึก anyway error:", error);

      if (error?.message === "AUTH_REQUIRED") {
        router.replace("/login");
        return;
      }

      Alert.alert("Error", "Unable to save this task. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleบันทึก = async () => {
    if (!ensureLoggedIn()) return;
    if (isSaving) return;

    if (!title.trim()) {
      Alert.alert("Error", "Please enter a title.");
      return;
    }

    const { safeเริ่มTime, safeสิ้นสุดTime } = getSafeTaskTimeRange();

    if (safeสิ้นสุดTime <= safeเริ่มTime) {
      Alert.alert("Error", "สิ้นสุด time must be later than start time.");
      return;
    }

    if (planningEnabled && repeatType !== RECURRENCE_TYPES.NONE) {
      Alert.alert(
        "Error",
        "โหมดวางแผน cannot be used with การทำซ้ำ. Please choose ไม่ทำซ้ำ."
      );
      return;
    }

    if (academicTaskType === "study_plan" && planningEnabled !== true) {
      Alert.alert(
        "Error",
        "แผนอ่านหนังสือ requires โหมดวางแผน."
      );
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

    if (planningEnabled) {
      if (!totalPlannedMinutes || Number(totalPlannedMinutes) <= 0) {
        Alert.alert("Error", "Please select total planned duration.");
        return;
      }

      if (!sessionDurationMinutes || Number(sessionDurationMinutes) <= 0) {
        Alert.alert("Error", "Please select session duration.");
        return;
      }

      if (Number(sessionDurationMinutes) > Number(totalPlannedMinutes)) {
        Alert.alert(
          "Error",
          "Session duration cannot be longer than total planned duration."
        );
        return;
      }
    }

    const taskPayload = buildTaskPayload();

    try {
      setIsSaving(true);

      const result = await addTask(taskPayload);

      if (result?.has_conflict === true && result?.success === false) {
        setPendingTaskPayload(taskPayload);
        setConflictResult(result);
        setConflictModalVisible(true);
        return;
      }

      if (result?.success === true || result === undefined) {
        handleAfterบันทึก();
        return;
      }

      Alert.alert("Error", "Unable to save this task. Please try again.");
    } catch (error) {
      console.error("Add task error:", error);

      if (error?.message === "AUTH_REQUIRED") {
        router.replace("/login");
        return;
      }

      Alert.alert("Error", "Unable to save this task. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleยกเลิก = () => {
    handleBack();
  };

  const getความสำคัญChipStyle = (value) => {
    if (value === "สูง") {
      return {
        backgroundColor: "#FEE2E2",
        borderColor: "#FCA5A5",
      };
    }

    if (value === "ปานกลาง") {
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

  const getความสำคัญTextColor = (value) => {
    if (value === "สูง") return COLORS.danger;
    if (value === "ปานกลาง") return COLORS.warning;
    return COLORS.success;
  };

  const conflictItems = conflictResult?.conflict_items || [];
  const conflictPreviewItems = conflictItems.slice(0, 5);
  const remainingConflictCount =
    conflictItems.length > 5 ? conflictItems.length - 5 : 0;

  const plannedSessionCount = Math.ceil(
    Number(totalPlannedMinutes) / Number(sessionDurationMinutes || 1)
  );

  if (!isAuthReady) {
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
    <View style={styles.screen}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topNav}>
          <Pressable style={styles.navIconButton} onPress={handleBack}>
            <Text style={styles.backIconText}>‹</Text>
          </Pressable>

          <Text style={styles.navชื่องาน}>New Task</Text>

          <Pressable
            style={[styles.doneButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleบันทึก}
            disabled={isSaving}
          >
            <Text style={styles.doneButtonText}>✓</Text>
          </Pressable>
        </View>

        {isFromFreeTime ? (
          <View style={styles.freeTimeNoticeCard}>
            <View style={styles.freeTimeNoticeIcon}>
              <Text style={styles.freeTimeNoticeIconText}>✨</Text>
            </View>

            <View style={styles.freeTimeNoticeTextBox}>
              <Text style={styles.freeTimeNoticeชื่องาน}>
                Suggested Free Time Applied
              </Text>
              <Text style={styles.freeTimeNoticeText}>
                เริ่ม and end time were filled from the selected free slot.
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.card}>
          <TextInput
            style={styles.titleInput}
            placeholder="ชื่องาน"
            placeholderTextColor={COLORS.textMuted}
            value={title}
            onChangeText={setชื่องาน}
            numberOfLines={1}
          />

          <View style={styles.line} />

          <TextInput
            style={styles.detailInput}
            placeholder="รายละเอียด / Note"
            placeholderTextColor={COLORS.textMuted}
            value={detail}
            onChangeText={setรายละเอียด}
            multiline
            textAlignVertical="top"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>ประเภทงาน</Text>

          <View style={styles.repeatContainer}>
            {academicTaskTypeOptions.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.repeatButton,
                  academicTaskType === option.value && styles.repeatButtonActive,
                ]}
                onPress={() => handleAcademicTaskTypeChange(option.value)}
              >
                <Text
                  style={[
                    styles.repeatText,
                    academicTaskType === option.value && styles.repeatTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.helpText}>
            {
              academicTaskTypeOptions.find(
                (option) => option.value === academicTaskType
              )?.description
            }
          </Text>

          {academicTaskType === "exam" ? (
            <Text style={styles.helpText}>
              งานสอบ type is used as a fixed event and can be used as a deadline for study planning.
            </Text>
          ) : null}

          {academicTaskType === "study_plan" ? (
            <Text style={styles.helpText}>
              แผนอ่านหนังสือ will generate smaller study sessions before the deadline.
            </Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>เริ่ม</Text>

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
            <Text style={styles.label}>สิ้นสุด</Text>

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

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Time Management</Text>

          <Text style={styles.subSectionTitle}>ความสำคัญ</Text>

          <View style={styles.priorityContainer}>
            {priorityOptions.map((option) => {
              const active = priority === option.value;

              return (
                <Pressable
                  key={option.value}
                  style={[
                    styles.priorityButton,
                    getความสำคัญChipStyle(option.value),
                    active && styles.priorityButtonActive,
                    active &&
                    option.value === "ต่ำ" &&
                    styles.priorityต่ำActive,
                    active &&
                    option.value === "ปานกลาง" &&
                    styles.priorityปานกลางActive,
                    active &&
                    option.value === "สูง" &&
                    styles.priorityสูงActive,
                  ]}
                  onPress={() => setความสำคัญ(option.value)}
                >
                  <Text
                    style={[
                      styles.priorityText,
                      {
                        color: active
                          ? COLORS.textLight
                          : getความสำคัญTextColor(option.value),
                      },
                    ]}
                  >
                    {active ? "✓ " : ""}
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
            <Text style={styles.label}>กำหนดส่ง</Text>

            <Pressable
              style={styles.deadlineBox}
              onPress={() => openPicker("deadline", "date")}
            >
              <Text style={styles.pickerText}>{formatDate(deadlineDate)}</Text>
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
                  estimatedDuration === duration && styles.durationButtonActive,
                ]}
                onPress={() => setEstimatedDuration(duration)}
              >
                <Text
                  style={[
                    styles.durationText,
                    estimatedDuration === duration && styles.durationTextActive,
                  ]}
                >
                  {formatDuration(duration)}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.helpText}>
            ความสำคัญ, deadline, and estimated duration will be used for smart
            free-time task suggestions.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.planningHeader}>
            <View style={styles.planningชื่องานBox}>
              <Text style={styles.sectionTitle}>โหมดวางแผน</Text>
              <Text style={styles.helpTextNoPadding}>
                Break a large task into smaller study or work sessions.
              </Text>
            </View>

            <Pressable
              style={[
                styles.toggleButton,
                planningEnabled && styles.toggleButtonActive,
              ]}
              onPress={handlePlanningToggle}
            >
              <View
                style={[
                  styles.toggleKnob,
                  planningEnabled && styles.toggleKnobActive,
                ]}
              />
            </Pressable>
          </View>

          {planningEnabled && (
            <>
              <View style={styles.line} />

              <Text style={styles.subSectionTitle}>เวลาที่ต้องใช้ทั้งหมด</Text>

              <View style={styles.durationContainer}>
                {totalPlanOptions.map((duration) => (
                  <Pressable
                    key={duration}
                    style={[
                      styles.durationButton,
                      totalPlannedMinutes === duration &&
                      styles.durationButtonActive,
                    ]}
                    onPress={() => setTotalPlannedMinutes(duration)}
                  >
                    <Text
                      style={[
                        styles.durationText,
                        totalPlannedMinutes === duration &&
                        styles.durationTextActive,
                      ]}
                    >
                      {formatDuration(duration)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.subSectionTitle}>ระยะเวลาต่อครั้ง</Text>

              <View style={styles.durationContainer}>
                {sessionOptions.map((duration) => (
                  <Pressable
                    key={duration}
                    style={[
                      styles.durationButton,
                      sessionDurationMinutes === duration &&
                      styles.durationButtonActive,
                    ]}
                    onPress={() => {
                      setSessionDurationMinutes(duration);
                      setEstimatedDuration(duration);
                    }}
                  >
                    <Text
                      style={[
                        styles.durationText,
                        sessionDurationMinutes === duration &&
                        styles.durationTextActive,
                      ]}
                    >
                      {formatDuration(duration)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.subSectionTitle}>Plan Before กำหนดส่ง</Text>

              <View style={styles.durationContainer}>
                {beforeกำหนดส่งOptions.map((day) => (
                  <Pressable
                    key={day}
                    style={[
                      styles.durationButton,
                      planBeforeกำหนดส่งDays === day &&
                      styles.durationButtonActive,
                    ]}
                    onPress={() => setPlanBeforeกำหนดส่งDays(day)}
                  >
                    <Text
                      style={[
                        styles.durationText,
                        planBeforeกำหนดส่งDays === day &&
                        styles.durationTextActive,
                      ]}
                    >
                      {day === 0
                        ? "Same day"
                        : `${day} day${day > 1 ? "s" : ""}`}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.line} />

              <Pressable
                style={styles.optionRow}
                onPress={() => setAutoSchedule((prev) => !prev)}
              >
                <View>
                  <Text style={styles.optionTitle}>
                    ให้แอปจัดรอบอ่าน
                  </Text>
                  <Text style={styles.optionSubtitle}>
                    The system will use available free slots for generated
                    sessions.
                  </Text>
                </View>

                <Text style={styles.optionStatus}>
                  {autoSchedule ? "On" : "Off"}
                </Text>
              </Pressable>

              <View style={styles.line} />

                            <Text style={styles.subSectionTitle}>ช่วงเวลาที่สะดวกอ่าน</Text>

              <View style={styles.durationContainer}>
                {studyWindowOptions.map((option) => (
                  <Pressable
                    key={option.value}
                    style={[
                      styles.durationButton,
                      preferredStudyWindow === option.value &&
                        styles.durationButtonActive,
                    ]}
                    onPress={() => setPreferredStudyWindow(option.value)}
                  >
                    <Text
                      style={[
                        styles.durationText,
                        preferredStudyWindow === option.value &&
                          styles.durationTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>

                    <Text
                      style={[
                        styles.priorityDescription,
                        preferredStudyWindow === option.value &&
                          styles.priorityDescriptionActive,
                      ]}
                    >
                      {option.description}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.helpText}>
                
              </Text>

              <View style={styles.line} />

<Pressable
                style={styles.optionRow}
                onPress={() => setAddReviewSession((prev) => !prev)}
              >
                <View>
                  <Text style={styles.optionTitle}>Add review session</Text>
                  <Text style={styles.optionSubtitle}>
                    Add one review task before the deadline.
                  </Text>
                </View>

                <Text style={styles.optionStatus}>
                  {addReviewSession ? "On" : "Off"}
                </Text>
              </Pressable>

              <View style={styles.planningSummaryBox}>
                <Text style={styles.planningSummaryชื่องาน}>Planning Summary</Text>

                <Text style={styles.planningSummaryText}>
                  The task will be divided into approximately{" "}
                  <Text style={styles.planningSummaryStrong}>
                    {plannedSessionCount} sessions
                  </Text>{" "}
                  of{" "}
                  <Text style={styles.planningSummaryStrong}>
                    {formatDuration(sessionDurationMinutes)}
                  </Text>{" "}
                  each.
                </Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>การทำซ้ำ</Text>

          <View style={styles.repeatContainer}>
            {repeatOptions.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.repeatButton,
                  repeatType === option.value && styles.repeatButtonActive,
                ]}
                onPress={() => handleการทำซ้ำTypeChange(option.value)}
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
            <Text style={styles.helpText}>This task will be created only once.</Text>
          )}

          {repeatType === RECURRENCE_TYPES.DAILY && (
            <Text style={styles.helpText}>
              This task will be created every day at the same time.
            </Text>
          )}

          {repeatType === RECURRENCE_TYPES.CUSTOM_DAYS && (
            <>
              <View style={styles.line} />

              <View style={styles.inputRow}>
                <Text style={styles.smallLabel}>การทำซ้ำ every</Text>

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
                      Number(customDays) === day && styles.dayButtonActive,
                    ]}
                    onPress={() => setCustomDays(day)}
                  >
                    <Text
                      style={[
                        styles.dayButtonText,
                        Number(customDays) === day && styles.dayButtonTextActive,
                      ]}
                    >
                      {day}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.helpText}>
                For example, 3 means the task will be created every 3 days.
              </Text>
            </>
          )}

          {repeatType === RECURRENCE_TYPES.WEEKLY && (
            <>
              <View style={styles.line} />

              <View style={styles.inputRow}>
                <Text style={styles.smallLabel}>การทำซ้ำ every</Text>

                <TextInput
                  style={styles.numberInput}
                  value={String(weekInterval)}
                  onChangeText={(value) =>
                    handlePositiveNumberChange(value, setWeekInterval, 12)
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
                      Number(weekInterval) === week && styles.dayButtonActive,
                    ]}
                    onPress={() => setWeekInterval(week)}
                  >
                    <Text
                      style={[
                        styles.dayButtonText,
                        Number(weekInterval) === week && styles.dayButtonTextActive,
                      ]}
                    >
                      {week}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.subSectionTitle}>การทำซ้ำ on</Text>

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
                <Text style={styles.smallLabel}>การทำซ้ำ every</Text>

                <TextInput
                  style={styles.numberInput}
                  value={String(monthInterval)}
                  onChangeText={(value) =>
                    handlePositiveNumberChange(value, setMonthInterval, 12)
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
                      Number(monthInterval) === month && styles.dayButtonActive,
                    ]}
                    onPress={() => setMonthInterval(month)}
                  >
                    <Text
                      style={[
                        styles.dayButtonText,
                        Number(monthInterval) === month && styles.dayButtonTextActive,
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
                        Number(monthDay) === day && styles.dayButtonTextActive,
                      ]}
                    >
                      {day}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.helpText}>
                This task will repeat every {monthInterval || 1} month(s) on day{" "}
                {monthDay || startDateTime.getDate()}.
              </Text>
            </>
          )}
        </View>

        <Pressable
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleบันทึก}
          disabled={isSaving}
        >
          <Text style={styles.saveText}>
            {isSaving ? "Checking..." : "บันทึก Task"}
          </Text>
        </Pressable>

        <Pressable style={styles.cancelButton} onPress={handleยกเลิก}>
          <Text style={styles.cancelText}>ยกเลิก</Text>
        </Pressable>
      </ScrollView>

      <TimePickerModal
        visible={timePickerVisible}
        title={
          timePickerTarget === "start"
            ? "เลือกเวลาเริ่ม"
            : "เลือกเวลาสิ้นสุด"
        }
        initialDate={getPickerValue(timePickerTarget)}
        onClose={closeTimePicker}
        onConfirm={handleConfirmTime}
      />

      <Modal
        visible={conflictModalVisible}
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
            <Text style={styles.conflictModalชื่องาน}>พบเวลาทับซ้อน</Text>

            <Text style={styles.conflictModalMessage}>
              {`Found ${conflictResult?.conflict_count || 0} conflicting task${(conflictResult?.conflict_count || 0) > 1 ? "s" : ""
                }${conflictResult?.conflict_instance_count
                  ? ` from ${conflictResult.conflict_instance_count
                  } time slot${conflictResult.conflict_instance_count > 1 ? "s" : ""
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
                    <Text style={styles.conflictItemชื่องาน} numberOfLines={1}>
                      {item.title || "Untitled Task"}
                    </Text>

                    <Text style={styles.conflictItemTime}>
                      {formatConflictDate(item.start_time)} ·{" "}
                      {formatTime(item.start_time)} -{" "}
                      {formatTime(item.end_time)}
                    </Text>

                    {item.conflict_instance_start_time ? (
                      <Text style={styles.conflictNewTime}>
                        New:{" "}
                        {formatConflictDate(
                          item.conflict_instance_start_time
                        )}{" "}
                        · {formatTime(item.conflict_instance_start_time)} -{" "}
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
              <Text style={styles.changeTimeText}>เปลี่ยนเวลา</Text>
            </Pressable>

            <Pressable
              style={[
                styles.saveAnywayButton,
                isSaving && styles.saveButtonDisabled,
              ]}
              onPress={handleบันทึกAnyway}
              disabled={isSaving}
            >
              <Text style={styles.saveAnywayText}>
                {isSaving ? "Saving..." : "บันทึก Anyway"}
              </Text>
            </Pressable>

            <Pressable
              style={styles.cancelConflictButton}
              onPress={handleยกเลิกConflict}
            >
              <Text style={styles.cancelConflictText}>ยกเลิก</Text>
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
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  backIconText: {
    fontSize: 44,
    color: COLORS.text,
    fontWeight: "600",
    lineHeight: 44,
  },
  navชื่องาน: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.text,
  },
  doneButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  doneButtonText: {
    color: COLORS.textLight,
    fontSize: 24,
    fontWeight: "900",
  },
  freeTimeNoticeCard: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.primary,
    padding: 14,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  freeTimeNoticeIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
  },
  freeTimeNoticeIconText: {
    fontSize: 20,
  },
  freeTimeNoticeTextBox: {
    flex: 1,
  },
  freeTimeNoticeชื่องาน: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.primary,
  },
  freeTimeNoticeText: {
    marginTop: 3,
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: "700",
    lineHeight: 18,
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
  priorityต่ำActive: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  priorityปานกลางActive: {
    backgroundColor: COLORS.warning,
    borderColor: COLORS.warning,
  },
  priorityสูงActive: {
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
  planningHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  planningชื่องานBox: {
    flex: 1,
  },
  helpTextNoPadding: {
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 20,
    paddingBottom: 14,
  },
  toggleButton: {
    width: 58,
    height: 34,
    borderRadius: 999,
    backgroundColor: COLORS.disabled || "#D1D5DB",
    padding: 4,
    justifyContent: "center",
  },
  toggleButtonActive: {
    backgroundColor: COLORS.primary,
  },
  toggleKnob: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.card,
  },
  toggleKnobActive: {
    alignSelf: "flex-end",
  },
  optionRow: {
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.text,
  },
  optionSubtitle: {
    marginTop: 3,
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 18,
    maxWidth: 240,
  },
  optionStatus: {
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.primary,
  },
  planningSummaryBox: {
    backgroundColor: COLORS.cardSoft,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  planningSummaryชื่องาน: {
    fontSize: 15,
    fontWeight: "900",
    color: COLORS.text,
    marginBottom: 4,
  },
  planningSummaryText: {
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 20,
  },
  planningSummaryStrong: {
    color: COLORS.primary,
    fontWeight: "900",
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
  conflictModalชื่องาน: {
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
  conflictItemชื่องาน: {
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
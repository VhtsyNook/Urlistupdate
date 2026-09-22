import { Ionicons } from "@expo/vector-icons";
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

//import TimePickerModal from "../src/components/TimePickerModal";
import { auth } from "../src/config/firebase";
import { COLORS } from "../src/constants/theme";
import { useLanguage } from "../src/i18n/LanguageContext";
import {
  getTaskById,
  rescheduleTask,
  updateTask,
} from "../src/services/taskService";
import {
  RECURRENCE_TYPES,
  WEEKDAY_OPTIONS,
} from "../src/utils/recurrence";

function SectionCard({ title, icon, open, onToggle, children }) {
  return (
    <View style={styles.sectionCard}>
      <Pressable style={styles.sectionHeader} onPress={onToggle}>
        <View style={styles.sectionHeaderLeft}>
          <View style={styles.sectionIconBox}>
            <Ionicons name={icon} size={18} color={COLORS.primary} />
          </View>

          <Text style={styles.sectionCardTitle}>{title}</Text>
        </View>

        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={COLORS.textMuted}
        />
      </Pressable>

      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}




export default function EditTask() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { language } = useLanguage();

  const isThai = language === "th";
  const locale = isThai ? "th-TH" : "en-US";
  const text = (en, th) => (isThai ? th : en);

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
  const [isAllDay, setIsAllDay] = useState(false);

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
  const [hasDeadline, setHasDeadline] = useState(true);
  const [estimatedDuration, setEstimatedDuration] = useState(60);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  //const [timePickerVisible, setTimePickerVisible] = useState(false);
  //const [timePickerTarget, setTimePickerTarget] = useState(null);

  const [taskMode, setTaskMode] = useState("todo");

  const [basicSectionOpen, setBasicSectionOpen] = useState(true);
  const [scheduleSectionOpen, setScheduleSectionOpen] = useState(true);
  const [timeSectionOpen, setTimeSectionOpen] = useState(true);

  const [repeatDropdownOpen, setRepeatDropdownOpen] = useState(false);
  const [durationDropdownOpen, setDurationDropdownOpen] = useState(false);

  const [conflictModalVisible, setConflictModalVisible] = useState(false);
  const [conflictResult, setConflictResult] = useState(null);
  const [pendingTaskPayload, setPendingTaskPayload] = useState(null);

  const [editScopeModalVisible, setEditScopeModalVisible] = useState(false);
  const [pendingEditPayload, setPendingEditPayload] = useState(null);

  const repeatOptions = [
    {
      label: text("Does not repeat", "ไม่ทำซ้ำ"),
      value: RECURRENCE_TYPES.NONE,
    },
    {
      label: text("Daily", "ทุกวัน"),
      value: RECURRENCE_TYPES.DAILY,
    },
    {
      label: text("Every N days", "ทุก N วัน"),
      value: RECURRENCE_TYPES.CUSTOM_DAYS,
    },
    {
      label: text("Weekly", "รายสัปดาห์"),
      value: RECURRENCE_TYPES.WEEKLY,
    },
    {
      label: text("Monthly", "รายเดือน"),
      value: RECURRENCE_TYPES.MONTHLY,
    },
  ];

  const customDayOptions = Array.from({ length: 31 }, (_, index) => index + 1);

  const monthDayOptions = Array.from({ length: 31 }, (_, index) => index + 1);

  const priorityOptions = [
    {
      label: text("Low", "ต่ำ"),
      value: "Low",
      description: "",
    },
    {
      label: text("Medium", "ปานกลาง"),
      value: "Medium",
      description: "",
    },
    {
      label: text("High", "สูง"),
      value: "High",
      description: "",
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

  const getAllDayRange = (dateValue) => {
    const baseDate = normalizeDate(dateValue) || new Date();
    const now = new Date();

    const allDayStart = new Date(baseDate);
    allDayStart.setHours(4, 0, 0, 0);

    const allDayEnd = new Date(baseDate);
    allDayEnd.setHours(23, 0, 0, 0);

    const isToday =
      baseDate.getFullYear() === now.getFullYear() &&
      baseDate.getMonth() === now.getMonth() &&
      baseDate.getDate() === now.getDate();

    if (isToday) {
      if (now >= allDayEnd) {
        return {
          safeStartTime: allDayEnd,
          safeEndTime: allDayEnd,
        };
      }

      if (now > allDayStart) {
        const currentStart = new Date(now);
        currentStart.setSeconds(0, 0);

        return {
          safeStartTime: currentStart,
          safeEndTime: allDayEnd,
        };
      }
    }

    return {
      safeStartTime: allDayStart,
      safeEndTime: allDayEnd,
    };
  };


  const getSafeTaskTimeRange = () => {
    if (isAllDay) {
      return getAllDayRange(startDateTime);
    }

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
          Alert.alert(
            text("Error", "เกิดข้อผิดพลาด"),
            text("Task ID was not found.", "ไม่พบรหัสกิจกรรม")
          );
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
        setIsAllDay(task.is_all_day === true);

        setPriority(task.priority || "Medium");

        const loadedDeadline = normalizeDate(task.deadline);
        const isPlanningTask =
          task.planning_enabled === true || task.task_type === "planned_task";

        setHasDeadline(Boolean(loadedDeadline) || isPlanningTask);
        setDeadlineDate(
          loadedDeadline ||
          normalizeDate(task.end_time) ||
          new Date(Date.now() + 24 * 60 * 60 * 1000)
        );
        setEstimatedDuration(task.estimated_duration_minutes || 60);

        if (isPlanningTask) {
          setTaskMode("time");
        } else {
          setTaskMode("todo");
        }

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
          Alert.alert(
            text("Error", "เกิดข้อผิดพลาด"),
            text(
              "You do not have permission to edit this task.",
              "คุณไม่มีสิทธิ์แก้ไขกิจกรรมนี้"
            )
          );
          handleBack();
          return;
        }

        Alert.alert(
          text("Error", "เกิดข้อผิดพลาด"),
          text("Unable to load this task.", "ไม่สามารถโหลดกิจกรรมนี้ได้")
        );
        handleBack();
      } finally {
        setIsLoading(false);
      }
    };

    loadTask();
  }, [id, isAuthReady, user, router, language]);

  const ensureLoggedIn = () => {
    if (!auth.currentUser) {
      Alert.alert(
        text("Login Required", "กรุณาเข้าสู่ระบบ"),
        text(
          "Please log in before using this feature.",
          "กรุณาเข้าสู่ระบบก่อนใช้งานฟีเจอร์นี้"
        )
      );
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
        Alert.alert(
          text("Error", "เกิดข้อผิดพลาด"),
          text(
            "End date and time must be later than start time.",
            "วันและเวลาสิ้นสุดต้องมากกว่าวันและเวลาเริ่มต้น"
          )
        );
        return;
      }

      setEndDateTime(newEndDateTime);
    }
  };

  const handleTimePickerValueChange = (
    target,
    selectedValue
  ) => {
    if (!selectedValue || !target) {
      return;
    }

    const selectedHour =
      selectedValue.getHours();

    const selectedMinute =
      selectedValue.getMinutes();

    if (target === "start") {
      const selectedStart =
        new Date(startDateTime);

      selectedStart.setHours(
        selectedHour,
        selectedMinute,
        0,
        0
      );

      const normalizedEnd =
        normalizeEndDateForStart(
          selectedStart,
          endDateTime
        );

      setStartDateTime(selectedStart);
      setEndDateTime(normalizedEnd);

      return;
    }

    if (target === "end") {
      const selectedEnd =
        buildDateWithTime(
          startDateTime,
          endDateTime
        );

      selectedEnd.setHours(
        selectedHour,
        selectedMinute,
        0,
        0
      );

      // ถ้าเวลาสิ้นสุดน้อยกว่าเวลาเริ่ม
      // ให้ตีความว่าเป็นวันถัดไป
      if (selectedEnd <= startDateTime) {
        selectedEnd.setDate(
          selectedEnd.getDate() + 1
        );
      }

      setEndDateTime(selectedEnd);
    }
  };

  const openPicker = (target, mode) => {
    if (isSaving) {
      return;
    }

    const pickerMode =
      mode === "time" ? "time" : "date";

    DateTimePickerAndroid.open({
      value:
        getPickerValue(target) ||
        new Date(),

      mode: pickerMode,

      // ใช้เวลาแบบ 24 ชั่วโมง
      is24Hour: true,

      // ใช้หน้าตาของเครื่องผู้ใช้
      display: "default",

      onChange: (event, selectedValue) => {
        if (event?.type === "dismissed") {
          return;
        }

        if (!selectedValue) {
          return;
        }

        if (pickerMode === "time") {
          handleTimePickerValueChange(
            target,
            selectedValue
          );

          return;
        }

        handleDatePickerValueChange(
          target,
          selectedValue
        );
      },
    });
  };

  const formatDate = (value) => {
    const date = normalizeDate(value);

    if (!isValidDate(date)) return "";

    return date.toLocaleDateString(locale, {
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
    if (minutes < 60) {
      return isThai ? `${minutes} นาที` : `${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (remainingMinutes === 0) {
      return isThai ? `${hours} ชม.` : `${hours} hr`;
    }

    return isThai
      ? `${hours} ชม. ${remainingMinutes} นาที`
      : `${hours} hr ${remainingMinutes} min`;
  };

  const formatConflictDate = (value) => {
    const date = normalizeDate(value);

    if (!isValidDate(date)) return "-";

    return date.toLocaleDateString(locale, {
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
    const thaiWeekdays = [
      "อาทิตย์",
      "จันทร์",
      "อังคาร",
      "พุธ",
      "พฤหัสบดี",
      "ศุกร์",
      "เสาร์",
    ];

    return selectedWeekdays
      .map((day) => {
        if (isThai) return thaiWeekdays[day] || "";

        return (
          WEEKDAY_OPTIONS.find((option) => option.value === day)?.fullLabel ||
          ""
        );
      })
      .filter(Boolean)
      .join(", ");
  };

  const getWeekdayButtonLabel = (day) => {
    const thaiWeekdaysShort = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

    if (isThai) return thaiWeekdaysShort[day.value] || day.label;

    return day.label;
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
      is_all_day: isAllDay,

      task_type: "fixed",

      priority,
      deadline: hasDeadline ? deadlineDate : null,
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

        Alert.alert(
          text("Error", "เกิดข้อผิดพลาด"),
          text(
            "Unable to reschedule this task. Please try again.",
            "ไม่สามารถเลื่อนเวลากิจกรรมนี้ได้ กรุณาลองใหม่อีกครั้ง"
          )
        );
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

      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text(
          "Unable to update this task. Please try again.",
          "ไม่สามารถอัปเดตกิจกรรมนี้ได้ กรุณาลองใหม่อีกครั้ง"
        )
      );
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
        Alert.alert(
          text("Error", "เกิดข้อผิดพลาด"),
          text(
            "You do not have permission to edit this task.",
            "คุณไม่มีสิทธิ์แก้ไขกิจกรรมนี้"
          )
        );
        return;
      }

      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        getReadableUpdateErrorMessage(error)
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

      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text(
          "Unable to save changes. Please try again.",
          "ไม่สามารถบันทึกการแก้ไขได้ กรุณาลองใหม่อีกครั้ง"
        )
      );
    } catch (error) {
      console.error("Save anyway edit error:", error);

      if (error?.message === "AUTH_REQUIRED") {
        router.replace("/login");
        return;
      }

      if (error?.message === "PERMISSION_DENIED") {
        Alert.alert(
          text("Error", "เกิดข้อผิดพลาด"),
          text(
            "You do not have permission to edit this task.",
            "คุณไม่มีสิทธิ์แก้ไขกิจกรรมนี้"
          )
        );
        return;
      }

      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        getReadableUpdateErrorMessage(error)
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!ensureLoggedIn()) return;
    if (isSaving) return;

    if (!id) {
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text("Task ID was not found.", "ไม่พบรหัสกิจกรรม")
      );
      return;
    }

    if (!title.trim()) {
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text("Please enter a title.", "กรุณากรอกชื่อกิจกรรม")
      );
      return;
    }

    const { safeStartTime, safeEndTime } = getSafeTaskTimeRange();

    if (safeEndTime <= safeStartTime) {
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text(
          "End time must be later than start time.",
          "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น"
        )
      );
      return;
    }

    if (
      repeatType === RECURRENCE_TYPES.CUSTOM_DAYS &&
      (!customDays || Number(customDays) < 1 || Number(customDays) > 100)
    ) {
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text(
          "Custom repeat interval must be between 1 and 100 days.",
          "จำนวนวันที่ทำซ้ำต้องอยู่ระหว่าง 1 ถึง 100 วัน"
        )
      );
      return;
    }

    if (
      repeatType === RECURRENCE_TYPES.WEEKLY &&
      (!selectedWeekdays || selectedWeekdays.length === 0)
    ) {
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text(
          "Please select at least one weekday.",
          "กรุณาเลือกวันอย่างน้อย 1 วัน"
        )
      );
      return;
    }

    if (
      repeatType === RECURRENCE_TYPES.WEEKLY &&
      (!weekInterval || Number(weekInterval) < 1 || Number(weekInterval) > 12)
    ) {
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text(
          "Week interval must be between 1 and 12 weeks.",
          "จำนวนสัปดาห์ที่ทำซ้ำต้องอยู่ระหว่าง 1 ถึง 12 สัปดาห์"
        )
      );
      return;
    }

    if (
      repeatType === RECURRENCE_TYPES.MONTHLY &&
      (!monthDay || Number(monthDay) < 1 || Number(monthDay) > 31)
    ) {
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text(
          "Month day must be between 1 and 31.",
          "วันที่ของเดือนต้องอยู่ระหว่าง 1 ถึง 31"
        )
      );
      return;
    }

    if (
      repeatType === RECURRENCE_TYPES.MONTHLY &&
      (!monthInterval || Number(monthInterval) < 1 || Number(monthInterval) > 12)
    ) {
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text(
          "Month interval must be between 1 and 12 months.",
          "จำนวนเดือนที่ทำซ้ำต้องอยู่ระหว่าง 1 ถึง 12 เดือน"
        )
      );
      return;
    }

    if (!priority) {
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text("Please select a priority.", "กรุณาเลือกระดับความสำคัญ")
      );
      return;
    }

    if (taskMode === "time" && !hasDeadline) {
      Alert.alert(
        text("Deadline Required", "ต้องมีเดดไลน์"),
        text(
          "Planning tasks require a deadline.",
          "กิจกรรมแบบวางแผนจำเป็นต้องมีเดดไลน์"
        )
      );
      return;
    }

    if (!estimatedDuration || Number(estimatedDuration) <= 0) {
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text(
          "Please select estimated duration.",
          "กรุณาเลือกระยะเวลาที่คาดว่าจะใช้"
        )
      );
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

  const getConflictMessage = () => {
    const count = conflictResult?.conflict_count || 0;
    const slotCount = conflictResult?.conflict_instance_count || 0;

    if (isThai) {
      if (slotCount) {
        return `พบกิจกรรมที่เวลาทับซ้อน ${count} กิจกรรม จากช่วงเวลาใหม่ ${slotCount} ช่วง`;
      }

      return `พบกิจกรรมที่เวลาทับซ้อน ${count} กิจกรรม`;
    }

    return `Found ${count} conflicting task${count > 1 ? "s" : ""}${slotCount
      ? ` from ${slotCount} time slot${slotCount > 1 ? "s" : ""}`
      : ""
      }.`;
  };
  const getReadableUpdateErrorMessage = (error) => {
    if (error?.message === "INVALID_ALL_DAY_TIME_RANGE") {
      return text(
        "The selected day has already passed the all-day time range. Please choose another date.",
        "วันนี้เลยช่วงเวลาทั้งวันแล้ว กรุณาเลือกวันอื่น"
      );
    }

    if (isRescheduleMode) {
      return text(
        "Unable to reschedule this task. Please try again.",
        "ไม่สามารถเลื่อนเวลากิจกรรมนี้ได้ กรุณาลองใหม่อีกครั้ง"
      );
    }

    return text(
      "Unable to update this task. Please try again.",
      "ไม่สามารถอัปเดตกิจกรรมนี้ได้ กรุณาลองใหม่อีกครั้ง"
    );
  };
  const getSaveButtonLabel = () => {
    if (isSaving) {
      return isRescheduleMode
        ? text("Rescheduling...", "กำลังเลื่อนเวลา...")
        : text("Checking...", "กำลังตรวจสอบ...");
    }

    return isRescheduleMode
      ? text("Save New Time", "บันทึกเวลาใหม่")
      : text("Save Changes", "บันทึกการแก้ไข");
  };

  const getDurationDescription = () => {
    return "ใช้สำหรับบอกระบบว่ากิจกรรมนี้ต้องใช้เวลาประมาณเท่าไร เพื่อช่วยคำนวณเวลาว่าง แนะนำช่วงเวลาทำกิจกรรม และช่วยจัดเวลาใหม่เมื่อกิจกรรมเลยเวลา";
  };

  const getRepeatDescription = (type) => {
    if (type === RECURRENCE_TYPES.NONE) {
      return "กิจกรรมนี้จะถูกสร้างเพียงครั้งเดียว ไม่สร้างกิจกรรมซ้ำในวันถัดไป";
    }

    if (type === RECURRENCE_TYPES.DAILY) {
      return "กิจกรรมนี้จะถูกสร้างซ้ำทุกวันในเวลาเริ่มต้นและเวลาสิ้นสุดเดิม";
    }

    if (type === RECURRENCE_TYPES.CUSTOM_DAYS) {
      return "กำหนดจำนวนวันเอง เช่น ทุก 3 วัน หมายถึงระบบจะสร้างกิจกรรมซ้ำทุก ๆ 3 วัน";
    }

    if (type === RECURRENCE_TYPES.WEEKLY) {
      return "กำหนดให้กิจกรรมทำซ้ำเป็นรายสัปดาห์ และเลือกวันในสัปดาห์ได้ เช่น ทุกวันศุกร์ หรือทุกวันเสาร์";
    }

    if (type === RECURRENCE_TYPES.MONTHLY) {
      return "กำหนดให้กิจกรรมทำซ้ำเป็นรายเดือน โดยเลือกวันที่ของเดือนและจำนวนเดือนที่ต้องการเว้นได้ เช่น ทุกวันที่ 1 หรือทุก 2 เดือน";
    }

    return "ใช้สำหรับกำหนดรูปแบบการทำซ้ำของกิจกรรม";
  };



  if (isLoading || !isAuthReady) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>
          {text("Loading task...", "กำลังโหลดกิจกรรม...")}
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
    <View style={styles.screen}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        overScrollMode="never"
        bounces={false}
        alwaysBounceVertical={false}
        alwaysBounceHorizontal={false}
      >
        <View style={styles.topNav}>
          <Pressable style={styles.navIconButton} onPress={handleBack}>
            <Text style={styles.backIconText}>{"<"}</Text>
          </Pressable>

          <Text style={styles.navTitle}>
            {isRescheduleMode
              ? text("Reschedule Task", "เลื่อนเวลากิจกรรม")
              : text("Edit Task", "แก้ไขกิจกรรม")}
          </Text>

          <Pressable
            style={[styles.doneButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleUpdate}
            disabled={isSaving}
          >
            <Text style={styles.doneButtonText}>✓</Text>
          </Pressable>
        </View>

        {!isRescheduleMode ? (
          <>
            <SectionCard
              title="ข้อมูลพื้นฐาน"
              icon="document-text-outline"
              open={basicSectionOpen}
              onToggle={() => setBasicSectionOpen((current) => !current)}
            >
              <TextInput
                style={styles.compactTitleInput}
                placeholder={text("Title", "ชื่อกิจกรรม")}
                placeholderTextColor={COLORS.textMuted}
                value={title}
                onChangeText={setTitle}
                numberOfLines={1}
              />

              <View style={styles.line} />

              <TextInput
                style={styles.compactDetailInput}
                placeholder={text("Detail / Note", "รายละเอียด / หมายเหตุ")}
                placeholderTextColor={COLORS.textMuted}
                value={detail}
                onChangeText={setDetail}
                multiline
                textAlignVertical="top"
              />
            </SectionCard>

            <SectionCard
              title="ตารางเวลา"
              icon="time-outline"
              open={scheduleSectionOpen}
              onToggle={() => setScheduleSectionOpen((current) => !current)}
            >
              <View style={styles.allDayRow}>
                <View style={styles.allDayTextBox}>
                  <Text style={styles.allDayTitle}>{text("All day", "ทั้งวัน")}</Text>

                </View>

                <Pressable
                  style={[
                    styles.allDayToggle,
                    isAllDay && styles.allDayToggleActive,
                  ]}
                  onPress={() => setIsAllDay((current) => !current)}
                >
                  <View
                    style={[
                      styles.allDayToggleKnob,
                      isAllDay && styles.allDayToggleKnobActive,
                    ]}
                  />
                </Pressable>
              </View>

              <View style={styles.line} />

              <View style={styles.row}>
                <Text style={styles.label}>{text("Start", "เริ่ม")}</Text>

                <Pressable
                  style={styles.pickerBox}
                  onPress={() => openPicker("start", "date")}
                >
                  <Text style={styles.pickerText}>{formatDate(startDateTime)}</Text>
                </Pressable>

                {!isAllDay ? (
                  <Pressable
                    style={styles.timeBox}
                    onPress={() => openPicker("start", "time")}
                  >
                    <Text style={styles.pickerText}>{formatTime(startDateTime)}</Text>
                  </Pressable>
                ) : (
                  <View style={styles.timeBoxDisabled}>
                    <Text style={styles.disabledTimeText}>
                      {formatTime(getSafeTaskTimeRange().safeStartTime)}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.line} />

              {!isAllDay ? (
                <View style={styles.row}>
                  <Text style={styles.label}>{text("End", "สิ้นสุด")}</Text>

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
              ) : (
                <View style={styles.allDayInfoBox}>
                  <Ionicons name="time-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.allDayInfoText}>
                    {text(
                      "This task will cover the selected day from 04:00 to 23:00.",
                      "กิจกรรมนี้จะครอบคลุมช่วงเวลาของวันนั้น เช่น 04:00 ถึง 23:00"
                    )}
                  </Text>
                </View>
              )}

              <View style={styles.line} />

              <View style={styles.allDayRow}>
                <View style={styles.allDayTextBox}>
                  <View style={styles.deadlineTitleRow}>
                    <Text style={styles.allDayTitle}>
                      {text("Has deadline", "มีเดดไลน์")}
                    </Text>

                    <Pressable
                      style={styles.infoButtonSmall}
                      onPress={() =>
                        Alert.alert(
                          text("Deadline", "เดดไลน์"),
                          text(
                            "Turn this on when the task must be completed by a specific date. Planning tasks always require a deadline.",
                            "เปิดเมื่องานต้องเสร็จภายในวันที่กำหนด ส่วนกิจกรรมแบบวางแผนจำเป็นต้องมีเดดไลน์เสมอ"
                          )
                        )
                      }
                    >
                      <Ionicons
                        name="information-circle-outline"
                        size={17}
                        color={COLORS.textMuted}
                      />
                    </Pressable>
                  </View>
                </View>

                <Pressable
                  style={[
                    styles.allDayToggle,
                    hasDeadline && styles.allDayToggleActive,
                    taskMode === "time" && styles.toggleDisabled,
                  ]}
                  onPress={() => {
                    if (taskMode === "time") {
                      Alert.alert(
                        text("Deadline Required", "ต้องมีเดดไลน์"),
                        text(
                          "Planning tasks require a deadline.",
                          "กิจกรรมแบบวางแผนจำเป็นต้องมีเดดไลน์"
                        )
                      );
                      return;
                    }

                    setHasDeadline((current) => !current);
                  }}
                  disabled={taskMode === "time"}
                >
                  <View
                    style={[
                      styles.allDayToggleKnob,
                      hasDeadline && styles.allDayToggleKnobActive,
                    ]}
                  />
                </Pressable>
              </View>

              {hasDeadline ? (
                <>
                  <View style={styles.line} />
                  <View style={styles.row}>
                    <Text style={styles.label}>
                      {taskMode === "time"
                        ? text("Final plan date", "วันสุดท้ายของแผน")
                        : text("Deadline", "กำหนดส่ง")}
                    </Text>

                    <Pressable
                      style={styles.deadlineBox}
                      onPress={() => openPicker("deadline", "date")}
                    >
                      <Text style={styles.pickerText}>{formatDate(deadlineDate)}</Text>
                    </Pressable>
                  </View>
                </>
              ) : null}
            </SectionCard>

            <SectionCard
              title="การจัดเวลา"
              icon="calendar-outline"
              open={timeSectionOpen}
              onToggle={() => setTimeSectionOpen((current) => !current)}
            >
              <Text style={styles.subSectionTitle}>
                {text("Priority", "ความสำคัญ")}
              </Text>

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
                        active && option.value === "Low" && styles.priorityLowActive,
                        active &&
                        option.value === "Medium" &&
                        styles.priorityMediumActive,
                        active && option.value === "High" && styles.priorityHighActive,
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
                        numberOfLines={1}
                      >
                        {active ? "✓ " : ""}
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.line} />

              <View style={styles.labelWithInfo}>
                <Text style={styles.subSectionTitleNoMargin}>
                  ระยะเวลาที่คาดว่าจะใช้
                </Text>

                <Pressable
                  style={styles.infoButton}
                  onPress={() =>
                    Alert.alert("ระยะเวลาที่คาดว่าจะใช้", getDurationDescription())
                  }
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={18}
                    color={COLORS.textMuted}
                  />
                </Pressable>
              </View>

              <Pressable
                style={styles.dropdownButton}
                onPress={() => setDurationDropdownOpen((current) => !current)}
              >
                <Text style={styles.dropdownButtonText}>
                  {formatDuration(estimatedDuration)}
                </Text>

                <Ionicons
                  name={durationDropdownOpen ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={COLORS.textMuted}
                />
              </Pressable>

              {durationDropdownOpen ? (
                <View style={styles.dropdownMenu}>
                  {durationOptions.map((duration) => (
                    <Pressable
                      key={duration}
                      style={[
                        styles.dropdownItem,
                        estimatedDuration === duration && styles.dropdownItemActive,
                      ]}
                      onPress={() => {
                        setEstimatedDuration(duration);
                        setDurationDropdownOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          estimatedDuration === duration &&
                          styles.dropdownItemTextActive,
                        ]}
                      >
                        {formatDuration(duration)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <View style={styles.line} />

              <Text style={styles.subSectionTitle}>การทำซ้ำ</Text>

              {recurrenceGroupId ? (
                <Text style={styles.repeatNoticeText}>
                  กิจกรรมนี้เป็นส่วนหนึ่งของกลุ่มกิจกรรมที่ทำซ้ำ คุณจะเลือกวิธีใช้การแก้ไขตอนบันทึก
                </Text>
              ) : null}

              <Pressable
                style={styles.dropdownButton}
                onPress={() => setRepeatDropdownOpen((current) => !current)}
              >
                <Text style={styles.dropdownButtonText}>
                  {repeatOptions.find((option) => option.value === repeatType)?.label ||
                    "ไม่ทำซ้ำ"}
                </Text>

                <Ionicons
                  name={repeatDropdownOpen ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={COLORS.textMuted}
                />
              </Pressable>

              {repeatDropdownOpen ? (
                <View style={styles.dropdownMenu}>
                  {repeatOptions.map((option) => {
                    const active = repeatType === option.value;
                    const hasExtraOptions =
                      option.value === RECURRENCE_TYPES.CUSTOM_DAYS ||
                      option.value === RECURRENCE_TYPES.WEEKLY ||
                      option.value === RECURRENCE_TYPES.MONTHLY;

                    return (
                      <View
                        key={option.value}
                        style={[
                          styles.dropdownItemRow,
                          active && styles.dropdownItemActive,
                        ]}
                      >
                        <Pressable
                          style={styles.dropdownItemMain}
                          onPress={() => {
                            handleRepeatTypeChange(option.value);
                            setRepeatDropdownOpen(hasExtraOptions);
                          }}
                        >
                          <Text
                            style={[
                              styles.dropdownItemText,
                              active && styles.dropdownItemTextActive,
                            ]}
                          >
                            {option.label}
                          </Text>
                        </Pressable>

                        <Pressable
                          style={styles.dropdownInfoButton}
                          onPress={() =>
                            Alert.alert(option.label, getRepeatDescription(option.value))
                          }
                        >
                          <Ionicons
                            name="information-circle-outline"
                            size={18}
                            color={active ? COLORS.textLight : COLORS.textMuted}
                          />
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              {repeatDropdownOpen && repeatType === RECURRENCE_TYPES.CUSTOM_DAYS && (
                <>
                  <View style={styles.inputRow}>
                    <Text style={styles.smallLabel}>ทำซ้ำทุก</Text>

                    <TextInput
                      style={styles.numberInput}
                      value={String(customDays)}
                      onChangeText={handleCustomDaysChange}
                      keyboardType="number-pad"
                      placeholder="1"
                      placeholderTextColor={COLORS.textMuted}
                      maxLength={3}
                    />

                    <Text style={styles.smallLabel}>วัน</Text>
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
                </>
              )}

              {repeatDropdownOpen && repeatType === RECURRENCE_TYPES.WEEKLY && (
                <>
                  <View style={styles.intervalStepperRow}>
                    <Text style={styles.intervalStepperLabel}>ทำซ้ำทุก</Text>

                    <View style={styles.intervalStepperControls}>
                      <Pressable
                        style={[
                          styles.intervalStepperButton,
                          (Number(weekInterval) || 1) <= 1 &&
                            styles.intervalStepperButtonDisabled,
                        ]}
                        disabled={(Number(weekInterval) || 1) <= 1}
                        onPress={() =>
                          setWeekInterval((current) =>
                            Math.max(1, (Number(current) || 1) - 1)
                          )
                        }
                      >
                        <Ionicons
                          name="remove"
                          size={20}
                          color={
                            (Number(weekInterval) || 1) <= 1
                              ? COLORS.textMuted
                              : COLORS.primary
                          }
                        />
                      </Pressable>

                      <View style={styles.intervalStepperValueBox}>
                        <Text style={styles.intervalStepperValue}>
                          {Math.min(12, Math.max(1, Number(weekInterval) || 1))} สัปดาห์
                        </Text>
                      </View>

                      <Pressable
                        style={[
                          styles.intervalStepperButton,
                          (Number(weekInterval) || 1) >= 12 &&
                            styles.intervalStepperButtonDisabled,
                        ]}
                        disabled={(Number(weekInterval) || 1) >= 12}
                        onPress={() =>
                          setWeekInterval((current) =>
                            Math.min(12, (Number(current) || 1) + 1)
                          )
                        }
                      >
                        <Ionicons
                          name="add"
                          size={20}
                          color={
                            (Number(weekInterval) || 1) >= 12
                              ? COLORS.textMuted
                              : COLORS.primary
                          }
                        />
                      </Pressable>
                    </View>
                  </View>

                  <Text style={styles.subSectionTitle}>ทำซ้ำในวัน</Text>

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
                            {getWeekdayButtonLabel(day)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              {repeatDropdownOpen && repeatType === RECURRENCE_TYPES.MONTHLY && (
                <>
                  <View style={styles.intervalStepperRow}>
                    <Text style={styles.intervalStepperLabel}>ทำซ้ำทุก</Text>

                    <View style={styles.intervalStepperControls}>
                      <Pressable
                        style={[
                          styles.intervalStepperButton,
                          (Number(monthInterval) || 1) <= 1 &&
                            styles.intervalStepperButtonDisabled,
                        ]}
                        disabled={(Number(monthInterval) || 1) <= 1}
                        onPress={() =>
                          setMonthInterval((current) =>
                            Math.max(1, (Number(current) || 1) - 1)
                          )
                        }
                      >
                        <Ionicons
                          name="remove"
                          size={20}
                          color={
                            (Number(monthInterval) || 1) <= 1
                              ? COLORS.textMuted
                              : COLORS.primary
                          }
                        />
                      </Pressable>

                      <View style={styles.intervalStepperValueBox}>
                        <Text style={styles.intervalStepperValue}>
                          {Math.min(12, Math.max(1, Number(monthInterval) || 1))} เดือน
                        </Text>
                      </View>

                      <Pressable
                        style={[
                          styles.intervalStepperButton,
                          (Number(monthInterval) || 1) >= 12 &&
                            styles.intervalStepperButtonDisabled,
                        ]}
                        disabled={(Number(monthInterval) || 1) >= 12}
                        onPress={() =>
                          setMonthInterval((current) =>
                            Math.min(12, (Number(current) || 1) + 1)
                          )
                        }
                      >
                        <Ionicons
                          name="add"
                          size={20}
                          color={
                            (Number(monthInterval) || 1) >= 12
                              ? COLORS.textMuted
                              : COLORS.primary
                          }
                        />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.inputRow}>
                    <Text style={styles.smallLabel}>วันที่</Text>

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

                    <Text style={styles.smallLabel}>ของเดือน</Text>
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
                </>
              )}
            </SectionCard>
          </>
        ) : (
          <>
            <SectionCard
              title="ข้อมูลพื้นฐาน"
              icon="document-text-outline"
              open={basicSectionOpen}
              onToggle={() => setBasicSectionOpen((current) => !current)}
            >
              <Text style={styles.rescheduleTitle} numberOfLines={2}>
                {title || text("Untitled Task", "ไม่มีชื่อกิจกรรม")}
              </Text>

              {detail ? (
                <>
                  <View style={styles.line} />
                  <Text style={styles.rescheduleDetail}>{detail}</Text>
                </>
              ) : null}
            </SectionCard>

            <SectionCard
              title="ตารางเวลา"
              icon="time-outline"
              open={scheduleSectionOpen}
              onToggle={() => setScheduleSectionOpen((current) => !current)}
            >
              <View style={styles.row}>
                <Text style={styles.label}>{text("Start", "เริ่ม")}</Text>

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
                <Text style={styles.label}>{text("End", "สิ้นสุด")}</Text>

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
            </SectionCard>

            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>โหมดเลื่อนเวลา</Text>
              <Text style={styles.infoText}>
                ระบบจะอัปเดตเฉพาะเวลาเริ่มต้นและเวลาสิ้นสุด รายละเอียดอื่นของกิจกรรมจะคงเดิม
              </Text>
            </View>
          </>
        )}

        <Pressable
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleUpdate}
          disabled={isSaving}
        >
          <Text style={styles.saveText}>{getSaveButtonLabel()}</Text>
        </Pressable>

        <Pressable style={styles.cancelButton} onPress={handleBack}>
          <Text style={styles.cancelText}>{text("Cancel", "ยกเลิก")}</Text>
        </Pressable>
      </ScrollView>


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
            <Text style={styles.editScopeModalTitle}>
              {text("Apply changes to", "ใช้การแก้ไขกับ")}
            </Text>

            <Text style={styles.editScopeModalMessage}>
              {text(
                "This task is part of a recurring task group. Choose whether to update only this task or recreate the whole recurring group.",
                "กิจกรรมนี้เป็นส่วนหนึ่งของกลุ่มกิจกรรมที่ทำซ้ำ เลือกว่าจะแก้เฉพาะกิจกรรมนี้ หรือแก้กิจกรรมที่ทำซ้ำทั้งหมด"
              )}
            </Text>

            <Pressable
              style={styles.editScopeModalPrimaryButton}
              onPress={() => handleChooseEditScope("single")}
            >
              <Text style={styles.editScopeModalPrimaryText}>
                {text("This task only", "เฉพาะกิจกรรมนี้")}
              </Text>
            </Pressable>

            <Pressable
              style={styles.editScopeModalDangerButton}
              onPress={() => handleChooseEditScope("all")}
            >
              <Text style={styles.editScopeModalDangerText}>
                {text("All recurring tasks", "กิจกรรมที่ทำซ้ำทั้งหมด")}
              </Text>
            </Pressable>

            <Pressable
              style={styles.editScopeModalCancelButton}
              onPress={() => {
                setEditScopeModalVisible(false);
                setPendingEditPayload(null);
              }}
            >
              <Text style={styles.editScopeModalCancelText}>
                {text("Cancel", "ยกเลิก")}
              </Text>
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
            <Text style={styles.conflictModalTitle}>
              {text("Time Conflict Detected", "พบเวลาทับซ้อน")}
            </Text>

            <Text style={styles.conflictModalMessage}>
              {getConflictMessage()}
            </Text>

            <View style={styles.conflictListBox}>
              {conflictPreviewItems.length === 0 ? (
                <Text style={styles.conflictEmptyText}>
                  {text(
                    "No conflict details found",
                    "ไม่พบรายละเอียดเวลาทับซ้อน"
                  )}
                </Text>
              ) : (
                conflictPreviewItems.map((item, index) => (
                  <View
                    key={`${item.task_id}-${index}`}
                    style={styles.conflictItem}
                  >
                    <Text style={styles.conflictItemTitle} numberOfLines={1}>
                      {item.title || text("Untitled Task", "ไม่มีชื่อกิจกรรม")}
                    </Text>

                    <Text style={styles.conflictItemTime}>
                      {formatConflictDate(item.start_time)} -{" "}
                      {formatTime(item.start_time)}{" "}
                      {text("to", "ถึง")} {formatTime(item.end_time)}
                    </Text>

                    {item.conflict_instance_start_time ? (
                      <Text style={styles.conflictNewTime}>
                        {text("New", "เวลาใหม่")}:{" "}
                        {formatConflictDate(item.conflict_instance_start_time)}{" "}
                        - {formatTime(item.conflict_instance_start_time)}{" "}
                        {text("to", "ถึง")}{" "}
                        {formatTime(item.conflict_instance_end_time)}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}

              {remainingConflictCount > 0 && (
                <Text style={styles.conflictMoreText}>
                  {isThai
                    ? `+ อีก ${remainingConflictCount} รายการ`
                    : `+${remainingConflictCount} more conflicts`}
                </Text>
              )}
            </View>

            <Pressable
              style={styles.changeTimeButton}
              onPress={handleChangeTimeFromConflict}
            >
              <Text style={styles.changeTimeText}>
                {text("Change Time", "เปลี่ยนเวลา")}
              </Text>
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
                {isSaving
                  ? text("Saving...", "กำลังบันทึก...")
                  : text("Save Anyway", "บันทึกต่อไป")}
              </Text>
            </Pressable>

            <Pressable
              style={styles.cancelConflictButton}
              onPress={handleCancelConflict}
            >
              <Text style={styles.cancelConflictText}>
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
  sectionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
    overflow: "hidden",
  },

  sectionHeader: {
    minHeight: 52,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },

  sectionIconBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },

  sectionCardTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
  },
  sectionBody: {
    paddingHorizontal: 14,
    paddingBottom: 16,
    gap: 2,
  },

  compactTitleInput: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.text,
    backgroundColor: COLORS.cardSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },

  compactDetailInput: {
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.cardSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 70,
  },

  labelWithInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    marginBottom: 10,
  },

  subSectionTitleNoMargin: {
    fontSize: 15,
    color: COLORS.textMuted,
    fontWeight: "800",
  },

  infoButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },

  dropdownButton: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: COLORS.cardSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  dropdownButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.text,
  },

  dropdownMenu: {
    backgroundColor: COLORS.cardSoft,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
    overflow: "hidden",
  },

  dropdownItem: {
    paddingVertical: 13,
    paddingHorizontal: 14,
  },

  dropdownItemActive: {
    backgroundColor: COLORS.primary,
  },

  dropdownItemText: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.text,
  },

  dropdownItemTextActive: {
    color: COLORS.textLight,
  },

  dropdownItemRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  dropdownItemMain: {
    flex: 1,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },

  dropdownInfoButton: {
    width: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
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
    height: 0,
    backgroundColor: "transparent",
    marginVertical: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  label: {
    width: 86,
    fontSize: 17,
    color: COLORS.text,
    fontWeight: "800",
  },
  pickerBox: {
    flex: 1,
    minHeight: 46,
    backgroundColor: COLORS.cardSoft,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  timeBox: {
    width: 92,
    minHeight: 46,
    backgroundColor: COLORS.cardSoft,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  deadlineBox: {
    flex: 1,
    minHeight: 46,
    backgroundColor: COLORS.cardSoft,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pickerText: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
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
    paddingBottom: 14,
  },
  priorityButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderWidth: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
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
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
    width: "100%",
    includeFontPadding: false,
    textAlignVertical: "center",
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
  intervalStepperRow: {
    paddingVertical: 14,
    gap: 10,
  },
  intervalStepperLabel: {
    fontSize: 17,
    color: COLORS.text,
    fontWeight: "700",
  },
  intervalStepperControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  intervalStepperButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  intervalStepperButtonDisabled: {
    opacity: 0.4,
    backgroundColor: COLORS.cardSoft,
    borderColor: COLORS.border,
  },
  intervalStepperValueBox: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.cardSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
  },
  intervalStepperValue: {
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
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
  allDayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
    minHeight: 46,
  },
  allDayTextBox: {
    flex: 1,
  },

  allDayTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: COLORS.text,
  },
  deadlineTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  deadlineHelperText: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.textMuted,
    fontWeight: "600",
  },
  infoButtonSmall: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  allDayToggle: {
    width: 52,
    height: 30,
    borderRadius: 999,
    padding: 3,
    backgroundColor: COLORS.border,
    justifyContent: "center",
  },

  allDayToggleActive: {
    backgroundColor: COLORS.primary,
  },
  toggleDisabled: {
    opacity: 0.65,
  },

  allDayToggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
  },

  allDayToggleKnobActive: {
    alignSelf: "flex-end",
  },

  timeBoxDisabled: {
    backgroundColor: COLORS.cardSoft,
    borderRadius: 14,
    padding: 10,
    width: 90,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    opacity: 0.75,
  },

  disabledTimeText: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.textMuted,
  },

  allDayInfoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginVertical: 12,
  },

  allDayInfoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.text,
    fontWeight: "700",
  },
});
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

//import TimePickerModal from "../src/components/TimePickerModal";
import { auth } from "../src/config/firebase";
import { COLORS } from "../src/constants/theme";
import { useLanguage } from "../src/i18n/LanguageContext";
import {
  addTask,
  checkPlanningDraftConflicts,
  createPlanningDraft,
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

export default function AddTask() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();

  const isThai = language === "th";
  const text = (en, th) => (isThai ? th : en);
  const locale = isThai ? "th-TH" : "en-US";

  const from = params?.from ? String(params.from) : "";
  const startTime = params?.startTime;
  const endTime = params?.endTime;
  const selectedDateParam = params?.selectedDate;

  const isFromFreeTime = from === "free-time";
  const isFromCalendar = from === "calendar";

  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [academicTaskType, setAcademicTaskType] = useState("normal");

  //เพิ่ม state โหมด
  const [taskMode, setTaskMode] = useState("todo");

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

  const [priority, setPriority] = useState("Medium");
  const [deadlineDate, setDeadlineDate] = useState(
    new Date(Date.now() + 24 * 60 * 60 * 1000)
  );
  const [hasDeadline, setHasDeadline] = useState(true);
  const [estimatedDuration, setEstimatedDuration] = useState(60);

  const [planningEnabled, setPlanningEnabled] = useState(false);
  const [totalPlannedMinutes, setTotalPlannedMinutes] = useState(600);
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(60);


  const [preferredStartTime, setPreferredStartTime] = useState(() => {
    const value = new Date();
    value.setHours(9, 0, 0, 0);
    return value;
  });

  const [preferredEndTime, setPreferredEndTime] = useState(() => {
    const value = new Date();
    value.setHours(12, 0, 0, 0);
    return value;
  });

  const [isSaving, setIsSaving] = useState(false);

  //const [timePickerVisible, setTimePickerVisible] = useState(false);
  //const [timePickerTarget, setTimePickerTarget] = useState(null);

  const [repeatDropdownOpen, setRepeatDropdownOpen] = useState(false);
  const [durationDropdownOpen, setDurationDropdownOpen] = useState(false);

  const [basicSectionOpen, setBasicSectionOpen] = useState(true);
  const [scheduleSectionOpen, setScheduleSectionOpen] = useState(true);
  const [timeSectionOpen, setTimeSectionOpen] = useState(true);
  const [planningSectionOpen, setPlanningSectionOpen] = useState(true);

  const [totalPlanDropdownOpen, setTotalPlanDropdownOpen] = useState(false);
  const [sessionDropdownOpen, setSessionDropdownOpen] = useState(false);


  const [conflictModalVisible, setConflictModalVisible] = useState(false);
  const [conflictResult, setConflictResult] = useState(null);
  const [pendingTaskPayload, setPendingTaskPayload] = useState(null);

  const [planningDraftVisible, setPlanningDraftVisible] = useState(false);
  const [planningDraftPayload, setPlanningDraftPayload] = useState(null);
  const [planningDraftSessions, setPlanningDraftSessions] = useState([]);
  const [planningDraftResult, setPlanningDraftResult] = useState(null);
  const [planningDraftChecking, setPlanningDraftChecking] = useState(false);

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

  const academicTaskTypeOptions = [
    {
      label: text("Normal", "กิจกรรมทั่วไป"),
      value: "normal",
      description: "",
    },
    {
      label: text("Exam", "สอบ"),
      value: "exam",
      description: "",
    },
    {
      label: text("Study Plan", "แผนอ่านหนังสือ"),
      value: "study_plan",
      description: "",
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

  const totalPlanOptions = [
    60,   // 1 ชม.
    120,  // 2 ชม.
    180,  // 3 ชม.
    240,  // 4 ชม.
    300,  // 5 ชม.
    360,  // 6 ชม.
    420,  // 7 ชม.
    480,  // 8 ชม.
    540,  // 9 ชม.
    600,  // 10 ชม.
    660,  // 11 ชม.
    720,  // 12 ชม.
    780,  // 13 ชม.
    840,  // 14 ชม.
    900,  // 15 ชม.
    960,  // 16 ชม.
    1020, // 17 ชม.
    1080, // 18 ชม.
    1140, // 19 ชม.
    1200, // 20 ชม.
  ];
  const sessionOptions = [30, 45, 60, 90, 120];




  const getReturnPath = () => {
    if (isFromCalendar) return "/calentask";
    if (from === "tasks" || isFromFreeTime) return "/tasks";
    return "/";
  };

  const handleBack = () => {
    router.replace(getReturnPath());
  };

  const handleAfterSave = () => {
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

    const parsedStartTime = startTime ? new Date(String(startTime)) : null;
    const parsedEndTime = endTime ? new Date(String(endTime)) : null;

    const isValidStart =
      parsedStartTime instanceof Date &&
      !Number.isNaN(parsedStartTime.getTime());
    const isValidEnd =
      parsedEndTime instanceof Date &&
      !Number.isNaN(parsedEndTime.getTime());

    if (!isValidStart || !isValidEnd || parsedEndTime <= parsedStartTime) {
      return;
    }

    setStartDateTime(parsedStartTime);
    setEndDateTime(parsedEndTime);
    setDeadlineDate(parsedEndTime);

    const durationMinutes = Math.max(
      15,
      Math.round(
        (parsedEndTime.getTime() - parsedStartTime.getTime()) / (1000 * 60)
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
    if (!isFromCalendar || !selectedDateParam || isFromFreeTime) return;

    const parsedSelectedDate = new Date(String(selectedDateParam));

    if (
      !(parsedSelectedDate instanceof Date) ||
      Number.isNaN(parsedSelectedDate.getTime())
    ) {
      return;
    }

    const now = new Date();

    const nextStart = new Date(parsedSelectedDate);
    nextStart.setHours(now.getHours(), now.getMinutes(), 0, 0);

    const nextEnd = new Date(nextStart);
    nextEnd.setHours(nextEnd.getHours() + 1);

    const nextDeadline = new Date(parsedSelectedDate);
    nextDeadline.setHours(23, 59, 59, 999);

    setStartDateTime(nextStart);
    setEndDateTime(nextEnd);
    setDeadlineDate(nextDeadline);
  }, [isFromCalendar, selectedDateParam, isFromFreeTime]);

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

  const formatDate = (date) => {
    return date.toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const pad2 = (value) => String(value).padStart(2, "0");

  const formatTime = (value) => {
    const date = normalizeDate(value);

    if (!date) return "";

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

    if (!date) return "-";

    return date.toLocaleDateString(locale, {
      day: "numeric",
      month: "short",
    });
  };

  const getPickerValue = (target) => {
    if (target === "start") return startDateTime;
    if (target === "end") return endDateTime;
    if (target === "deadline") return deadlineDate;

    if (target === "planningStart") {
      return preferredStartTime;
    }

    if (target === "planningEnd") {
      return preferredEndTime;
    }

    return new Date();
  };

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

      return;
    }

    if (target === "end") {
      const newEndDateTime = new Date(endDateTime);

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

    if (target === "planningStart") {
      const nextStartTime = new Date(preferredStartTime);

      nextStartTime.setHours(
        selectedHour,
        selectedMinute,
        0,
        0
      );

      setPreferredStartTime(nextStartTime);
      return;
    }

    if (target === "planningEnd") {
      const nextEndTime = new Date(preferredEndTime);

      nextEndTime.setHours(
        selectedHour,
        selectedMinute,
        0,
        0
      );

      setPreferredEndTime(nextEndTime);
      return;
    }

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

  const handleAcademicTaskTypeChange = (nextType) => {
    setAcademicTaskType(nextType);

    if (nextType === "normal") {
      return;
    }

    if (nextType === "exam") {
      setPlanningEnabled(false);
      setRepeatType(RECURRENCE_TYPES.NONE);
      setPriority("High");
      setDeadlineDate(endDateTime);
      return;
    }

    if (nextType === "study_plan") {
      setPlanningEnabled(true);
      setHasDeadline(true);
      setRepeatType(RECURRENCE_TYPES.NONE);
      setPriority("High");
      setDeadlineDate(endDateTime);
      return;
    }
  };

  const handlePlanningToggle = () => {
    setPlanningEnabled((prev) => {
      const nextValue = !prev;

      if (nextValue) {
        setAcademicTaskType("study_plan");
        setHasDeadline(true);
        setRepeatType(RECURRENCE_TYPES.NONE);
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

  const handleRepeatTypeChange = (nextType) => {
    if (planningEnabled && nextType !== RECURRENCE_TYPES.NONE) {
      Alert.alert(
        text("Planning Mode is enabled", "เปิดโหมดวางแผนอยู่"),
        text(
          "Planning tasks cannot be repeated. Please turn off Planning Mode first.",
          "กิจกรรมแบบวางแผนไม่สามารถตั้งค่าทำซ้ำได้ กรุณาปิดโหมดวางแผนก่อน"
        )
      );
      return;
    }

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
    const planningStartDate = new Date(safeStartTime);

    planningStartDate.setHours(
      preferredStartTime.getHours(),
      preferredStartTime.getMinutes(),
      0,
      0
    );

    const planningEndDate = addMinutes(
      planningStartDate,
      Number(sessionDurationMinutes || 60)
    );
    const finalRepeatType =
      taskMode === "time" ? RECURRENCE_TYPES.NONE : repeatType;

    return {
      title: title.trim(),
      detail: detail.trim(),


      start_time: planningEnabled
        ? planningStartDate
        : safeStartTime,

      end_time: planningEnabled
        ? planningEndDate
        : safeEndTime,

      is_all_day: planningEnabled
        ? false
        : isAllDay,

      task_type: getTaskTypeForPayload(),
      academic_task_type: academicTaskType,

      is_recurring: finalRepeatType !== RECURRENCE_TYPES.NONE,
      recurrence_type: finalRepeatType,
      recurrence_interval_days:
        finalRepeatType === RECURRENCE_TYPES.CUSTOM_DAYS
          ? Number(customDays)
          : finalRepeatType === RECURRENCE_TYPES.DAILY
            ? 1
            : null,
      recurrence_weekdays:
        finalRepeatType === RECURRENCE_TYPES.WEEKLY ? selectedWeekdays : null,
      recurrence_week_interval:
        finalRepeatType === RECURRENCE_TYPES.WEEKLY ? Number(weekInterval) : null,
      recurrence_month_day:
        finalRepeatType === RECURRENCE_TYPES.MONTHLY ? Number(monthDay) : null,
      recurrence_month_interval:
        finalRepeatType === RECURRENCE_TYPES.MONTHLY ? Number(monthInterval) : null,

      priority: priority,
      deadline: hasDeadline ? deadlineDate : null,
      estimated_duration_minutes: planningEnabled
        ? Number(sessionDurationMinutes)
        : Number(estimatedDuration),

      planning_enabled: planningEnabled,
      total_planned_minutes: planningEnabled
        ? Number(totalPlannedMinutes)
        : null,
      session_duration_minutes: planningEnabled
        ? Number(sessionDurationMinutes)
        : null,
      plan_before_deadline_days: planningEnabled ? 0 : null,
      auto_schedule: planningEnabled,
      add_review_session: false,

      preferred_study_window: planningEnabled
        ? "custom"
        : null,

      preferred_study_start_hour: planningEnabled
        ? preferredStartTime.getHours()
        : null,

      preferred_study_start_minute: planningEnabled
        ? preferredStartTime.getMinutes()
        : null,

      preferred_study_end_hour: planningEnabled
        ? preferredEndTime.getHours()
        : null,

      preferred_study_end_minute: planningEnabled
        ? preferredEndTime.getMinutes()
        : null,

      is_generated_session: false,
      parent_task_id: null,

      created_at: new Date(),
      updated_at: new Date(),
    };
  };

  const resetPlanningDraftState = () => {
    setPlanningDraftVisible(false);
    setPlanningDraftPayload(null);
    setPlanningDraftSessions([]);
    setPlanningDraftResult(null);
    setPlanningDraftChecking(false);
  };

  const runPlanningDraftCheck = async (payload, sessions) => {
    if (!payload || !Array.isArray(sessions)) {
      return null;
    }

    try {
      setPlanningDraftChecking(true);

      const result = await checkPlanningDraftConflicts(
        payload,
        sessions
      );

      setPlanningDraftResult(result);

      if (
        Array.isArray(result?.sessions) &&
        result.sessions.length === sessions.length
      ) {
        setPlanningDraftSessions(result.sessions);
      }

      return result;
    } catch (error) {
      console.error("Planning draft check error:", error);

      const failedResult = {
        success: false,
        is_valid: false,
        has_conflict: false,
        message: error?.message || "PLANNING_DRAFT_INVALID",
        validation_errors: [
          {
            type: error?.message || "PLANNING_DRAFT_INVALID",
          },
        ],
        sessions,
      };

      setPlanningDraftResult(failedResult);
      return failedResult;
    } finally {
      setPlanningDraftChecking(false);
    }
  };

  const openPlanningDraftPreview = async (taskPayload) => {
    const draft = await createPlanningDraft(taskPayload);

    if (
      draft?.success !== true ||
      !Array.isArray(draft?.sessions) ||
      draft.sessions.length === 0
    ) {
      const error = new Error(
        draft?.message || "PLANNING_DRAFT_INVALID"
      );
      throw error;
    }

    setPlanningDraftPayload(taskPayload);
    setPlanningDraftSessions(draft.sessions);

    const checkedDraft = await runPlanningDraftCheck(
      taskPayload,
      draft.sessions
    );

    if (!checkedDraft) {
      throw new Error("PLANNING_DRAFT_INVALID");
    }

    setPlanningDraftVisible(true);
  };

  const updatePlanningDraftSession = async (
    sessionIndex,
    mode,
    selectedValue
  ) => {
    if (
      !planningDraftPayload ||
      !selectedValue ||
      planningDraftChecking ||
      isSaving
    ) {
      return;
    }

    const currentSession = planningDraftSessions[sessionIndex];
    const currentStart = normalizeDate(currentSession?.start_time);
    const currentEnd = normalizeDate(currentSession?.end_time);

    if (!isValidDate(currentStart) || !isValidDate(currentEnd)) {
      return;
    }

    const durationMinutes = Math.max(
      1,
      Math.round(
        (currentEnd.getTime() - currentStart.getTime()) /
        (1000 * 60)
      )
    );

    const nextStart = new Date(currentStart);

    if (mode === "date") {
      nextStart.setFullYear(selectedValue.getFullYear());
      nextStart.setMonth(selectedValue.getMonth());
      nextStart.setDate(selectedValue.getDate());
    } else {
      nextStart.setHours(
        selectedValue.getHours(),
        selectedValue.getMinutes(),
        0,
        0
      );
    }

    const nextEnd = addMinutes(nextStart, durationMinutes);

    const nextSessions = planningDraftSessions
      .map((session, index) =>
        index === sessionIndex
          ? {
            ...session,
            start_time: nextStart,
            end_time: nextEnd,
            estimated_duration_minutes: durationMinutes,
            session_duration_minutes: durationMinutes,
          }
          : session
      )
      .sort(
        (first, second) =>
          normalizeDate(first.start_time).getTime() -
          normalizeDate(second.start_time).getTime()
      );

    setPlanningDraftSessions(nextSessions);
    setPlanningDraftResult(null);

    await runPlanningDraftCheck(
      planningDraftPayload,
      nextSessions
    );
  };

  const openPlanningDraftPicker = (sessionIndex, mode) => {
    const session = planningDraftSessions[sessionIndex];
    const sessionStart = normalizeDate(session?.start_time);

    if (!isValidDate(sessionStart)) {
      return;
    }

    DateTimePickerAndroid.open({
      value: sessionStart,
      mode,
      is24Hour: true,
      display: "default",
      onChange: (event, selectedValue) => {
        if (event?.type === "dismissed" || !selectedValue) {
          return;
        }

        updatePlanningDraftSession(
          sessionIndex,
          mode,
          selectedValue
        );
      },
    });
  };

  const handleConfirmPlanningDraft = async () => {
    if (
      !ensureLoggedIn() ||
      !planningDraftPayload ||
      planningDraftSessions.length === 0 ||
      planningDraftChecking ||
      isSaving
    ) {
      return;
    }

    try {
      setIsSaving(true);

      const checkedDraft = await checkPlanningDraftConflicts(
        planningDraftPayload,
        planningDraftSessions
      );

      setPlanningDraftResult(checkedDraft);

      if (
        checkedDraft?.is_valid !== true ||
        checkedDraft?.has_conflict === true ||
        checkedDraft?.success !== true
      ) {
        Alert.alert(
          text("Plan needs changes", "แผนยังต้องแก้ไข"),
          checkedDraft?.has_conflict === true
            ? text(
              "Some sessions conflict with existing tasks. Please change the highlighted sessions before confirming.",
              "บางรอบชนกับกิจกรรมเดิม กรุณาแก้รอบที่แจ้งเตือนก่อนยืนยัน"
            )
            : text(
              "Some sessions are outside the selected dates or preferred daily time range.",
              "บางรอบอยู่นอกช่วงวันที่หรือเวลาที่สะดวก กรุณาแก้ไขก่อนยืนยัน"
            )
        );
        return;
      }

      const result = await addTask(planningDraftPayload, {
        planningSessions:
          checkedDraft.sessions || planningDraftSessions,
      });

      if (result?.success === true) {
        resetPlanningDraftState();
        handleAfterSave();
        return;
      }

      if (result?.has_conflict === true) {
        setPlanningDraftResult({
          ...result,
          is_valid: true,
          success: false,
        });

        Alert.alert(
          text("Time conflict detected", "พบเวลาทับซ้อน"),
          text(
            "The schedule changed while you were reviewing it. Please edit the conflicting sessions and confirm again.",
            "ระหว่างตรวจสอบมีตารางเวลาเปลี่ยนแปลง กรุณาแก้รอบที่ชนแล้วกดยืนยันอีกครั้ง"
          )
        );
        return;
      }

      throw new Error(result?.message || "PLANNING_DRAFT_INVALID");
    } catch (error) {
      console.error("Confirm planning draft error:", error);

      if (error?.message === "AUTH_REQUIRED") {
        router.replace("/login");
        return;
      }

      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        getReadableSaveErrorMessage(error)
      );
    } finally {
      setIsSaving(false);
    }
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

  const handleSaveAnyway = async () => {
    if (!ensureLoggedIn()) return;
    if (!pendingTaskPayload || isSaving) return;

    try {
      setIsSaving(true);

      const result = await addTask(pendingTaskPayload, {
        saveAnyway: true,
      });

      if (result?.success === true) {
        resetConflictState();
        handleAfterSave();
        return;
      }

      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text(
          "Unable to save this task. Please try again.",
          "ไม่สามารถบันทึกกิจกรรมนี้ได้ กรุณาลองใหม่อีกครั้ง"
        )
      );
    } catch (error) {
      console.error("Save anyway error:", error);

      if (error?.message === "AUTH_REQUIRED") {
        router.replace("/login");
        return;
      }

      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        getReadableSaveErrorMessage(error)
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!ensureLoggedIn()) return;
    if (isSaving) return;

    if (!title.trim()) {
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text("Please enter a title.", "กรุณากรอกชื่อกิจกรรม")
      );
      return;
    }

    const { safeStartTime, safeEndTime } = getSafeTaskTimeRange();

    if (
      !planningEnabled &&
      safeEndTime <= safeStartTime
    ) {
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text(
          "End time must be later than start time.",
          "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น"
        )
      );
      return;
    }

    if (taskMode === "time" && repeatType !== RECURRENCE_TYPES.NONE) {
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text(
          "Planning Mode cannot be used with Repeat. Please choose Does not repeat.",
          "โหมดวางแผนไม่สามารถใช้ร่วมกับการทำซ้ำได้ กรุณาเลือกไม่ทำซ้ำ"
        )
      );
      return;
    }

    if (academicTaskType === "study_plan" && planningEnabled !== true) {
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text(
          "Study Plan requires Planning Mode.",
          "แผนอ่านหนังสือต้องเปิดโหมดวางแผน"
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

    if (
      !planningEnabled &&
      (!estimatedDuration || Number(estimatedDuration) <= 0)
    ) {
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text(
          "Please select estimated duration.",
          "กรุณาเลือกระยะเวลาที่คาดว่าจะใช้"
        )
      );
      return;
    }

    if (planningEnabled && !hasDeadline) {
      Alert.alert(
        text("Deadline Required", "ต้องมีเดดไลน์"),
        text(
          "Planning Mode requires a deadline so the app can distribute sessions before the final date.",
          "กิจกรรมแบบวางแผนต้องมีเดดไลน์ เพื่อให้ระบบกระจายกิจกรรมย่อยก่อนวันสุดท้ายได้"
        )
      );
      return;
    }

    if (planningEnabled) {
      const planningStartDay = new Date(startDateTime);
      planningStartDay.setHours(0, 0, 0, 0);

      const planningDeadlineDay = new Date(deadlineDate);
      planningDeadlineDay.setHours(0, 0, 0, 0);

      if (planningDeadlineDay < planningStartDay) {
        Alert.alert(
          text("Error", "เกิดข้อผิดพลาด"),
          text(
            "The last day of the plan cannot be earlier than the planning start date.",
            "วันสุดท้ายของแผนต้องไม่อยู่ก่อนวันที่เริ่มวางแผน"
          )
        );
        return;
      }
      if (!totalPlannedMinutes || Number(totalPlannedMinutes) <= 0) {
        Alert.alert(
          text("Error", "เกิดข้อผิดพลาด"),
          text(
            "Please select total planned duration.",
            "กรุณาเลือกระยะเวลารวมของแผน"
          )
        );
        return;
      }

      if (!sessionDurationMinutes || Number(sessionDurationMinutes) <= 0) {
        Alert.alert(
          text("Error", "เกิดข้อผิดพลาด"),
          text(
            "Please select session duration.",
            "กรุณาเลือกระยะเวลาต่อรอบ"
          )
        );
        return;
      }

      if (Number(sessionDurationMinutes) > Number(totalPlannedMinutes)) {
        Alert.alert(
          text("Error", "เกิดข้อผิดพลาด"),
          text(
            "Session duration cannot be longer than total planned duration.",
            "ระยะเวลาต่อรอบต้องไม่มากกว่าระยะเวลารวม"
          )
        );
        return;
      }
      const preferredStartMinutes =
        preferredStartTime.getHours() * 60 +
        preferredStartTime.getMinutes();

      const preferredEndMinutes =
        preferredEndTime.getHours() * 60 +
        preferredEndTime.getMinutes();

      if (preferredEndMinutes <= preferredStartMinutes) {
        Alert.alert(
          text("Error", "เกิดข้อผิดพลาด"),
          text(
            "Preferred end time must be later than preferred start time.",
            "เวลาสิ้นสุดของช่วงที่สะดวกต้องมากกว่าเวลาเริ่ม"
          )
        );
        return;
      }

      const availableMinutesPerDay =
        preferredEndMinutes - preferredStartMinutes;

      if (
        availableMinutesPerDay <
        Number(sessionDurationMinutes)
      ) {
        Alert.alert(
          text("Error", "เกิดข้อผิดพลาด"),
          text(
            "The preferred time range must be at least as long as one session.",
            "ช่วงเวลาที่สะดวกต้องยาวอย่างน้อยเท่ากับระยะเวลาต่อรอบ"
          )
        );
        return;
      }
    }

    const taskPayload = buildTaskPayload();

    try {
      setIsSaving(true);

      if (planningEnabled) {
        await openPlanningDraftPreview(taskPayload);
        return;
      }

      const result = await addTask(taskPayload);

      if (result?.has_conflict === true && result?.success === false) {
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
          "Unable to save this task. Please try again.",
          "ไม่สามารถบันทึกกิจกรรมนี้ได้ กรุณาลองใหม่อีกครั้ง"
        )
      );
    } catch (error) {
      if (error?.message === "PLANNING_NOT_ENOUGH_FREE_TIME") {
        console.warn("Planning schedule warning:", error.message);
      } else {
        console.error("Add task error:", error);
      }

      if (error?.message === "AUTH_REQUIRED") {
        router.replace("/login");
        return;
      }

      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        getReadableSaveErrorMessage(error)
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    handleBack();
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

  const plannedSessionCount = Math.ceil(
    Number(totalPlannedMinutes) / Number(sessionDurationMinutes || 1)
  );

  const planningDraftValidationErrors =
    planningDraftResult?.validation_errors || [];

  const planningDraftHasConflict =
    planningDraftResult?.has_conflict === true;

  const planningDraftIsValid =
    planningDraftResult?.is_valid === true &&
    planningDraftValidationErrors.length === 0;

  const canConfirmPlanningDraft =
    planningDraftIsValid &&
    !planningDraftHasConflict &&
    planningDraftResult?.success === true &&
    !planningDraftChecking &&
    !isSaving;

  const getPlanningDraftSessionConflict = (sessionIndex) => {
    return planningDraftResult?.conflict_instances?.find(
      (item) => item.instance_index === sessionIndex + 1
    );
  };

  const getPlanningDraftValidationMessage = () => {
    if (planningDraftValidationErrors.length === 0) {
      return "";
    }

    const firstType = planningDraftValidationErrors[0]?.type;

    if (firstType === "DRAFT_SESSIONS_OVERLAP") {
      return text(
        "Two sessions overlap each other. Please move one of them.",
        "มีกิจกรรมย่อยในแผนชนกัน กรุณาเลื่อนเวลาอย่างน้อยหนึ่งรอบ"
      );
    }

    if (firstType === "SESSION_OUTSIDE_PLANNING_WINDOW") {
      return text(
        "A session is outside the selected plan dates or preferred daily time range.",
        "มีกิจกรรมย่อยอยู่นอกช่วงวันที่หรือเวลาที่สะดวกที่กำหนด"
      );
    }

    if (firstType === "SESSION_DURATION_MISMATCH") {
      return text(
        "A session duration does not match the planned duration.",
        "ระยะเวลาของกิจกรรมย่อยไม่ตรงกับระยะเวลาที่ระบบวางแผนไว้"
      );
    }

    return text(
      "The draft plan is invalid. Please adjust the sessions.",
      "แผนชั่วคราวยังไม่ถูกต้อง กรุณาปรับวันหรือเวลาแล้วตรวจสอบอีกครั้ง"
    );
  };


  const getReadableSaveErrorMessage = (error) => {
    if (error?.message === "INVALID_ALL_DAY_TIME_RANGE") {
      return text(
        "The selected day has already passed the all-day time range. Please choose another date.",
        "วันนี้เลยช่วงเวลาทั้งวันแล้ว กรุณาเลือกวันอื่น"
      );
    }
    if (error?.message === "PLANNING_NOT_ENOUGH_FREE_TIME") {
      return text(
        "There is not enough available time before the deadline to create all planning sessions. Please extend the deadline or reduce the planned time.",
        "เวลาว่างก่อนกำหนดส่งไม่พอสำหรับสร้างกิจกรรมย่อยวางแผนทั้งหมด กรุณาเลื่อนกำหนดส่งหรือลดเวลาที่ต้องวางแผน"
      );
    }
    if (
      error?.message === "PLANNING_DRAFT_INVALID" ||
      error?.message === "PLANNING_DRAFT_REQUIRED" ||
      error?.message === "PLANNING_DRAFT_SESSION_COUNT_MISMATCH" ||
      error?.message === "PLANNING_DRAFT_INVALID_SESSION_TIME"
    ) {
      return text(
        "The plan could not be prepared correctly. Please review the plan settings and try again.",
        "ไม่สามารถเตรียมแผนได้อย่างถูกต้อง กรุณาตรวจสอบข้อมูลการวางแผนแล้วลองใหม่"
      );
    }
    return text(
      "Unable to save this task. Please try again.",
      "ไม่สามารถบันทึกกิจกรรมนี้ได้ กรุณาลองใหม่อีกครั้ง"
    );
  };
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



  if (!isAuthReady) {
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
          <Text style={styles.navTitle}>
            {text("New Task", "เพิ่มกิจกรรม")}
          </Text>
        </View>

        {/*เพิ่มปุ่มเลือกโหมดใต้หัวข้อเพิ่มกิจกรรม*/}
        <View style={styles.modeSwitchCard}>
          <Pressable
            style={[
              styles.modeButton,
              taskMode === "todo" && styles.modeButtonActive,
            ]}
            onPress={() => {
              setTaskMode("todo");
              setPlanningEnabled(false);
              setAcademicTaskType("normal");
              setRepeatDropdownOpen(false);
              setDurationDropdownOpen(false);
              setTotalPlanDropdownOpen(false);
              setSessionDropdownOpen(false);

            }}
          >
            <Text
              style={[
                styles.modeButtonText,
                taskMode === "todo" && styles.modeButtonTextActive,
              ]}
            >
              กิจกรรมทั่วไป
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.modeButton,
              taskMode === "time" && styles.modeButtonActive,
            ]}

            onPress={() => {
              setTaskMode("time");
              setIsAllDay(false);
              setPlanningEnabled(true);
              setHasDeadline(true);
              setAcademicTaskType("study_plan");
              setRepeatType(RECURRENCE_TYPES.NONE);
              setRepeatDropdownOpen(false);
              setDurationDropdownOpen(false);
              setTotalPlanDropdownOpen(false);
              setSessionDropdownOpen(false);


            }}
          >
            <Text
              style={[
                styles.modeButtonText,
                taskMode === "time" && styles.modeButtonTextActive,
              ]}
            >
              กิจกรรมแบบวางแผน
            </Text>
          </Pressable>
        </View>

        {isFromFreeTime ? (
          <View style={styles.freeTimeNoticeCard}>
            <View style={styles.freeTimeNoticeIcon}>
              <Text style={styles.freeTimeNoticeIconText}>✨</Text>
            </View>

            <View style={styles.freeTimeNoticeTextBox}>
              <Text style={styles.freeTimeNoticeTitle}>
                {text(
                  "Suggested Free Time Applied",
                  "ใช้ช่วงเวลาว่างที่แนะนำแล้ว"
                )}
              </Text>
              <Text style={styles.freeTimeNoticeText}>
                {text(
                  "Start and end time were filled from the selected free slot.",
                  "ระบบกรอกเวลาเริ่มต้นและเวลาสิ้นสุดจากช่วงเวลาว่างที่เลือกไว้"
                )}
              </Text>
            </View>
          </View>
        ) : null}

        <SectionCard
          title="ข้อมูล"
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
          title={taskMode === "time" ? "ช่วงวันที่ของแผน" : "ตารางเวลา"}
          icon="time-outline"
          open={scheduleSectionOpen}
          onToggle={() =>
            setScheduleSectionOpen((current) => !current)
          }
        >
          {taskMode === "time" ? (
            <>
              <View style={styles.row}>
                <View style={styles.deadlineLabelBox}>
                  <Text style={styles.label}>
                    เริ่มวางแผน
                  </Text>

                  <Pressable
                    style={styles.infoButtonSmall}
                    onPress={() =>
                      Alert.alert(
                        "เริ่มวางแผนตั้งแต่",
                        "ระบบจะเริ่มค้นหาช่วงเวลาว่างสำหรับกิจกรรมย่อยตั้งแต่วันที่เลือกเป็นต้นไป"
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

                <Pressable
                  style={styles.deadlineBox}
                  onPress={() => openPicker("start", "date")}
                >
                  <Text style={styles.pickerText}>
                    {formatDate(startDateTime)}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.line} />

              <View style={styles.row}>
                <View style={styles.deadlineLabelBox}>
                  <Text style={styles.label}>
                    วันสุดท้ายของแผน
                  </Text>

                  <Pressable
                    style={styles.infoButtonSmall}
                    onPress={() =>
                      Alert.alert(
                        "วันสุดท้ายของแผน",
                        "กิจกรรมย่อยทั้งหมดต้องถูกจัดให้อยู่ภายในวันที่นี้"
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

                <Pressable
                  style={styles.deadlineBox}
                  onPress={() => openPicker("deadline", "date")}
                >
                  <Text style={styles.pickerText}>
                    {formatDate(deadlineDate)}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={styles.allDayRow}>
                <View style={styles.allDayTextBox}>
                  <Text style={styles.allDayTitle}>
                    {text("All day", "ทั้งวัน")}
                  </Text>
                </View>

                <Pressable
                  style={[
                    styles.allDayToggle,
                    isAllDay && styles.allDayToggleActive,
                  ]}
                  onPress={() =>
                    setIsAllDay((current) => !current)
                  }
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
                <Text style={styles.label}>
                  {text("Start", "เริ่ม")}
                </Text>

                <Pressable
                  style={styles.pickerBox}
                  onPress={() => openPicker("start", "date")}
                >
                  <Text style={styles.pickerText}>
                    {formatDate(startDateTime)}
                  </Text>
                </Pressable>

                {!isAllDay ? (
                  <Pressable
                    style={styles.timeBox}
                    onPress={() => openPicker("start", "time")}
                  >
                    <Text style={styles.pickerText}>
                      {formatTime(startDateTime)}
                    </Text>
                  </Pressable>
                ) : (
                  <View style={styles.timeBoxDisabled}>
                    <Text style={styles.disabledTimeText}>
                      {formatTime(
                        getSafeTaskTimeRange().safeStartTime
                      )}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.line} />

              {!isAllDay ? (
                <View style={styles.row}>
                  <Text style={styles.label}>
                    {text("End", "สิ้นสุด")}
                  </Text>

                  <Pressable
                    style={styles.pickerBox}
                    onPress={() => openPicker("end", "date")}
                  >
                    <Text style={styles.pickerText}>
                      {formatDate(endDateTime)}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.timeBox}
                    onPress={() => openPicker("end", "time")}
                  >
                    <Text style={styles.pickerText}>
                      {formatTime(endDateTime)}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

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
                            "Turn this on when the task must be completed by a specific date.",
                            "เปิดเมื่อต้องการกำหนดวันที่ล่าสุดที่ควรทำกิจกรรมนี้ให้เสร็จ"
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
                  ]}
                  onPress={() => setHasDeadline((current) => !current)}
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
                    <View style={styles.deadlineLabelBox}>
                      <Text style={styles.label}>
                        {repeatType !== RECURRENCE_TYPES.NONE
                          ? text(
                              "Deadline for each occurrence",
                              "เดดไลน์ของแต่ละรอบ"
                            )
                          : text("Deadline", "เดดไลน์")}
                      </Text>
                    </View>

                    <Pressable
                      style={styles.deadlineBox}
                      onPress={() => openPicker("deadline", "date")}
                    >
                      <Text style={styles.pickerText}>
                        {formatDate(deadlineDate)}
                      </Text>
                    </Pressable>
                  </View>
                </>
              ) : null}
            </>
          )}
        </SectionCard>

        <SectionCard
          title="การจัดเวลา"
          icon="calendar-outline"
          open={timeSectionOpen}
          onToggle={() => setTimeSectionOpen((current) => !current)}
        >
          <Text style={styles.subSectionTitle}>{text("Priority", "ความสำคัญ")}</Text>

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
                    active && option.value === "Medium" && styles.priorityMediumActive,
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

          {taskMode === "todo" ? (
            <>
              <View style={styles.line} />

              <View style={styles.labelWithInfo}>
                <Text style={styles.subSectionTitleNoMargin}>
                  ระยะเวลาที่คาดว่าจะใช้
                </Text>

                <Pressable
                  style={styles.infoButton}
                  onPress={() =>
                    Alert.alert(
                      "ระยะเวลาที่คาดว่าจะใช้",
                      getDurationDescription()
                    )
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
                onPress={() =>
                  setDurationDropdownOpen((current) => !current)
                }
              >
                <Text style={styles.dropdownButtonText}>
                  {formatDuration(estimatedDuration)}
                </Text>

                <Ionicons
                  name={
                    durationDropdownOpen
                      ? "chevron-up"
                      : "chevron-down"
                  }
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
                        estimatedDuration === duration &&
                        styles.dropdownItemActive,
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
            </>
          ) : null}

          {taskMode === "todo" ? (
            <>
              <View style={styles.line} />

              <Text style={styles.subSectionTitle}>การทำซ้ำ</Text>
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
                        style={[styles.dropdownItemRow, active && styles.dropdownItemActive]}
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
                          style={[styles.weekdayButton, active && styles.weekdayButtonActive]}
                          onPress={() => handleToggleWeekday(day.value)}
                        >
                          <Text
                            style={[styles.weekdayText, active && styles.weekdayTextActive]}
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
            </>
          ) : null}

        </SectionCard>

        {taskMode === "time" ? (
          <SectionCard
            title="การวางแผนกิจกรรม"
            icon="radio-button-on-outline"
            open={planningSectionOpen}
            onToggle={() => setPlanningSectionOpen((current) => !current)}
          >
            <View style={styles.labelWithInfo}>
              <Text style={styles.subSectionTitleNoMargin}>ระยะเวลารวมของแผน</Text>

              <Pressable
                style={styles.infoButton}
                onPress={() =>
                  Alert.alert(
                    "ระยะเวลารวมของแผน",
                    "คือเวลาทั้งหมดที่คาดว่าจะใช้กับกิจกรรมนี้ เช่น อ่านหนังสือทั้งหมด 10 ชั่วโมง ระบบจะใช้ค่านี้แบ่งออกเป็นรอบย่อย"
                  )
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
              onPress={() => setTotalPlanDropdownOpen((current) => !current)}
            >
              <Text style={styles.dropdownButtonText}>
                {formatDuration(totalPlannedMinutes)}
              </Text>

              <Ionicons
                name={totalPlanDropdownOpen ? "chevron-up" : "chevron-down"}
                size={18}
                color={COLORS.textMuted}
              />
            </Pressable>

            {totalPlanDropdownOpen ? (
              <View style={styles.dropdownMenu}>
                <ScrollView
                  style={styles.dropdownMenuScroll}
                  nestedScrollEnabled={true}
                  showsVerticalScrollIndicator={true}
                  keyboardShouldPersistTaps="handled"
                >
                  {totalPlanOptions.map((duration) => (
                    <Pressable
                      key={duration}
                      style={[
                        styles.dropdownItem,
                        totalPlannedMinutes === duration && styles.dropdownItemActive,
                      ]}
                      onPress={() => {
                        setTotalPlannedMinutes(duration);
                        setTotalPlanDropdownOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          totalPlannedMinutes === duration &&
                          styles.dropdownItemTextActive,
                        ]}
                      >
                        {formatDuration(duration)}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>


            ) : null}

            <View style={styles.labelWithInfo}>
              <Text style={styles.subSectionTitleNoMargin}>ระยะเวลาต่อรอบ</Text>

              <Pressable
                style={styles.infoButton}
                onPress={() =>
                  Alert.alert(
                    "ระยะเวลาต่อรอบ",
                    "คือเวลาของแต่ละรอบย่อย เช่น ถ้าระยะเวลารวม 10 ชั่วโมง และเลือกรอบละ 1 ชั่วโมง ระบบจะแบ่งเป็นประมาณ 10 รอบ"
                  )
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
              onPress={() => setSessionDropdownOpen((current) => !current)}
            >
              <Text style={styles.dropdownButtonText}>
                {formatDuration(sessionDurationMinutes)}
              </Text>

              <Ionicons
                name={sessionDropdownOpen ? "chevron-up" : "chevron-down"}
                size={18}
                color={COLORS.textMuted}
              />
            </Pressable>

            {sessionDropdownOpen ? (
              <View style={styles.dropdownMenu}>
                {sessionOptions.map((duration) => (
                  <Pressable
                    key={duration}
                    style={[
                      styles.dropdownItem,
                      sessionDurationMinutes === duration && styles.dropdownItemActive,
                    ]}
                    onPress={() => {
                      setSessionDurationMinutes(duration);
                      setEstimatedDuration(duration);
                      setSessionDropdownOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.dropdownItemText,
                        sessionDurationMinutes === duration &&
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

            <View style={styles.labelWithInfo}>
              <Text style={styles.subSectionTitleNoMargin}>
                เวลาที่สะดวกในแต่ละวัน
              </Text>

              <Pressable
                style={styles.infoButton}
                onPress={() =>
                  Alert.alert(
                    "เวลาที่สะดวกในแต่ละวัน",
                    "ระบบจะจัดกิจกรรมย่อยเฉพาะในช่วงเวลานี้ของแต่ละวัน โดยหลีกเลี่ยงกิจกรรมเดิมที่มีอยู่"
                  )
                }
              >
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color={COLORS.textMuted}
                />
              </Pressable>
            </View>

            <View style={styles.preferredTimeRow}>
              <View style={styles.preferredTimeColumn}>
                <Text style={styles.preferredTimeLabel}>
                  เริ่ม
                </Text>

                <Pressable
                  style={styles.preferredTimeButton}
                  onPress={() =>
                    openPicker("planningStart", "time")
                  }
                >
                  <Ionicons
                    name="time-outline"
                    size={18}
                    color={COLORS.primary}
                  />

                  <Text style={styles.preferredTimeButtonText}>
                    {formatTime(preferredStartTime)}
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.preferredTimeSeparator}>
                ถึง
              </Text>

              <View style={styles.preferredTimeColumn}>
                <Text style={styles.preferredTimeLabel}>
                  สิ้นสุด
                </Text>

                <Pressable
                  style={styles.preferredTimeButton}
                  onPress={() =>
                    openPicker("planningEnd", "time")
                  }
                >
                  <Ionicons
                    name="time-outline"
                    size={18}
                    color={COLORS.primary}
                  />

                  <Text style={styles.preferredTimeButtonText}>
                    {formatTime(preferredEndTime)}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.planningInfoBox}>
              <Ionicons
                name="sparkles-outline"
                size={17}
                color={COLORS.primary}
              />

              <Text style={styles.planningInfoText}>
                ระบบจะกระจายกิจกรรมย่อยวันละ 1 รอบก่อน
                และจะจัดหลายรอบในวันเดียวกันเฉพาะเมื่อจำนวนวันไม่เพียงพอ
              </Text>
            </View>

            <View style={styles.planningSummaryBox}>
              <Text style={styles.planningSummaryTitle}>สรุปการวางแผน</Text>

              <Text style={styles.planningSummaryText}>
                ระบบจะแบ่งกิจกรรมนี้ออกเป็นประมาณ{" "}
                <Text style={styles.planningSummaryStrong}>
                  {plannedSessionCount} รอบ
                </Text>{" "}
                รอบละ{" "}
                <Text style={styles.planningSummaryStrong}>
                  {formatDuration(sessionDurationMinutes)}
                </Text>
              </Text>
            </View>
          </SectionCard>
        ) : null}


        <Pressable
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          <Text style={styles.saveText}>
            {isSaving
              ? planningEnabled
                ? text("Creating plan...", "กำลังจัดแผน...")
                : text("Checking...", "กำลังตรวจสอบ...")
              : planningEnabled
                ? text("Review Plan", "ตรวจสอบแผน")
                : text("Save Task", "บันทึกกิจกรรม")}
          </Text>
        </Pressable>

        <Pressable style={styles.cancelButton} onPress={handleCancel}>
          <Text style={styles.cancelText}>{text("Cancel", "ยกเลิก")}</Text>
        </Pressable>
      </ScrollView>



      <Modal
        visible={planningDraftVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPlanningDraftVisible(false)}
      >
        <View style={styles.planningDraftOverlay}>
          <View style={styles.planningDraftModalBox}>
            <View style={styles.planningDraftHeader}>
              <View style={styles.planningDraftHeaderTextBox}>
                <Text style={styles.planningDraftTitle}>
                  {text("Review Plan", "ตรวจสอบแผนกิจกรรม")}
                </Text>
              </View>

              <Pressable
                style={styles.planningDraftCloseButton}
                onPress={() => setPlanningDraftVisible(false)}
                disabled={isSaving}
              >
                <Ionicons
                  name="close"
                  size={24}
                  color={COLORS.text}
                />
              </Pressable>
            </View>

            {planningDraftResult?.summary
              ?.has_multiple_sessions_in_one_day ? (
              <View style={styles.planningDraftWarningBox}>
                <Ionicons
                  name="warning-outline"
                  size={19}
                  color={COLORS.warning}
                />
                <Text style={styles.planningDraftWarningText}>
                  {text(
                    "The available dates are not enough for one session per day, so some days contain more than one session.",
                    "จำนวนวันที่ว่างไม่พอสำหรับวันละ 1 รอบ ระบบจึงจำเป็นต้องจัดบางวันมากกว่า 1 รอบ"
                  )}
                </Text>
              </View>
            ) : null}

            {planningDraftChecking ? (
              <View style={styles.planningDraftCheckingBox}>
                <Text style={styles.planningDraftCheckingText}>
                  {text(
                    "Checking conflicts...",
                    "กำลังตรวจสอบเวลาทับซ้อน..."
                  )}
                </Text>
              </View>
            ) : null}

            {planningDraftHasConflict ? (
              <View style={styles.planningDraftErrorSummary}>
                <Ionicons
                  name="alert-circle-outline"
                  size={20}
                  color={COLORS.danger}
                />
                <Text style={styles.planningDraftErrorSummaryText}>
                  {text(
                    "Some sessions conflict with existing tasks. Edit the red sessions before confirming.",
                    "บางรอบชนกับกิจกรรมเดิม กรุณาแก้รอบสีแดงก่อนยืนยันแผน"
                  )}
                </Text>
              </View>
            ) : null}

            {!planningDraftChecking &&
              planningDraftValidationErrors.length > 0 ? (
              <View style={styles.planningDraftErrorSummary}>
                <Ionicons
                  name="alert-circle-outline"
                  size={20}
                  color={COLORS.danger}
                />
                <Text style={styles.planningDraftErrorSummaryText}>
                  {getPlanningDraftValidationMessage()}
                </Text>
              </View>
            ) : null}

            <ScrollView
              style={styles.planningDraftList}
              contentContainerStyle={styles.planningDraftListContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {planningDraftSessions.map((session, index) => {
                const sessionStart = normalizeDate(session.start_time);
                const sessionEnd = normalizeDate(session.end_time);
                const durationMinutes =
                  isValidDate(sessionStart) && isValidDate(sessionEnd)
                    ? Math.max(
                      1,
                      Math.round(
                        (sessionEnd.getTime() -
                          sessionStart.getTime()) /
                        (1000 * 60)
                      )
                    )
                    : 0;

                const conflictForSession =
                  getPlanningDraftSessionConflict(index);
                const sessionHasConflict =
                  (conflictForSession?.conflicts || []).length > 0;

                return (
                  <View
                    key={`${sessionStart?.getTime?.() || index}-${index}`}
                    style={[
                      styles.planningDraftSessionCard,
                      sessionHasConflict &&
                      styles.planningDraftSessionCardConflict,
                    ]}
                  >
                    <View style={styles.planningDraftSessionHeader}>
                      <View style={styles.planningDraftSessionNumberBox}>
                        <Text style={styles.planningDraftSessionNumber}>
                          {index + 1}
                        </Text>
                      </View>

                      <View style={styles.planningDraftSessionTextBox}>
                        <Text
                          style={styles.planningDraftSessionTitle}
                          numberOfLines={2}
                        >
                          {title.trim()}
                        </Text>
                        <Text style={styles.planningDraftSessionMeta}>
                          {text("Session", "รอบที่")} {index + 1}{" "}
                          {text("of", "จาก")} {planningDraftSessions.length}
                          {" · "}
                          {formatDuration(durationMinutes)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.planningDraftPickerRow}>
                      <Pressable
                        style={styles.planningDraftPickerButton}
                        onPress={() =>
                          openPlanningDraftPicker(index, "date")
                        }
                        disabled={planningDraftChecking || isSaving}
                      >
                        <Ionicons
                          name="calendar-outline"
                          size={18}
                          color={COLORS.primary}
                        />
                        <Text style={styles.planningDraftPickerText}>
                          {isValidDate(sessionStart)
                            ? formatDate(sessionStart)
                            : "-"}
                        </Text>
                      </Pressable>

                      <Pressable
                        style={styles.planningDraftPickerButton}
                        onPress={() =>
                          openPlanningDraftPicker(index, "time")
                        }
                        disabled={planningDraftChecking || isSaving}
                      >
                        <Ionicons
                          name="time-outline"
                          size={18}
                          color={COLORS.primary}
                        />
                        <Text style={styles.planningDraftPickerText}>
                          {isValidDate(sessionStart)
                            ? `${formatTime(sessionStart)} - ${formatTime(
                              sessionEnd
                            )}`
                            : "-"}
                        </Text>
                      </Pressable>
                    </View>

                    {sessionHasConflict ? (
                      <View style={styles.planningDraftConflictBox}>
                        <Text style={styles.planningDraftConflictTitle}>
                          {text(
                            "Conflicts with:",
                            "เวลานี้ชนกับ:"
                          )}
                        </Text>

                        {(conflictForSession.conflicts || []).map(
                          (conflict, conflictIndex) => (
                            <Text
                              key={`${conflict.task_id}-${conflictIndex}`}
                              style={styles.planningDraftConflictText}
                            >
                              • {conflict.title ||
                                text(
                                  "Untitled Task",
                                  "กิจกรรมไม่มีชื่อ"
                                )}{" "}
                              {formatTime(conflict.start_time)} -{" "}
                              {formatTime(conflict.end_time)}
                            </Text>
                          )
                        )}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>

            <View
              style={[
                styles.planningDraftFooter,
                {
                  paddingBottom: Math.max(insets.bottom, 48) + 12,
                },
              ]}
            >
              <Pressable
                style={styles.planningDraftBackButton}
                onPress={() => setPlanningDraftVisible(false)}
                disabled={isSaving}
              >
                <Text style={styles.planningDraftBackButtonText}>
                  {text("Back to edit", "กลับไปแก้ข้อมูล")}
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.planningDraftConfirmButton,
                  !canConfirmPlanningDraft &&
                  styles.planningDraftConfirmButtonDisabled,
                ]}
                onPress={handleConfirmPlanningDraft}
                disabled={!canConfirmPlanningDraft}
              >
                <Text style={styles.planningDraftConfirmButtonText}>
                  {isSaving
                    ? text("Saving...", "กำลังบันทึก...")
                    : text("Confirm Plan", "ยืนยันแผน")}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
                      {formatConflictDate(item.start_time)} ·{" "}
                      {formatTime(item.start_time)} -{" "}
                      {formatTime(item.end_time)}
                    </Text>

                    {item.conflict_instance_start_time ? (
                      <Text style={styles.conflictNewTime}>
                        {text("New", "เวลาใหม่")}:{" "}
                        {formatConflictDate(item.conflict_instance_start_time)}{" "}
                        · {formatTime(item.conflict_instance_start_time)} -{" "}
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
  dropdownMenuScroll: {
    maxHeight: 180,
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
  deadlineLabelBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    width: 118,
  },

  infoButtonSmall: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  /*  dropdownItemRow: {
     flexDirection: "row",
     alignItems: "center",
     borderBottomWidth: 1,
     borderBottomColor: COLORS.divider || COLORS.border,
   },
  */
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

  /*  dropdownItem: {
     paddingVertical: 13,
     paddingHorizontal: 14,
     borderBottomWidth: 1,
     borderBottomColor: COLORS.divider || COLORS.border,
   },
  */
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
  modeSwitchCard: {
    backgroundColor: COLORS.card,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 4,
    marginBottom: 16,
    flexDirection: "row",
  },

  modeButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },

  modeButtonActive: {
    backgroundColor: COLORS.primary,
  },

  modeButtonText: {
    fontSize: 15,
    fontWeight: "900",
    color: COLORS.primary,
  },

  modeButtonTextActive: {
    color: COLORS.textLight,
  },
  /* sectionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
    overflow: "hidden",
  }, */
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

  /* sectionBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  }, */
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
    paddingTop: 22,
    paddingBottom: 40,
  },
  topNav: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
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
  navTitle: {
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
  freeTimeNoticeTitle: {
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
  /* line: {
    height: 1,
    backgroundColor: COLORS.divider || COLORS.border,
  }, */
  line: {
    height: 0,
    backgroundColor: "transparent",
    marginVertical: 4,
  },
  /* row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    gap: 8,
  }, */
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
  /* pickerBox: {
    backgroundColor: COLORS.cardSoft,
    borderRadius: 14,
    padding: 10,
    width: 145,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  }, */
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
  /* timeBox: {
    backgroundColor: COLORS.cardSoft,
    borderRadius: 14,
    padding: 10,
    width: 90,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  }, */
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
  /* deadlineBox: {
    backgroundColor: COLORS.cardSoft,
    borderRadius: 14,
    padding: 10,
    width: 190,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  }, */
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
  /*  pickerText: {
     fontSize: 15,
     fontWeight: "700",
     color: COLORS.text,
   }, */
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
  planningHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  planningTitleBox: {
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
  planningSummaryTitle: {
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
  planningDraftOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay || "rgba(0, 0, 0, 0.45)",
    justifyContent: "flex-end",
  },
  planningDraftModalBox: {
    width: "100%",
    height: "90%",
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 0,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },
  planningDraftHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  planningDraftHeaderTextBox: {
    flex: 1,
  },
  planningDraftTitle: {
    fontSize: 25,
    fontWeight: "900",
    color: COLORS.text,
  },
  planningDraftCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  planningDraftWarningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#FFF7D6",
    borderWidth: 1,
    borderColor: "#FDE68A",
    marginBottom: 10,
  },
  planningDraftWarningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.text,
    fontWeight: "700",
  },
  planningDraftCheckingBox: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
  },
  planningDraftCheckingText: {
    textAlign: "center",
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.primary,
  },
  planningDraftErrorSummary: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
    marginBottom: 10,
  },
  planningDraftErrorSummaryText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.danger,
    fontWeight: "700",
  },
  planningDraftList: {
    flex: 1,
    minHeight: 0,
  },
  planningDraftListContent: {
    paddingBottom: 18,
  },
  planningDraftSessionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  planningDraftSessionCardConflict: {
    borderColor: "#F87171",
    backgroundColor: "#FFF7F7",
  },
  planningDraftSessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  planningDraftSessionNumberBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight || "#EAF4FF",
    alignItems: "center",
    justifyContent: "center",
  },
  planningDraftSessionNumber: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.primary,
  },
  planningDraftSessionTextBox: {
    flex: 1,
  },
  planningDraftSessionTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
  },
  planningDraftSessionMeta: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textMuted,
  },
  planningDraftPickerRow: {
    flexDirection: "row",
    gap: 8,
  },
  planningDraftPickerButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: COLORS.cardSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  planningDraftPickerText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.text,
    textAlign: "center",
  },
  planningDraftConflictBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#FEE2E2",
  },
  planningDraftConflictTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: COLORS.danger,
    marginBottom: 4,
  },
  planningDraftConflictText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: COLORS.danger,
  },
  planningDraftFooter: {
    flexDirection: "row",
    flexShrink: 0,
    gap: 10,
    paddingTop: 10,
    backgroundColor: COLORS.background,
  },
  planningDraftBackButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  planningDraftBackButtonText: {
    fontSize: 14,
    fontWeight: "900",
    color: COLORS.text,
  },
  planningDraftConfirmButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  planningDraftConfirmButtonDisabled: {
    opacity: 0.45,
  },
  planningDraftConfirmButtonText: {
    fontSize: 15,
    fontWeight: "900",
    color: COLORS.textLight,
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
  /* allDayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 14,
  }, */
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

  /* allDayTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.text,
  }, */
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

  /*   allDayDescription: {
      marginTop: 3,
      fontSize: 12,
      color: COLORS.textMuted,
      lineHeight: 17,
      fontWeight: "700",
    },
   */
  /* allDayDescription: {
    marginTop: 4,
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 17,
    fontWeight: "700",
  }, */
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
  planningInfoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    marginTop: 14,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
  },

  planningInfoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
  },
  preferredTimeRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    marginTop: 8,
    marginBottom: 14,
  },

  preferredTimeColumn: {
    flex: 1,
  },

  preferredTimeLabel: {
    marginBottom: 7,
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.textMuted,
  },

  preferredTimeButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.cardSoft,
  },

  preferredTimeButtonText: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.text,
  },

  preferredTimeSeparator: {
    paddingBottom: 16,
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textMuted,
  },
});
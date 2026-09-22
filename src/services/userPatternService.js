import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../config/firebase";

export const DEFAULT_USER_PATTERN = {
  wakeTime: "06:30",
  sleepTime: "23:30",
  availableStart: "07:00",
  availableEnd: "22:30",
  focusRanges: [
    {
      id: "focus-1",
      start: "07:00",
      end: "10:00",
    },
  ],
  focusDuration: 10,
  maxHoursPerDay: 6,
};

const clockToMinutes = (value) => {
  if (
    typeof value !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)
  ) {
    return NaN;
  }

  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

const validatePattern = (pattern) => {
  const wake = clockToMinutes(pattern.wakeTime);
  const sleep = clockToMinutes(pattern.sleepTime);
  const start = clockToMinutes(pattern.availableStart);
  const end = clockToMinutes(pattern.availableEnd);

  if (![wake, sleep, start, end].every(Number.isFinite)) {
    throw new Error("PATTERN_INVALID_TIME");
  }

  // ชุดแรกนี้รองรับช่วงเวลาภายในวันเดียว
  if (wake >= sleep || start >= end) {
    throw new Error("PATTERN_INVALID_ORDER");
  }

  if (start < wake || end > sleep) {
    throw new Error("PATTERN_OUTSIDE_AWAKE");
  }

  if (
    !Number.isInteger(pattern.focusDuration) ||
    pattern.focusDuration < 10 ||
    pattern.focusDuration > 180
  ) {
    throw new Error("PATTERN_INVALID_DURATION");
  }

  if (
    !Number.isInteger(pattern.maxHoursPerDay) ||
    pattern.maxHoursPerDay < 1 ||
    pattern.maxHoursPerDay > 16
  ) {
    throw new Error("PATTERN_INVALID_MAX_HOURS");
  }

  if (
    !Array.isArray(pattern.focusRanges) ||
    pattern.focusRanges.length === 0
  ) {
    throw new Error("PATTERN_INVALID_FOCUS");
  }

  const ranges = pattern.focusRanges.map((range) => {
    const rangeStart = clockToMinutes(range?.start);
    const rangeEnd = clockToMinutes(range?.end);

    if (
      !Number.isFinite(rangeStart) ||
      !Number.isFinite(rangeEnd) ||
      rangeStart >= rangeEnd ||
      rangeStart < start ||
      rangeEnd > end
    ) {
      throw new Error("PATTERN_INVALID_FOCUS");
    }

    return { start: rangeStart, end: rangeEnd };
  });

  ranges.sort((a, b) => a.start - b.start);

  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index].start < ranges[index - 1].end) {
      throw new Error("PATTERN_FOCUS_OVERLAP");
    }
  }

  // เลือกเฉพาะข้อมูลที่ต้องการบันทึก
  return {
    wakeTime: pattern.wakeTime,
    sleepTime: pattern.sleepTime,
    availableStart: pattern.availableStart,
    availableEnd: pattern.availableEnd,
    focusRanges: pattern.focusRanges.map((range, index) => ({
      id: `focus-${index + 1}`,
      start: range.start,
      end: range.end,
    })),
    focusDuration: pattern.focusDuration,
    maxHoursPerDay: pattern.maxHoursPerDay,
  };
};

const getUserRef = (userId) => {
  if (!userId || auth.currentUser?.uid !== userId) {
    throw new Error("AUTH_REQUIRED");
  }

  return doc(db, "users", userId);
};

export const loadUserPattern = async (userId) => {
  const snapshot = await getDoc(getUserRef(userId));
  const savedPattern = snapshot.data()?.user_pattern;

  return validatePattern(savedPattern ?? DEFAULT_USER_PATTERN);
};

export const saveUserPattern = async (userId, pattern) => {
  const validatedPattern = validatePattern(pattern);

  await setDoc(
    getUserRef(userId),
    {
      user_pattern: validatedPattern,
    },
    {
      merge: true,
    }
  );
};
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { auth } from "../src/config/firebase";
import {
  loadUserPattern
} from "../src/services/userPatternService";

import { COLORS } from "../src/constants/theme";
import { useLanguage } from "../src/i18n/LanguageContext";
import {
  saveUserPattern
} from "../src/services/userPatternService";
function SectionCard({ icon, iconColor, iconBackground, title, children }) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeaderRow}>
        <View style={[styles.sectionIcon, { backgroundColor: iconBackground }]}>
          <Ionicons name={icon} size={22} color={iconColor} />
        </View>

        <View style={styles.sectionTitleBox}>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
      </View>

      {children}
    </View>
  );
}

function TimeButton({ value, onPress, compact = false }) {
  return (
    <Pressable
      style={[styles.timeButton, compact && styles.timeButtonCompact]}
      onPress={onPress}
    >
      <Text style={styles.timeButtonText}>{value}</Text>
      <Ionicons name="time-outline" size={17} color={COLORS.textMuted} />
      <Ionicons name="chevron-down" size={15} color={COLORS.textMuted} />
    </Pressable>
  );
}

function StepperControl({
  value,
  unit,
  onDecrease,
  onIncrease,
  decreaseDisabled = false,
  increaseDisabled = false,
}) {
  return (
    <View style={styles.stepperRow}>
      <Pressable
        style={[
          styles.stepperButton,
          decreaseDisabled && styles.stepperButtonDisabled,
        ]}
        onPress={onDecrease}
        disabled={decreaseDisabled}
      >
        <Ionicons
          name="remove"
          size={22}
          color={decreaseDisabled ? COLORS.textMuted : COLORS.primary}
        />
      </Pressable>

      <View style={styles.stepperValueBox}>
        <Text style={styles.stepperValue}>{value}</Text>
        <Text style={styles.stepperUnit}>{unit}</Text>
      </View>

      <Pressable
        style={[
          styles.stepperButton,
          increaseDisabled && styles.stepperButtonDisabled,
        ]}
        onPress={onIncrease}
        disabled={increaseDisabled}
      >
        <Ionicons
          name="add"
          size={22}
          color={increaseDisabled ? COLORS.textMuted : COLORS.primary}
        />
      </Pressable>
    </View>
  );
}

const timeStringToDate = (value) => {
  const [hours, minutes] = String(value || "00:00")
    .split(":")
    .map((part) => Number(part));

  const date = new Date();
  date.setHours(Number.isFinite(hours) ? hours : 0);
  date.setMinutes(Number.isFinite(minutes) ? minutes : 0);
  date.setSeconds(0);
  date.setMilliseconds(0);
  return date;
};

const formatTimeValue = (date) => {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
};

export default function UserPatternScreen() {
  const router = useRouter();
  const { language } = useLanguage();
  const isThai = language === "th";
  const text = (en, th) => (isThai ? th : en);

  const [wakeTime, setWakeTime] = useState("06:30");
  const [sleepTime, setSleepTime] = useState("23:30");
  const [availableStart, setAvailableStart] = useState("07:00");
  const [availableEnd, setAvailableEnd] = useState("22:30");
  const [focusRanges, setFocusRanges] = useState([
    { id: "focus-1", start: "07:00", end: "10:00" },
  ]);
  const [focusDuration, setFocusDuration] = useState(10);
  const [maxHoursPerDay, setMaxHoursPerDay] = useState(6);
  const [pickerState, setPickerState] = useState(null);
  const [isLoadingPattern, setIsLoadingPattern] = useState(true);
  const [isSavingPattern, setIsSavingPattern] = useState(false);
  const [patternLoadError, setPatternLoadError] = useState(false);
  const [patternUserId, setPatternUserId] = useState(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let active = true;
    let requestNumber = 0;

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      const thisRequest = ++requestNumber;

      setIsLoadingPattern(true);
      setPatternLoadError(false);
      setPatternUserId(null);

      if (!currentUser) {
        router.replace("/login");
        return;
      }

      const fetchPattern = async () => {
        try {
          const pattern = await loadUserPattern(currentUser.uid);

          if (!active || thisRequest !== requestNumber) return;

          setWakeTime(pattern.wakeTime);
          setSleepTime(pattern.sleepTime);
          setAvailableStart(pattern.availableStart);
          setAvailableEnd(pattern.availableEnd);
          setFocusRanges(pattern.focusRanges);
          setFocusDuration(pattern.focusDuration);
          setMaxHoursPerDay(pattern.maxHoursPerDay);
          setPatternUserId(currentUser.uid);
        } catch (error) {
          if (!active || thisRequest !== requestNumber) return;

          console.error("Load user pattern error:", error);
          setPatternLoadError(true);
        } finally {
          if (active && thisRequest === requestNumber) {
            setIsLoadingPattern(false);
          }
        }
      };

      fetchPattern();
    });

    return () => {
      active = false;
      requestNumber += 1;
      unsubscribe();
    };
  }, [router, reloadCount]);

  const openTimePicker = ({ type, value, rangeId = null }) => {
    setPickerState({ type, value, rangeId });
  };

  const handleTimePickerChange = (event, selectedDate) => {
    if (event?.type === "dismissed" || !selectedDate) {
      setPickerState(null);
      return;
    }

    const nextValue = formatTimeValue(selectedDate);

    if (pickerState?.type === "wake") setWakeTime(nextValue);
    if (pickerState?.type === "sleep") setSleepTime(nextValue);
    if (pickerState?.type === "availableStart") setAvailableStart(nextValue);
    if (pickerState?.type === "availableEnd") setAvailableEnd(nextValue);

    if (
      pickerState?.type === "focusStart" ||
      pickerState?.type === "focusEnd"
    ) {
      setFocusRanges((current) =>
        current.map((range) => {
          if (range.id !== pickerState.rangeId) return range;

          return pickerState.type === "focusStart"
            ? { ...range, start: nextValue }
            : { ...range, end: nextValue };
        })
      );
    }

    setPickerState(null);
  };

  const addFocusRange = () => {
    const nextNumber = focusRanges.length + 1;

    setFocusRanges((current) => [
      ...current,
      {
        id: `focus-${Date.now()}-${nextNumber}`,
        start: "09:00",
        end: "10:00",
      },
    ]);
  };

  const removeFocusRange = (rangeId) => {
    setFocusRanges((current) => {
      if (current.length <= 1) return current;
      return current.filter((range) => range.id !== rangeId);
    });
  };


  const handleSave = async () => {
    if (
      isLoadingPattern ||
      isSavingPattern ||
      patternLoadError ||
      !patternUserId
    ) {
      return;
    }

    setIsSavingPattern(true);

    try {
      await saveUserPattern(patternUserId, {
        wakeTime,
        sleepTime,
        availableStart,
        availableEnd,
        focusRanges,
        focusDuration,
        maxHoursPerDay,
      });

      Alert.alert(
        text("Saved", "บันทึกแล้ว"),
        text(
          "Your time pattern has been saved.",
          "บันทึกรูปแบบเวลาส่วนตัวเรียบร้อยแล้ว"
        )
      );
    } catch (error) {
      console.error("Save user pattern error:", error);

      const messages = {
        PATTERN_INVALID_TIME: text(
          "Please enter valid times.",
          "กรุณาระบุเวลาให้ถูกต้อง"
        ),
        PATTERN_INVALID_ORDER: text(
          "Start must be before end. Overnight ranges are not supported yet.",
          "เวลาเริ่มต้องก่อนเวลาสิ้นสุด ชุดนี้ยังไม่รองรับช่วงเวลาข้ามเที่ยงคืน"
        ),
        PATTERN_OUTSIDE_AWAKE: text(
          "Scheduling hours must be between wake-up and bedtime.",
          "ช่วงจัดกิจกรรมต้องอยู่ระหว่างเวลาตื่นและเวลาเข้านอน"
        ),
        PATTERN_INVALID_FOCUS: text(
          "Focus periods must fit within your scheduling hours.",
          "ช่วงโฟกัสต้องเริ่มก่อนสิ้นสุด และอยู่ภายในช่วงจัดกิจกรรม"
        ),
        PATTERN_FOCUS_OVERLAP: text(
          "Focus periods must not overlap.",
          "ช่วงเวลาโฟกัสต้องไม่ทับซ้อนกัน"
        ),
        PATTERN_INVALID_DURATION: text(
          "Focus duration must be 10–180 minutes.",
          "ระยะเวลาโฟกัสต้องอยู่ระหว่าง 10–180 นาที"
        ),
        PATTERN_INVALID_MAX_HOURS: text(
          "Maximum hours must be 1–16 hours per day.",
          "ชั่วโมงสูงสุดต้องอยู่ระหว่าง 1–16 ชั่วโมงต่อวัน"
        ),
        AUTH_REQUIRED: text(
          "Please sign in again.",
          "กรุณาเข้าสู่ระบบใหม่"
        ),
      };

      Alert.alert(
        text("Unable to save", "บันทึกไม่สำเร็จ"),
        messages[error.message] ||
        text(
          "Check your connection and account permissions, then retry.",
          "ตรวจสอบการเชื่อมต่อและสิทธิ์ของบัญชี แล้วลองอีกครั้ง"
        )
      );
    } finally {
      setIsSavingPattern(false);
    }
  };

  if (isLoadingPattern || patternLoadError) {
    return (
      <View style={[styles.container, { padding: 24 }]}>
        <Text style={{ color: COLORS.text, marginBottom: 20 }}>
          {isLoadingPattern
            ? text("Loading settings...", "กำลังโหลดการตั้งค่า...")
            : text(
              "Unable to load settings. Your saved values have not been changed.",
              "โหลดการตั้งค่าไม่สำเร็จ ค่าที่บันทึกไว้ยังไม่ถูกเปลี่ยน"
            )}
        </Text>

        {patternLoadError ? (
          <Pressable
            style={styles.saveButton}
            onPress={() => setReloadCount((current) => current + 1)}
          >
            <Text style={styles.saveButtonText}>
              {text("Retry", "ลองใหม่")}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => router.back()}
          style={{ marginTop: 20 }}
        >
          <Text style={{ color: COLORS.primary }}>
            {text("Back", "กลับ")}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        pointerEvents={isSavingPattern ? "none" : "auto"}
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      >
        <View style={styles.headerRow}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </Pressable>

          <View style={styles.headerTextBox}>
            <Text style={styles.pageTitle}>
              {text("Personal Time Pattern", "รูปแบบเวลาส่วนตัว")}
            </Text>
          </View>
        </View>

        <SectionCard
          icon="sunny-outline"
          iconColor="#2563EB"
          iconBackground="#DBEAFE"
          title={text("Wake-up time", "เวลาตื่นนอน")}
        >
          <View style={styles.singleTimeRow}>
            <TimeButton
              value={wakeTime}
              onPress={() =>
                openTimePicker({ type: "wake", value: wakeTime })
              }
            />
          </View>
        </SectionCard>

        <SectionCard
          icon="moon-outline"
          iconColor="#4F46E5"
          iconBackground="#E0E7FF"
          title={text("Bedtime", "เวลาเข้านอน")}
        >
          <View style={styles.singleTimeRow}>
            <TimeButton
              value={sleepTime}
              onPress={() =>
                openTimePicker({ type: "sleep", value: sleepTime })
              }
            />
          </View>
        </SectionCard>

        <SectionCard
          icon="time-outline"
          iconColor="#0F766E"
          iconBackground="#CCFBF1"
          title={text("Daily available time", "ช่วงเวลาที่ว่างในแต่ละวัน")}
        >
          <View style={styles.rangeRow}>
            <TimeButton
              value={availableStart}
              compact
              onPress={() =>
                openTimePicker({
                  type: "availableStart",
                  value: availableStart,
                })
              }
            />
            <View style={styles.rangeDivider} />
            <TimeButton
              value={availableEnd}
              compact
              onPress={() =>
                openTimePicker({ type: "availableEnd", value: availableEnd })
              }
            />
          </View>
        </SectionCard>

        <SectionCard
          icon="locate-outline"
          iconColor="#EA580C"
          iconBackground="#FFEDD5"
          title={text("Preferred focus periods", "ช่วงเวลาที่ต้องการโฟกัส")}
        >
          <View style={styles.focusRangeList}>
            {focusRanges.map((range, index) => (
              <View key={range.id} style={styles.focusRangeCard}>
                <View style={styles.focusRangeHeader}>
                  <Text style={styles.focusRangeLabel}>
                    {text(`Focus period ${index + 1}`, `ช่วงที่ ${index + 1}`)}
                  </Text>

                  <Pressable
                    style={[
                      styles.removeRangeButton,
                      focusRanges.length <= 1 && styles.removeRangeButtonDisabled,
                    ]}
                    disabled={focusRanges.length <= 1}
                    onPress={() => removeFocusRange(range.id)}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={17}
                      color={
                        focusRanges.length <= 1
                          ? COLORS.textMuted
                          : COLORS.danger
                      }
                    />
                  </Pressable>
                </View>

                <View style={styles.rangeRow}>
                  <TimeButton
                    value={range.start}
                    compact
                    onPress={() =>
                      openTimePicker({
                        type: "focusStart",
                        value: range.start,
                        rangeId: range.id,
                      })
                    }
                  />
                  <View style={styles.rangeDivider} />
                  <TimeButton
                    value={range.end}
                    compact
                    onPress={() =>
                      openTimePicker({
                        type: "focusEnd",
                        value: range.end,
                        rangeId: range.id,
                      })
                    }
                  />
                </View>
              </View>
            ))}
          </View>

          <Pressable style={styles.addRangeButton} onPress={addFocusRange}>
            <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
            <Text style={styles.addRangeButtonText}>
              {text("Add focus period", "เพิ่มช่วงเวลาโฟกัส")}
            </Text>
          </Pressable>
        </SectionCard>

        <SectionCard
          icon="hourglass-outline"
          iconColor="#7C3AED"
          iconBackground="#EDE9FE"
          title={text("Preferred focus duration", "ระยะเวลาโฟกัสต่อรอบ")}
        >
          <StepperControl
            value={focusDuration}
            unit={text("minutes", "นาที")}
            decreaseDisabled={focusDuration <= 10}
            increaseDisabled={focusDuration >= 180}
            onDecrease={() =>
              setFocusDuration((current) => Math.max(10, current - 5))
            }
            onIncrease={() =>
              setFocusDuration((current) => Math.min(180, current + 5))
            }
          />
        </SectionCard>

        <SectionCard
          icon="speedometer-outline"
          iconColor="#0369A1"
          iconBackground="#E0F2FE"
          title={text(
            "Maximum activity hours per day",
            "ชั่วโมงกิจกรรมสูงสุดต่อวัน"
          )}
        >
          <StepperControl
            value={maxHoursPerDay}
            unit={text("hours/day", "ชั่วโมง/วัน")}
            decreaseDisabled={maxHoursPerDay <= 1}
            increaseDisabled={maxHoursPerDay >= 16}
            onDecrease={() =>
              setMaxHoursPerDay((current) => Math.max(1, current - 1))
            }
            onIncrease={() =>
              setMaxHoursPerDay((current) => Math.min(16, current + 1))
            }
          />
        </SectionCard>


        <Pressable
          style={[
            styles.saveButton,
            isSavingPattern && { opacity: 0.6 },
          ]}
          onPress={handleSave}
          disabled={isSavingPattern}
        >
          <Text style={styles.saveButtonText}>
            {isSavingPattern
              ? text("Saving...", "กำลังบันทึก...")
              : text("Save settings", "บันทึกการตั้งค่า")}
          </Text>
        </Pressable>

      </ScrollView>

      {pickerState ? (
        <DateTimePicker
          value={timeStringToDate(pickerState.value)}
          mode="time"
          display="default"
          is24Hour
          minuteInterval={1}
          onChange={handleTimePickerChange}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 42,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 10,
  },
  headerTextBox: {
    flex: 1,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    padding: 14,
    marginBottom: 10,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  sectionIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  sectionTitleBox: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 15.5,
    fontWeight: "800",
    color: COLORS.text,
  },
  singleTimeRow: {
    alignItems: "flex-end",
    marginTop: 12,
  },
  timeButton: {
    minWidth: 112,
    height: 44,
    paddingHorizontal: 13,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#D6E2F0",
    backgroundColor: "#FAFCFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  timeButtonCompact: {
    minWidth: 104,
    paddingHorizontal: 10,
  },
  timeButtonText: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.text,
  },
  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 12,
  },
  rangeDivider: {
    width: 15,
    height: 2,
    borderRadius: 999,
    backgroundColor: COLORS.textMuted,
  },
  focusRangeList: {
    gap: 9,
    marginTop: 13,
  },
  focusRangeCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    backgroundColor: "#FAFCFF",
    padding: 11,
  },
  focusRangeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  focusRangeLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.text,
  },
  removeRangeButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF2F2",
  },
  removeRangeButtonDisabled: {
    backgroundColor: COLORS.cardSoft,
    opacity: 0.55,
  },
  addRangeButton: {
    marginTop: 10,
    minHeight: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: COLORS.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "#EFF6FF",
  },
  addRangeButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.primary,
  },
  stepperRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  stepperButton: {
    width: 46,
    height: 46,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperButtonDisabled: {
    backgroundColor: COLORS.cardSoft,
    borderColor: COLORS.border,
    opacity: 0.55,
  },
  stepperValueBox: {
    minWidth: 132,
    height: 54,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#D6E2F0",
    backgroundColor: "#FAFCFF",
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
  },
  stepperValue: {
    fontSize: 24,
    fontWeight: "900",
    color: COLORS.primary,
  },
  stepperUnit: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textMuted,
  },
  saveButton: {
    marginTop: 4,
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});

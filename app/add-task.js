//เวอร์ ล็อคอิน
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { auth } from "../src/config/firebase";
import { COLORS } from "../src/constants/theme";

import { addTask } from "../src/services/taskService";
import { RECURRENCE_TYPES } from "../src/utils/recurrence";

export default function AddTask() {
  const router = useRouter();

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

  const [pickerMode, setPickerMode] = useState(null);
  const [pickerTarget, setPickerTarget] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const [conflictModalVisible, setConflictModalVisible] = useState(false);
  const [conflictResult, setConflictResult] = useState(null);
  const [pendingTaskPayload, setPendingTaskPayload] = useState(null);

  const repeatOptions = [
    { label: "Never", value: RECURRENCE_TYPES.NONE },
    { label: "Everyday", value: RECURRENCE_TYPES.EVERYDAY },
    { label: "Everyweek", value: RECURRENCE_TYPES.EVERYWEEK },
    { label: "Custom", value: RECURRENCE_TYPES.CUSTOM },
  ];

  const customDayOptions = [
    1, 2, 3, 4, 5, 6, 7, 10, 14, 21, 30, 45, 60, 90, 100,
  ];

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

  const ensureLoggedIn = () => {
    if (!auth.currentUser) {
      Alert.alert("Login Required", "กรุณาเข้าสู่ระบบก่อนใช้งาน");
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

  const formatDate = (date) => {
    return date.toLocaleDateString("en-US", {  //Thai use th-TH
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (value) => {
    const date = normalizeDate(value);

    if (!date) return "";

    return date.toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatConflictDate = (value) => {
    const date = normalizeDate(value);

    if (!date) return "-";

    return date.toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
    });
  };

  const openPicker = (target, mode) => {
    setPickerTarget(target);
    setPickerMode(mode);
  };

  const onChangeDateTime = (event, selectedValue) => {
    if (Platform.OS === "android") {
      setPickerMode(null);
    }

    if (!selectedValue) return;

    const currentDate =
      pickerTarget === "start" ? startDateTime : endDateTime;

    const newDate = new Date(currentDate);

    if (pickerMode === "date") {
      newDate.setFullYear(selectedValue.getFullYear());
      newDate.setMonth(selectedValue.getMonth());
      newDate.setDate(selectedValue.getDate());
    }

    if (pickerMode === "time") {
      newDate.setHours(selectedValue.getHours());
      newDate.setMinutes(selectedValue.getMinutes());
      newDate.setSeconds(0);
      newDate.setMilliseconds(0);
    }

    if (pickerTarget === "start") {
      setStartDateTime(newDate);

      if (endDateTime <= newDate) {
        setEndDateTime(new Date(newDate.getTime() + 60 * 60 * 1000));
      }
    }

    if (pickerTarget === "end") {
      setEndDateTime(newDate);
    }
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

  const buildTaskPayload = () => {
    return {
      title: title.trim(),
      detail: detail.trim(),

      start_time: startDateTime,
      end_time: endDateTime,

      task_type: "fixed",

      is_recurring: repeatType !== RECURRENCE_TYPES.NONE,
      recurrence_type: repeatType,
      recurrence_interval_days:
        repeatType === RECURRENCE_TYPES.CUSTOM
          ? Number(customDays)
          : repeatType === RECURRENCE_TYPES.EVERYWEEK
            ? 7
            : repeatType === RECURRENCE_TYPES.EVERYDAY
              ? 1
              : null,

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
        router.replace("/calentask");
        return;
      }

      Alert.alert("Error", "บันทึกงานไม่สำเร็จ กรุณาลองใหม่");
    } catch (error) {
      console.error("Save anyway error:", error);

      if (error?.message === "AUTH_REQUIRED") {
        router.replace("/login");
        return;
      }

      Alert.alert("Error", "บันทึกงานไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!ensureLoggedIn()) return;
    if (isSaving) return;

    if (!title.trim()) {
      Alert.alert("Error", "กรุณาใส่ Title");
      return;
    }

    if (endDateTime <= startDateTime) {
      Alert.alert("Error", "End time ต้องมากกว่า Start time");
      return;
    }

    if (
      repeatType === RECURRENCE_TYPES.CUSTOM &&
      (!customDays || Number(customDays) < 1 || Number(customDays) > 100)
    ) {
      Alert.alert("Error", "Custom ต้องเลือกจำนวนวันระหว่าง 1 - 100");
      return;
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
        router.replace("/calentask");
        return;
      }

      Alert.alert("Error", "บันทึกงานไม่สำเร็จ กรุณาลองใหม่");
    } catch (error) {
      console.error("Add task error:", error);

      if (error?.message === "AUTH_REQUIRED") {
        router.replace("/login");
        return;
      }

      Alert.alert("Error", "บันทึกงานไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setIsSaving(false);
    }
  };

  const conflictItems = conflictResult?.conflict_items || [];
  const conflictPreviewItems = conflictItems.slice(0, 5);
  const remainingConflictCount =
    conflictItems.length > 5 ? conflictItems.length - 5 : 0;

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
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.topNav}>
          <Pressable
            style={styles.navIconButton}
            onPress={() => router.replace("/calentask")}
          >
            <Text style={styles.backIconText}>‹</Text>
          </Pressable>

          <Text style={styles.navTitle}>Add Task</Text>

          <Pressable
            style={styles.navIconButton}
            onPress={() => router.replace("/")}
          >
            <Text style={styles.homeIconText}>⌂</Text>
          </Pressable>
        </View>

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
            placeholder="Detail"
            placeholderTextColor={COLORS.textMuted}
            value={detail}
            onChangeText={setDetail}
            multiline
            textAlignVertical="top"
          />
        </View>

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

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Repeat</Text>

          <View style={styles.repeatContainer}>
            {repeatOptions.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.repeatButton,
                  repeatType === option.value && styles.repeatButtonActive,
                ]}
                onPress={() => setRepeatType(option.value)}
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

          {repeatType === RECURRENCE_TYPES.EVERYDAY && (
            <Text style={styles.helpText}>This task will be created every day at the same time.</Text>
          )}

          {repeatType === RECURRENCE_TYPES.EVERYWEEK && (
            <Text style={styles.helpText}>
              This task will be created every week on the same day as the start date.
            </Text>
          )}

          {repeatType === RECURRENCE_TYPES.CUSTOM && (
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
                Custom can be selected from 1 to 100 days. For example, 3 means the task will be created every 3 days.
              </Text>
            </>
          )}
        </View>

        {pickerMode && (
          <DateTimePicker
            value={pickerTarget === "start" ? startDateTime : endDateTime}
            mode={pickerMode}
            display="spinner"
            onChange={onChangeDateTime}
            is24Hour={true}
          />
        )}

        <Pressable
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          <Text style={styles.saveText}>
            {isSaving ? "Checking..." : "Save"}
          </Text>
        </Pressable>

        <Pressable
          style={styles.cancelButton}
          onPress={() => router.replace("/calentask")}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </ScrollView>

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
                      {formatConflictDate(item.start_time)} ·{" "}
                      {formatTime(item.start_time)} - {formatTime(item.end_time)}
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
              <Text style={styles.conflictPrimaryText}>Change Time</Text>
            </Pressable>

            <Pressable
              style={[
                styles.saveAnywayButton,
                isSaving && styles.saveButtonDisabled,
              ]}
              onPress={handleSaveAnyway}
              disabled={isSaving}
            >
              <Text style={styles.conflictPrimaryText}>
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
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  backIconText: {
    fontSize: 44,
    color: COLORS.primaryDark,
    fontWeight: "600",
    lineHeight: 44,
  },
  homeIconText: {
    fontSize: 32,
    color: COLORS.primaryDark,
    fontWeight: "700",
    lineHeight: 38,
  },
  navTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.text,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    marginBottom: 24,
    paddingHorizontal: 18,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  titleInput: {
    fontSize: 30,
    paddingVertical: 18,
    color: COLORS.text,
  },
  detailInput: {
    fontSize: 24,
    minHeight: 120,
    paddingVertical: 18,
    color: COLORS.text,
  },
  line: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    gap: 8,
  },
  label: {
    fontSize: 24,
    flex: 1,
    color: COLORS.text,
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
  pickerText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.text,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "700",
    paddingVertical: 14,
    color: COLORS.text,
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
    backgroundColor: COLORS.primaryDark,
    borderColor: COLORS.primaryDark,
  },
  repeatText: {
    fontSize: 15,
    fontWeight: "600",
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
    backgroundColor: COLORS.primaryDark,
    borderColor: COLORS.primaryDark,
  },
  dayButtonText: {
    color: COLORS.text,
    fontWeight: "700",
  },
  dayButtonTextActive: {
    color: COLORS.textLight,
  },
  helpText: {
    fontSize: 14,
    color: COLORS.textMuted,
    paddingBottom: 14,
    lineHeight: 20,
  },
  saveButton: {
    backgroundColor: COLORS.primaryDark,
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
    backgroundColor: COLORS.secondary,
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 40,
  },
  cancelText: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "bold",
  },
  conflictOverlay: {
    flex: 1,
    backgroundColor: "rgba(42, 37, 40, 0.45)",
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
    fontWeight: "bold",
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
    color: COLORS.primaryDark,
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
    backgroundColor: COLORS.secondary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  saveAnywayButton: {
    backgroundColor: COLORS.primaryDark,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  conflictPrimaryText: {
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
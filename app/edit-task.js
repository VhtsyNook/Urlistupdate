/*
import { COLORS } from "../src/constants/theme";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    Alert,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import { getTaskById, updateTask } from "../src/services/taskService";

export default function EditTask() {
  const router = useRouter();
  const { id } = useLocalSearchParams();

  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");

  const [startDateTime, setStartDateTime] = useState(new Date());
  const [endDateTime, setEndDateTime] = useState(
    new Date(Date.now() + 60 * 60 * 1000)
  );

  const [pickerMode, setPickerMode] = useState(null);
  const [pickerTarget, setPickerTarget] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadTask = async () => {
      try {
        if (!id) {
          Alert.alert("Error", "ไม่พบรหัสงาน");
          router.back();
          return;
        }

        const task = await getTaskById(id);

        setTitle(task.title || "");
        setDetail(task.detail || "");
        setStartDateTime(task.start_time || new Date());
        setEndDateTime(
          task.end_time || new Date(Date.now() + 60 * 60 * 1000)
        );
      } catch (error) {
        console.error("Load task error:", error);
        Alert.alert("Error", "โหลดข้อมูลงานไม่สำเร็จ");
        router.back();
      } finally {
        setIsLoading(false);
      }
    };

    loadTask();
  }, [id, router]);

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

  const formatDate = (date) => {
    return date.toLocaleDateString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleUpdate = async () => {
    if (isSaving) return;

    if (!title.trim()) {
      Alert.alert("Error", "กรุณาใส่ Title");
      return;
    }

    if (endDateTime <= startDateTime) {
      Alert.alert("Error", "End time ต้องมากกว่า Start time");
      return;
    }

    try {
      setIsSaving(true);

      await updateTask(id, {
        title: title.trim(),
        detail: detail.trim(),
        start_time: startDateTime,
        end_time: endDateTime,
        task_type: "fixed",
      });

      router.replace("/");
    } catch (error) {
      console.error("Update task error:", error);
      Alert.alert("Error", "แก้ไขงานไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading task...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.pageTitle}>Edit Task</Text>

      <View style={styles.card}>
        <TextInput
          style={styles.titleInput}
          placeholder="Title"
          placeholderTextColor="#999"
          value={title}
          onChangeText={setTitle}
          numberOfLines={1}
        />

        <View style={styles.line} />

        <TextInput
          style={styles.detailInput}
          placeholder="Detail"
          placeholderTextColor="#999"
          value={detail}
          onChangeText={setDetail}
          multiline
          textAlignVertical="top"
        />
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Starts</Text>

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
          <Text style={styles.label}>Ends</Text>

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
        onPress={handleUpdate}
        disabled={isSaving}
      >
        <Text style={styles.saveText}>
          {isSaving ? "Saving..." : "Save Changes"}
        </Text>
      </Pressable>

      <Pressable style={styles.cancelButton} onPress={() => router.back()}>
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: "#f3f2f8",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 18,
    color: "#777",
  },
  container: {
    flex: 1,
    backgroundColor: "#f3f2f8",
    padding: 20,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#000",
    marginBottom: 20,
    marginTop: 20,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 22,
    marginBottom: 24,
    paddingHorizontal: 18,
    paddingVertical: 4,
  },
  titleInput: {
    fontSize: 30,
    paddingVertical: 18,
    color: "#000",
  },
  detailInput: {
    fontSize: 24,
    minHeight: 120,
    paddingVertical: 18,
    color: "#000",
  },
  line: {
    height: 1,
    backgroundColor: "#ccc",
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
    color: "#000",
  },
  pickerBox: {
    backgroundColor: "#f1f1f5",
    borderRadius: 14,
    padding: 10,
    width: 145,
    alignItems: "center",
  },
  timeBox: {
    backgroundColor: "#f1f1f5",
    borderRadius: 14,
    padding: 10,
    width: 90,
    alignItems: "center",
  },
  pickerText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#000",
  },
  saveButton: {
    backgroundColor: "#ff3b30",
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 14,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  cancelButton: {
    backgroundColor: "#8e8e93",
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 40,
  },
  cancelText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
});
*/
//แกเวอร์ log in
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { getTaskById, updateTask } from "../src/services/taskService";

export default function EditTask() {
  const router = useRouter();
  const { id } = useLocalSearchParams();

  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");

  const [startDateTime, setStartDateTime] = useState(new Date());
  const [endDateTime, setEndDateTime] = useState(
    new Date(Date.now() + 60 * 60 * 1000)
  );

  const [pickerMode, setPickerMode] = useState(null);
  const [pickerTarget, setPickerTarget] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [conflictModalVisible, setConflictModalVisible] = useState(false);
  const [conflictResult, setConflictResult] = useState(null);
  const [pendingTaskPayload, setPendingTaskPayload] = useState(null);

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
          Alert.alert("Error", "ไม่พบรหัสงาน");
          router.back();
          return;
        }

        const task = await getTaskById(String(id));

        setTitle(task.title || "");
        setDetail(task.detail || "");
        setStartDateTime(task.start_time || new Date());
        setEndDateTime(
          task.end_time || new Date(Date.now() + 60 * 60 * 1000)
        );
      } catch (error) {
        console.error("Load task error:", error);

        if (error?.message === "AUTH_REQUIRED") {
          router.replace("/login");
          return;
        }

        if (error?.message === "PERMISSION_DENIED") {
          Alert.alert("Error", "คุณไม่มีสิทธิ์แก้ไขงานนี้");
          router.back();
          return;
        }

        Alert.alert("Error", "โหลดข้อมูลงานไม่สำเร็จ");
        router.back();
      } finally {
        setIsLoading(false);
      }
    };

    loadTask();
  }, [id, isAuthReady, user, router]);

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

  const formatDate = (value) => {
    const date = normalizeDate(value);

    if (!date) return "";

    return date.toLocaleDateString("en-US", {
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

  const buildTaskPayload = () => {
    return {
      title: title.trim(),
      detail: detail.trim(),
      start_time: startDateTime,
      end_time: endDateTime,
      task_type: "fixed",
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

      const result = await updateTask(String(id), pendingTaskPayload, {
        saveAnyway: true,
      });

      if (result?.success === true || result === undefined) {
        resetConflictState();
        router.replace("/");
        return;
      }

      Alert.alert("Error", "บันทึกการแก้ไขไม่สำเร็จ กรุณาลองใหม่");
    } catch (error) {
      console.error("Save anyway edit error:", error);

      if (error?.message === "AUTH_REQUIRED") {
        router.replace("/login");
        return;
      }

      if (error?.message === "PERMISSION_DENIED") {
        Alert.alert("Error", "คุณไม่มีสิทธิ์แก้ไขงานนี้");
        return;
      }

      Alert.alert("Error", "บันทึกการแก้ไขไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!ensureLoggedIn()) return;
    if (isSaving) return;

    if (!id) {
      Alert.alert("Error", "ไม่พบรหัสงาน");
      return;
    }

    if (!title.trim()) {
      Alert.alert("Error", "กรุณาใส่ Title");
      return;
    }

    if (endDateTime <= startDateTime) {
      Alert.alert("Error", "End time ต้องมากกว่า Start time");
      return;
    }

    const taskPayload = buildTaskPayload();

    try {
      setIsSaving(true);

      const result = await updateTask(String(id), taskPayload);

      if (result?.has_conflict === true && result?.success === false) {
        setPendingTaskPayload(taskPayload);
        setConflictResult(result);
        setConflictModalVisible(true);
        return;
      }

      if (result?.success === true || result === undefined) {
        router.replace("/");
        return;
      }

      Alert.alert("Error", "แก้ไขงานไม่สำเร็จ กรุณาลองใหม่");
    } catch (error) {
      console.error("Update task error:", error);

      if (error?.message === "AUTH_REQUIRED") {
        router.replace("/login");
        return;
      }

      if (error?.message === "PERMISSION_DENIED") {
        Alert.alert("Error", "คุณไม่มีสิทธิ์แก้ไขงานนี้");
        return;
      }

      Alert.alert("Error", "แก้ไขงานไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setIsSaving(false);
    }
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
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.topNav}>
          <Pressable
            style={styles.navIconButton}
            onPress={() => router.replace("/calentask")}
          >
            <Text style={styles.backIconText}>‹</Text>
          </Pressable>

          <Text style={styles.navTitle}>Edit</Text>

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
          onPress={handleUpdate}
          disabled={isSaving}
        >
          <Text style={styles.saveText}>
            {isSaving ? "Checking..." : "Save"}
          </Text>
        </Pressable>

        <Pressable style={styles.cancelButton} onPress={() => router.back()}>
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
            <Text style={styles.conflictModalTitle}>
              Time Conflict Detected
            </Text>

            <Text style={styles.conflictModalMessage}>
              พบเวลาทับซ้อน {conflictResult?.conflict_count || 0} รายการ
              {conflictResult?.conflict_instance_count
                ? ` จาก ${conflictResult.conflict_instance_count} ช่วงงาน`
                : ""}
            </Text>

            <View style={styles.conflictListBox}>
              {conflictPreviewItems.length === 0 ? (
                <Text style={styles.conflictEmptyText}>
                  ไม่พบรายละเอียดงานที่ทับซ้อน
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
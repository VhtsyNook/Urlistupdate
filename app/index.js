import DateTimePicker from "@react-native-community/datetimepicker";
import { useRootNavigationState, useRouter } from "expo-router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { COLORS } from "../src/constants/theme";

import { auth } from "../src/config/firebase";
import {
  addTask,
  deleteRecurringTaskGroup,
  deleteTask,
  listenTasks,
  undoTaskDone,
  updateTaskStatus,
} from "../src/services/taskService";

import { RECURRENCE_TYPES } from "../src/utils/recurrence";

export default function HomeScreen() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();

  const today = useMemo(() => new Date(), []);

  const [tasks, setTasks] = useState([]);
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const [addModalVisible, setAddModalVisible] = useState(false);

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteTargetTask, setDeleteTargetTask] = useState(null);

  const [conflictModalVisible, setConflictModalVisible] = useState(false);
  const [conflictResult, setConflictResult] = useState(null);
  const [pendingTaskPayload, setPendingTaskPayload] = useState(null);

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

    let unsubscribe = () => {};

    try {
      unsubscribe = listenTasks((data) => {
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

  const isSameDay = (a, b) => {
    const dateA = normalizeDate(a);
    const dateB = normalizeDate(b);

    if (!dateA || !dateB) return false;

    return (
      dateA.getFullYear() === dateB.getFullYear() &&
      dateA.getMonth() === dateB.getMonth() &&
      dateA.getDate() === dateB.getDate()
    );
  };

  const formatTime = (value) => {
    const date = normalizeDate(value);

    if (!date) return "";

    return date.toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (minutes) => {
    if (minutes < 60) {
      return `${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (remainingMinutes === 0) {
      return `${hours} hr`;
    }

    return `${hours} hr ${remainingMinutes} min`;
  };

  const roundUpToNextFiveMinutes = (date) => {
    const nextDate = new Date(date);
    const minutes = nextDate.getMinutes();
    const roundedMinutes = Math.ceil(minutes / 5) * 5;

    if (roundedMinutes === 60) {
      nextDate.setHours(nextDate.getHours() + 1, 0, 0, 0);
    } else {
      nextDate.setMinutes(roundedMinutes, 0, 0);
    }

    return nextDate;
  };

  const getDurationMinutes = (start, end) => {
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
  };

  const mergeBusySlots = (busySlots) => {
    if (busySlots.length === 0) return [];

    const sortedSlots = [...busySlots].sort(
      (a, b) => a.start_time.getTime() - b.start_time.getTime()
    );

    const mergedSlots = [sortedSlots[0]];

    for (let i = 1; i < sortedSlots.length; i++) {
      const currentSlot = sortedSlots[i];
      const lastSlot = mergedSlots[mergedSlots.length - 1];

      if (currentSlot.start_time <= lastSlot.end_time) {
        if (currentSlot.end_time > lastSlot.end_time) {
          lastSlot.end_time = currentSlot.end_time;
        }
      } else {
        mergedSlots.push(currentSlot);
      }
    }

    return mergedSlots;
  };

  const suggestTodayFreeTimeSlots = (taskList, options = {}) => {
    const { minSlotMinutes = 15 } = options;

    const now = new Date();
    const dayStart = roundUpToNextFiveMinutes(now);

    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    if (dayStart >= dayEnd) {
      return [];
    }

    const busySlots = taskList
      .map((task) => {
        const startTime = normalizeDate(task.start_time);
        const endTime = normalizeDate(task.end_time);

        if (!startTime || !endTime) return null;
        if (endTime <= dayStart || startTime >= dayEnd) return null;

        return {
          task_id: task.id,
          title: task.title || "Untitled Task",
          start_time: startTime < dayStart ? dayStart : startTime,
          end_time: endTime > dayEnd ? dayEnd : endTime,
        };
      })
      .filter(Boolean);

    const mergedBusySlots = mergeBusySlots(busySlots);

    const freeSlots = [];
    let currentTime = new Date(dayStart);

    mergedBusySlots.forEach((busySlot) => {
      if (currentTime < busySlot.start_time) {
        const durationMinutes = getDurationMinutes(
          currentTime,
          busySlot.start_time
        );

        if (durationMinutes >= minSlotMinutes) {
          freeSlots.push({
            start_time: new Date(currentTime),
            end_time: new Date(busySlot.start_time),
            duration_minutes: durationMinutes,
          });
        }
      }

      if (busySlot.end_time > currentTime) {
        currentTime = new Date(busySlot.end_time);
      }
    });

    if (currentTime < dayEnd) {
      const durationMinutes = getDurationMinutes(currentTime, dayEnd);

      if (durationMinutes >= minSlotMinutes) {
        freeSlots.push({
          start_time: new Date(currentTime),
          end_time: new Date(dayEnd),
          duration_minutes: durationMinutes,
        });
      }
    }

    return freeSlots;
  };

  const getOverlapRange = (startA, endA, startB, endB) => {
    const overlapStart = new Date(Math.max(startA.getTime(), startB.getTime()));
    const overlapEnd = new Date(Math.min(endA.getTime(), endB.getTime()));

    if (overlapStart < overlapEnd) {
      return {
        start: overlapStart,
        end: overlapEnd,
      };
    }

    return null;
  };

  const buildConflictInfoMap = (taskList) => {
    const conflictMap = {};

    taskList.forEach((task) => {
      conflictMap[task.id] = [];
    });

    for (let i = 0; i < taskList.length; i++) {
      for (let j = i + 1; j < taskList.length; j++) {
        const taskA = taskList[i];
        const taskB = taskList[j];

        const startA = normalizeDate(taskA.start_time);
        const endA = normalizeDate(taskA.end_time);
        const startB = normalizeDate(taskB.start_time);
        const endB = normalizeDate(taskB.end_time);

        if (!startA || !endA || !startB || !endB) continue;

        const overlap = getOverlapRange(startA, endA, startB, endB);

        if (overlap) {
          conflictMap[taskA.id].push({
            withTaskId: taskB.id,
            withTitle: taskB.title || "Untitled Task",
            start: overlap.start,
            end: overlap.end,
          });

          conflictMap[taskB.id].push({
            withTaskId: taskA.id,
            withTitle: taskA.title || "Untitled Task",
            start: overlap.start,
            end: overlap.end,
          });
        }
      }
    }

    return conflictMap;
  };

  const formatConflictRange = (conflict) => {
    return `${formatTime(conflict.start)} - ${formatTime(conflict.end)}`;
  };

  const formatDate = (date) => {
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
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

  const todayTasks = tasks
    .filter((task) => isSameDay(task.start_time, today))
    .sort((a, b) => {
      const timeA = normalizeDate(a.start_time)?.getTime() || 0;
      const timeB = normalizeDate(b.start_time)?.getTime() || 0;
      return timeA - timeB;
    });

  const todayConflictMap = buildConflictInfoMap(todayTasks);

  const activeTodayTasks = todayTasks.filter((task) => !task.is_completed);
  const completedTodayTasks = todayTasks.filter((task) => task.is_completed);

  const todayFreeTimeSlots = suggestTodayFreeTimeSlots(todayTasks, {
    minSlotMinutes: 15,
  });

  const ensureLoggedIn = () => {
    if (!auth.currentUser) {
      Alert.alert("Login Required", "Please log in to manage your tasks.");
      router.replace("/login");
      return false;
    }

    return true;
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);

      setTasks([]);
      setAddModalVisible(false);
      setDeleteModalVisible(false);
      setDeleteTargetTask(null);
      setConflictModalVisible(false);
      setConflictResult(null);
      setPendingTaskPayload(null);

      router.replace("/login");
    } catch (error) {
      console.error("Logout error:", error);
      Alert.alert("Error", "Unable to log out.");
    }
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

  const handleDoneTask = async (taskId) => {
    if (!ensureLoggedIn()) return;

    try {
      await updateTaskStatus(taskId, "completed");
    } catch (error) {
      console.error("Done task error:", error);
      Alert.alert("Error", "Unable to update task status.");
    }
  };

  const handleUndoTask = async (taskId) => {
    if (!ensureLoggedIn()) return;

    try {
      await undoTaskDone(taskId);
    } catch (error) {
      console.error("Undo task error:", error);
      Alert.alert("Error", "Unable to restore this task.");
    }
  };

  const handleEditTask = (task) => {
    if (!ensureLoggedIn()) return;

    const taskId = task?.id || task?.task_id;

    if (!taskId) {
      Alert.alert("Error", "Task ID was not found.");
      return;
    }

    router.push({
      pathname: "/edit-task",
      params: { id: String(taskId) },
    });
  };

  const openDeleteModal = (task) => {
    if (!ensureLoggedIn()) return;

    setDeleteTargetTask(task);
    setDeleteModalVisible(true);
  };

  const closeDeleteModal = () => {
    setDeleteModalVisible(false);
    setDeleteTargetTask(null);
  };

  const performDeleteSingleTask = async () => {
    if (!ensureLoggedIn()) return;
    if (!deleteTargetTask) return;

    try {
      await deleteTask(deleteTargetTask.id);
      closeDeleteModal();
    } catch (error) {
      console.error("Delete task error:", error);
      Alert.alert("Error", "Unable to delete this task.");
    }
  };

  const performDeleteRecurringGroup = async () => {
    if (!ensureLoggedIn()) return;
    if (!deleteTargetTask?.recurrence_group_id) return;

    try {
      await deleteRecurringTaskGroup(deleteTargetTask.recurrence_group_id);
      closeDeleteModal();
    } catch (error) {
      console.error("Delete recurring group error:", error);
      Alert.alert("Error", "Unable to delete repeated tasks.");
    }
  };

  const resetAddTaskForm = () => {
    const now = new Date();

    setTitle("");
    setDetail("");
    setStartDateTime(now);
    setEndDateTime(new Date(now.getTime() + 60 * 60 * 1000));
    setRepeatType(RECURRENCE_TYPES.NONE);
    setCustomDays(1);
    setPickerMode(null);
    setPickerTarget(null);
    setIsSaving(false);
    setConflictResult(null);
    setPendingTaskPayload(null);
    setConflictModalVisible(false);
  };

  const openAddTaskModal = () => {
    if (!ensureLoggedIn()) return;

    resetAddTaskForm();
    setAddModalVisible(true);
  };

  const closeAddTaskModal = () => {
    if (isSaving) return;

    setAddModalVisible(false);
    setPickerMode(null);
    setPickerTarget(null);
    setConflictModalVisible(false);
    setConflictResult(null);
    setPendingTaskPayload(null);
  };

  const closeConflictModalOnly = () => {
    setConflictModalVisible(false);
  };

  const handleChangeTimeFromConflict = () => {
    setConflictModalVisible(false);
  };

  const handleCancelConflict = () => {
    setConflictModalVisible(false);
    setConflictResult(null);
    setPendingTaskPayload(null);
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
        setConflictModalVisible(false);
        setConflictResult(null);
        setPendingTaskPayload(null);
        setAddModalVisible(false);
        resetAddTaskForm();
        return;
      }

      Alert.alert("Error", "Unable to save this task. Please try again.");
    } catch (error) {
      console.error("Save anyway error:", error);

      if (error?.message === "AUTH_REQUIRED") {
        router.replace("/login");
      } else {
        Alert.alert("Error", "Unable to save this task. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
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

  const handleSaveTaskFromModal = async () => {
    if (!ensureLoggedIn()) return;
    if (isSaving) return;

    if (!title.trim()) {
      Alert.alert("Error", "Please enter a title.");
      return;
    }

    if (endDateTime <= startDateTime) {
      Alert.alert("Error", "End time must be later than start time.");
      return;
    }

    if (
      repeatType === RECURRENCE_TYPES.CUSTOM &&
      (!customDays || Number(customDays) < 1 || Number(customDays) > 100)
    ) {
      Alert.alert(
        "Error",
        "Custom repeat interval must be between 1 and 100 days."
      );
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
        setAddModalVisible(false);
        resetAddTaskForm();
        return;
      }

      Alert.alert("Error", "Unable to save this task. Please try again.");
    } catch (error) {
      console.error("Add task error:", error);

      if (error?.message === "AUTH_REQUIRED") {
        router.replace("/login");
      } else {
        Alert.alert("Error", "Unable to save this task. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const conflictItems = conflictResult?.conflict_items || [];
  const conflictPreviewItems = conflictItems.slice(0, 5);
  const remainingConflictCount =
    conflictItems.length > 5 ? conflictItems.length - 5 : 0;

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
      <View style={styles.header}>
        <View style={styles.headerTitleBox}>
          <Text style={styles.pageTitle}>Task Overview</Text>

          <Text style={styles.dateText}>
            {today.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </Text>

          <Text style={styles.userEmailText} numberOfLines={1}>
            {user?.email || ""}
          </Text>
        </View>

        <View style={styles.headerActions}>
          <Pressable style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>

          <Pressable
            style={styles.calendarButton}
            onPress={() => router.push("/calentask")}
          >
            <Text style={styles.calendarIcon}>📅</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today’s Tasks</Text>

          {activeTodayTasks.length === 0 ? (
            <Text style={styles.emptyText}>No active tasks today</Text>
          ) : (
            activeTodayTasks.map((task) => {
              const taskConflicts = todayConflictMap[task.id] || [];

              return (
                <View key={task.id} style={styles.taskRow}>
                  <Pressable
                    style={styles.circleButton}
                    onPress={() => handleDoneTask(task.id)}
                  />

                  <View style={styles.taskInfo}>
                    <Text style={styles.taskTitle}>{task.title}</Text>

                    <Text style={styles.taskTime}>
                      {formatTime(task.start_time)} -{" "}
                      {formatTime(task.end_time)}
                    </Text>

                    {taskConflicts.length > 0 && (
                      <View style={styles.conflictTimeBox}>
                        <Text style={styles.conflictTimeLabel}>
                          Conflict time
                        </Text>

                        {taskConflicts.map((conflict, index) => (
                          <Text key={index} style={styles.conflictTimeText}>
                            {formatConflictRange(conflict)} with{" "}
                            {conflict.withTitle}
                          </Text>
                        ))}
                      </View>
                    )}

                    {task.has_conflict ? (
                      <Text style={styles.conflictBadge}>
                        ⚠ Conflict {task.conflict_count || ""}
                      </Text>
                    ) : null}

                    {task.detail ? (
                      <Text style={styles.taskDetail}>{task.detail}</Text>
                    ) : null}

                    <View style={styles.inlineActionRow}>
                      <Pressable
                        style={styles.editSmallButton}
                        onPress={() => handleEditTask(task)}
                      >
                        <Text style={styles.smallButtonText}>Edit</Text>
                      </Pressable>

                      <Pressable
                        style={styles.deleteSmallButton}
                        onPress={() => openDeleteModal(task)}
                      >
                        <Text style={styles.smallButtonText}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.plannerSection}>
          <View style={styles.plannerHeaderRow}>
            <View style={styles.plannerTitleBox}>
              <Text style={styles.plannerTitle}>Today’s Free Time</Text>
              <Text style={styles.plannerSubtitle}>
                Available free time remaining today
              </Text>
            </View>

            <Text style={styles.plannerBadge}>
              {todayFreeTimeSlots.length} slots
            </Text>
          </View>

          {todayFreeTimeSlots.length === 0 ? (
            <Text style={styles.emptyText}>
              No available free time left today
            </Text>
          ) : (
            todayFreeTimeSlots.map((slot, index) => (
              <View key={index} style={styles.freeSlotCard}>
                <View style={styles.freeSlotTimeBox}>
                  <Text style={styles.freeSlotTime}>
                    {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                  </Text>

                  <Text style={styles.freeSlotDuration}>
                    {formatDuration(slot.duration_minutes)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Completed Tasks</Text>

          {completedTodayTasks.length === 0 ? (
            <Text style={styles.emptyText}>No completed tasks today</Text>
          ) : (
            completedTodayTasks.map((task) => {
              const taskConflicts = todayConflictMap[task.id] || [];

              return (
                <View key={task.id} style={styles.completedRow}>
                  <Pressable
                    style={styles.checkedButton}
                    onPress={() => handleUndoTask(task.id)}
                  >
                    <Text style={styles.checkText}>✓</Text>
                  </Pressable>

                  <View style={styles.taskInfo}>
                    <Text style={styles.completedTitle}>{task.title}</Text>

                    <Text style={styles.completedTime}>
                      {formatTime(task.start_time)} -{" "}
                      {formatTime(task.end_time)}
                    </Text>

                    {taskConflicts.length > 0 && (
                      <View style={styles.conflictTimeBox}>
                        <Text style={styles.conflictTimeLabel}>
                          Conflict time
                        </Text>

                        {taskConflicts.map((conflict, index) => (
                          <Text key={index} style={styles.conflictTimeText}>
                            {formatConflictRange(conflict)} with{" "}
                            {conflict.withTitle}
                          </Text>
                        ))}
                      </View>
                    )}

                    {task.has_conflict ? (
                      <Text style={styles.completedConflictBadge}>
                        ⚠ Conflict {task.conflict_count || ""}
                      </Text>
                    ) : null}

                    {task.detail ? (
                      <Text style={styles.completedDetail}>{task.detail}</Text>
                    ) : null}

                    <Pressable
                      style={styles.undoSmallButton}
                      onPress={() => handleUndoTask(task.id)}
                    >
                      <Text style={styles.undoSmallButtonText}>Undo</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <View style={styles.bottomArea}>
        <Pressable style={styles.addTaskButton} onPress={openAddTaskModal}>
          <Text style={styles.addTaskText}>＋ Add a Task</Text>
        </Pressable>
      </View>

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
            <Text style={styles.deleteModalTitle}>Delete</Text>

            <Text style={styles.deleteModalMessage}>
              {deleteTargetTask?.is_recurring &&
              deleteTargetTask?.recurrence_group_id
                ? "This is a recurring task. How would you like to delete it?"
                : "Do you want to delete this task?"}
            </Text>

            {deleteTargetTask?.is_recurring &&
            deleteTargetTask?.recurrence_group_id ? (
              <>
                <Pressable
                  style={styles.deleteOneButton}
                  onPress={performDeleteSingleTask}
                >
                  <Text style={styles.deleteButtonText}>
                    Delete this day only
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.deleteAllButton}
                  onPress={performDeleteRecurringGroup}
                >
                  <Text style={styles.deleteButtonText}>Delete All</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                style={styles.deleteAllButton}
                onPress={performDeleteSingleTask}
              >
                <Text style={styles.deleteButtonText}>Delete</Text>
              </Pressable>
            )}

            <Pressable
              style={styles.cancelDeleteButton}
              onPress={closeDeleteModal}
            >
              <Text style={styles.cancelDeleteText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={conflictModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeConflictModalOnly}
      >
        <Pressable
          style={styles.conflictOverlay}
          onPress={closeConflictModalOnly}
        >
          <Pressable
            style={styles.conflictModalBox}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.conflictModalTitle}>
              Time Conflict Detected
            </Text>

            <Text style={styles.conflictModalMessage}>
              {`Found ${conflictResult?.conflict_count || 0} conflicting task${
                (conflictResult?.conflict_count || 0) > 1 ? "s" : ""
              }${
                conflictResult?.conflict_instance_count
                  ? ` from ${
                      conflictResult.conflict_instance_count
                    } time slot${
                      conflictResult.conflict_instance_count > 1 ? "s" : ""
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
              <Text style={styles.changeTimeText}>Change</Text>
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

      <Modal
        visible={addModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeAddTaskModal}
      >
        <Pressable style={styles.modalOverlay} onPress={closeAddTaskModal}>
          <KeyboardAvoidingView
            style={styles.keyboardAvoidingView}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <Pressable
              style={styles.addSheet}
              onPress={(event) => event.stopPropagation()}
            >
              <View style={styles.sheetHandle} />

              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Add a Task</Text>

                <Pressable
                  style={styles.sheetCloseButton}
                  onPress={closeAddTaskModal}
                >
                  <Text style={styles.sheetCloseText}>×</Text>
                </Pressable>
              </View>

              <ScrollView
                style={styles.sheetScroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.modalCard}>
                  <TextInput
                    style={styles.modalTitleInput}
                    placeholder="Title"
                    placeholderTextColor={COLORS.textMuted}
                    value={title}
                    onChangeText={setTitle}
                    numberOfLines={1}
                    autoFocus
                  />

                  <View style={styles.line} />

                  <TextInput
                    style={styles.modalDetailInput}
                    placeholder="Detail"
                    placeholderTextColor={COLORS.textMuted}
                    value={detail}
                    onChangeText={setDetail}
                    multiline
                    textAlignVertical="top"
                  />
                </View>

                <View style={styles.modalCard}>
                  <View style={styles.dateRow}>
                    <Text style={styles.label}>Start</Text>

                    <Pressable
                      style={styles.pickerBox}
                      onPress={() => openPicker("start", "date")}
                    >
                      <Text style={styles.pickerText}>
                        {formatDate(startDateTime)}
                      </Text>
                    </Pressable>

                    <Pressable
                      style={styles.timeBox}
                      onPress={() => openPicker("start", "time")}
                    >
                      <Text style={styles.pickerText}>
                        {formatTime(startDateTime)}
                      </Text>
                    </Pressable>
                  </View>

                  <View style={styles.line} />

                  <View style={styles.dateRow}>
                    <Text style={styles.label}>End</Text>

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
                </View>

                <View style={styles.modalCard}>
                  <Text style={styles.repeatTitle}>Repeat</Text>

                  <View style={styles.repeatContainer}>
                    {repeatOptions.map((option) => (
                      <Pressable
                        key={option.value}
                        style={[
                          styles.repeatButton,
                          repeatType === option.value &&
                            styles.repeatButtonActive,
                        ]}
                        onPress={() => setRepeatType(option.value)}
                      >
                        <Text
                          style={[
                            styles.repeatText,
                            repeatType === option.value &&
                              styles.repeatTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {repeatType === RECURRENCE_TYPES.EVERYDAY && (
                    <Text style={styles.helpText}>
                      This task will be created every day at the same time.
                    </Text>
                  )}

                  {repeatType === RECURRENCE_TYPES.EVERYWEEK && (
                    <Text style={styles.helpText}>
                      This task will be created every week on the same day as
                      the start date.
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
                        Custom can be selected from 1 to 100 days. For example,
                        3 means the task will be created every 3 days.
                      </Text>
                    </>
                  )}
                </View>

                {pickerMode && (
                  <DateTimePicker
                    value={
                      pickerTarget === "start" ? startDateTime : endDateTime
                    }
                    mode={pickerMode}
                    display="spinner"
                    onChange={onChangeDateTime}
                    is24Hour={true}
                  />
                )}

                <Pressable
                  style={[
                    styles.sheetSaveButton,
                    isSaving && styles.saveButtonDisabled,
                  ]}
                  onPress={handleSaveTaskFromModal}
                  disabled={isSaving}
                >
                  <Text style={styles.sheetSaveText}>
                    {isSaving ? "Checking..." : "Save Task"}
                  </Text>
                </Pressable>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
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
    paddingTop: 55,
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 18,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerTitleBox: {
    flex: 1,
    paddingRight: 8,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pageTitle: {
    fontSize: 34,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  dateText: {
    marginTop: 4,
    fontSize: 16,
    color: COLORS.textMuted,
  },
  userEmailText: {
    marginTop: 4,
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: "700",
    maxWidth: 190,
  },
  logoutButton: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  logoutText: {
    color: COLORS.textSecondary || COLORS.text,
    fontSize: 12,
    fontWeight: "800",
  },
  calendarButton: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  calendarIcon: {
    fontSize: 28,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 130,
  },
  section: {
    backgroundColor: COLORS.card,
    borderRadius: 26,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textMuted,
    paddingVertical: 8,
  },
  plannerSection: {
    backgroundColor: COLORS.card,
    borderRadius: 26,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  plannerHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
    gap: 12,
  },
  plannerTitleBox: {
    flex: 1,
  },
  plannerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.text,
  },
  plannerSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: COLORS.textMuted,
  },
  plannerBadge: {
    backgroundColor: COLORS.primaryLight,
    color: COLORS.primaryDark || COLORS.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
  },
  freeSlotCard: {
    backgroundColor: COLORS.cardSoft,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  freeSlotTimeBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  freeSlotTime: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.primary,
  },
  freeSlotDuration: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.textMuted,
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider || COLORS.border,
  },
  completedRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider || COLORS.border,
    opacity: 0.78,
  },
  circleButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: COLORS.primary,
    marginRight: 12,
    marginTop: 2,
    backgroundColor: COLORS.card,
  },
  checkedButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.success,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    marginTop: 2,
  },
  checkText: {
    color: COLORS.textLight,
    fontSize: 16,
    fontWeight: "bold",
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.text,
  },
  taskTime: {
    marginTop: 4,
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: "600",
  },
  taskDetail: {
    marginTop: 4,
    fontSize: 14,
    color: COLORS.textMuted,
  },
  conflictTimeBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.divider || COLORS.border,
  },
  conflictTimeLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.danger,
    marginBottom: 4,
  },
  conflictTimeText: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 18,
    fontWeight: "600",
  },
  conflictBadge: {
    marginTop: 6,
    alignSelf: "flex-start",
    backgroundColor: COLORS.primaryLight,
    color: COLORS.danger,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
  },
  completedConflictBadge: {
    marginTop: 6,
    alignSelf: "flex-start",
    backgroundColor: COLORS.cardSoft,
    color: COLORS.danger,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
  },
  completedTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.completed,
    textDecorationLine: "line-through",
  },
  completedTime: {
    marginTop: 4,
    fontSize: 14,
    color: COLORS.textMuted,
  },
  completedDetail: {
    marginTop: 4,
    fontSize: 14,
    color: COLORS.textMuted,
  },
  inlineActionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  editSmallButton: {
    backgroundColor: COLORS.buttonSecondary || COLORS.cardSoft,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  deleteSmallButton: {
    backgroundColor: COLORS.cardSoft,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  smallButtonText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
  undoSmallButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: COLORS.cardSoft,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  undoSmallButtonText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
  bottomArea: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 25,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: "rgba(242, 242, 247, 0.95)",
  },
  addTaskButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
  },
  addTaskText: {
    color: COLORS.textLight,
    fontSize: 18,
    fontWeight: "bold",
  },
  deleteOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay || "rgba(0, 0, 0, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  deleteModalBox: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  deleteModalTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 8,
  },
  deleteModalMessage: {
    fontSize: 16,
    color: COLORS.textMuted,
    lineHeight: 22,
    marginBottom: 18,
  },
  deleteOneButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  deleteAllButton: {
    backgroundColor: COLORS.danger,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  deleteButtonText: {
    color: COLORS.textLight,
    fontSize: 16,
    fontWeight: "700",
  },
  cancelDeleteButton: {
    backgroundColor: COLORS.cardSoft,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  cancelDeleteText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
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
    borderBottomColor: COLORS.divider || COLORS.border,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay || "rgba(0, 0, 0, 0.35)",
    justifyContent: "flex-end",
  },
  keyboardAvoidingView: {
    width: "100%",
  },
  addSheet: {
    maxHeight: "88%",
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 24,
  },
  sheetHandle: {
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: COLORS.divider || COLORS.border,
    alignSelf: "center",
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.text,
  },
  sheetCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetCloseText: {
    fontSize: 26,
    color: COLORS.textMuted,
    lineHeight: 30,
  },
  sheetScroll: {
    maxHeight: "100%",
  },
  modalCard: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitleInput: {
    fontSize: 24,
    paddingVertical: 14,
    color: COLORS.text,
  },
  modalDetailInput: {
    fontSize: 18,
    minHeight: 80,
    paddingVertical: 14,
    color: COLORS.text,
  },
  line: {
    height: 1,
    backgroundColor: COLORS.divider || COLORS.border,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 8,
  },
  label: {
    fontSize: 20,
    flex: 1,
    color: COLORS.text,
  },
  pickerBox: {
    backgroundColor: COLORS.cardSoft,
    borderRadius: 14,
    padding: 10,
    width: 130,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  timeBox: {
    backgroundColor: COLORS.cardSoft,
    borderRadius: 14,
    padding: 10,
    width: 82,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pickerText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
  },
  repeatTitle: {
    fontSize: 22,
    fontWeight: "800",
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
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
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
    fontSize: 16,
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
  helpText: {
    fontSize: 14,
    color: COLORS.textMuted,
    paddingBottom: 14,
    lineHeight: 20,
  },
  sheetSaveButton: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 20,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  sheetSaveText: {
    color: COLORS.textLight,
    fontSize: 18,
    fontWeight: "bold",
  },
});
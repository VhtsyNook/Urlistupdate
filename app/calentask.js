import { useRootNavigationState, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { COLORS } from "../src/constants/theme";

import { auth } from "../src/config/firebase";
import {
  deleteRecurringTaskGroup,
  deleteTask,
  listenTasks,
  undoTaskDone,
  updateTaskStatus,
} from "../src/services/taskService";

const TASK_REPEAT_COLORS = {
  never: {
    backgroundColor: COLORS.secondary,
    borderColor: "#8FBABD",
    textColor: COLORS.text,
    timeColor: COLORS.textMuted,
  },
  everyday: {
    backgroundColor: COLORS.primary,
    borderColor: "#E89179",
    textColor: COLORS.text,
    timeColor: COLORS.textMuted,
  },
  everyweek: {
    backgroundColor: COLORS.primaryDark,
    borderColor: "#9E6377",
    textColor: COLORS.textLight,
    timeColor: COLORS.textLight,
  },
  custom: {
    backgroundColor: COLORS.accent,
    borderColor: "#DFC67A",
    textColor: COLORS.text,
    timeColor: COLORS.textMuted,
  },
};

const getRepeatType = (task) => {
  if (!task?.is_recurring) {
    return "never";
  }

  const recurrenceType = String(task?.recurrence_type || "").toLowerCase();

  if (recurrenceType === "everyday" || recurrenceType === "daily") {
    return "everyday";
  }

  if (recurrenceType === "everyweek" || recurrenceType === "weekly") {
    return "everyweek";
  }

  if (recurrenceType === "custom") {
    return "custom";
  }

  return "never";
};

const getTaskRepeatColor = (task) => {
  const repeatType = getRepeatType(task);
  return TASK_REPEAT_COLORS[repeatType] || TASK_REPEAT_COLORS.never;
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

    let unsubscribe = () => {};

    try {
      unsubscribe = listenTasks((data) => {
        setTasks(data);
      });
    } catch (error) {
      console.error("Listen calendar tasks error:", error);

      if (error?.message === "AUTH_REQUIRED") {
        router.replace("/login");
      } else {
        Alert.alert("Error", "โหลดข้อมูลงานไม่สำเร็จ");
      }
    }

    return () => unsubscribe();
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

  const getDayOnly = (date) => {
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);
    return day;
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

  const suggestFreeTimeSlots = (taskList, date, options = {}) => {
    const { minSlotMinutes = 15 } = options;

    const now = new Date();

    const selectedDay = getDayOnly(date);
    const todayOnly = getDayOnly(now);

    if (selectedDay < todayOnly) {
      return {
        status: "past",
        slots: [],
      };
    }

    let dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    if (selectedDay.getTime() === todayOnly.getTime()) {
      dayStart = roundUpToNextFiveMinutes(now);

      if (dayStart >= dayEnd) {
        return {
          status: "today-ended",
          slots: [],
        };
      }
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

    return {
      status:
        selectedDay.getTime() === todayOnly.getTime() ? "today" : "future",
      slots: freeSlots,
    };
  };

  const canGoPrev = currentDate > minDate;
  const canGoNext = currentDate < maxDate;

  const canGoPrevYear = new Date(year - 1, month, 1) >= minDate;
  const canGoNextYear = new Date(year + 1, month, 1) <= maxDate;

  const changeMonth = (value) => {
    const nextDate = new Date(year, month + value, 1);

    if (nextDate < minDate || nextDate > maxDate) return;

    setCurrentDate(nextDate);
    setSelectedDate(nextDate);
    setSelectedTaskId(null);
  };

  const changeYear = (value) => {
    const nextDate = new Date(year + value, month, 1);

    if (nextDate < minDate || nextDate > maxDate) return;

    setCurrentDate(nextDate);
    setSelectedDate(nextDate);
    setSelectedTaskId(null);
  };

  const getDaysInMonth = () => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];

    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }

    return days;
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

  const getPlannerSubtitle = (status) => {
    if (status === "past") {
      return "Past date - suggestion is not available";
    }

    if (status === "today") {
      return "Available free time from now until 23:59";
    }

    if (status === "today-ended") {
      return "No available time left today";
    }

    return "Available free time from 00:00 - 23:59";
  };

  const getOverlapRange = (startA, endA, startB, endB) => {
    const overlapStart = new Date(
      Math.max(startA.getTime(), startB.getTime())
    );

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

  const activeTasks = tasks.filter((task) => !task.is_completed);

  const tasksByDate = (date) => {
    return activeTasks
      .filter((task) => isSameDay(task.start_time, date))
      .sort((a, b) => {
        const timeA = normalizeDate(a.start_time)?.getTime() || 0;
        const timeB = normalizeDate(b.start_time)?.getTime() || 0;
        return timeA - timeB;
      });
  };

  const selectedTasks = tasksByDate(selectedDate);
  const selectedConflictMap = buildConflictInfoMap(selectedTasks);

  const selectedDayAllTasks = tasks
    .filter((task) => isSameDay(task.start_time, selectedDate))
    .sort((a, b) => {
      const timeA = normalizeDate(a.start_time)?.getTime() || 0;
      const timeB = normalizeDate(b.start_time)?.getTime() || 0;
      return timeA - timeB;
    });

  const freeTimeSuggestion = suggestFreeTimeSlots(
    selectedDayAllTasks,
    selectedDate,
    {
      minSlotMinutes: 15,
    }
  );

  const freeTimeSlots = freeTimeSuggestion.slots;
  const plannerStatus = freeTimeSuggestion.status;

  const selectedCompletedTasks = tasks
    .filter(
      (task) => task.is_completed && isSameDay(task.start_time, selectedDate)
    )
    .sort((a, b) => {
      const timeA = normalizeDate(a.completedAt)?.getTime() || 0;
      const timeB = normalizeDate(b.completedAt)?.getTime() || 0;
      return timeB - timeA;
    });

  const handleDoneTask = async (taskId) => {
    if (!ensureLoggedIn()) return;

    try {
      await updateTaskStatus(taskId, "completed");
      setSelectedTaskId(null);
    } catch (error) {
      console.error("Done task error:", error);
      Alert.alert("Error", "อัปเดตสถานะงานไม่สำเร็จ");
    }
  };

  const closeDeleteModal = () => {
    setDeleteModalVisible(false);
    setDeleteTargetTask(null);
  };

  const openDeleteModal = (task) => {
    if (!ensureLoggedIn()) return;

    setDeleteTargetTask(task);
    setDeleteModalVisible(true);
  };

  const performDeleteSingleTask = async () => {
    if (!ensureLoggedIn()) return;
    if (!deleteTargetTask?.id) return;

    try {
      await deleteTask(deleteTargetTask.id);
      setSelectedTaskId(null);
      closeDeleteModal();
    } catch (error) {
      console.error("Delete single task error:", error);
      Alert.alert("Error", "ลบงานไม่สำเร็จ");
    }
  };

  const performDeleteRecurringGroup = async () => {
    if (!ensureLoggedIn()) return;
    if (!deleteTargetTask?.recurrence_group_id) return;

    try {
      await deleteRecurringTaskGroup(deleteTargetTask.recurrence_group_id);
      setSelectedTaskId(null);
      closeDeleteModal();
    } catch (error) {
      console.error("Delete recurring group error:", error);
      Alert.alert("Error", "ลบงานซ้ำทั้งหมดไม่สำเร็จ");
    }
  };

  const handleDeleteTask = (task) => {
    openDeleteModal(task);
  };

  const handleUndoCompletedTask = async (taskId) => {
    if (!ensureLoggedIn()) return;

    try {
      await undoTaskDone(taskId);
      setSelectedTaskId(null);
    } catch (error) {
      console.error("Undo completed task error:", error);
      Alert.alert("Error", "กู้คืนงานไม่สำเร็จ");
    }
  };

  const handleEditTask = (task) => {
    if (!ensureLoggedIn()) return;

    const taskId = task?.id || task?.task_id;

    if (!taskId) {
      Alert.alert("Error", "ไม่พบรหัสงาน");
      return;
    }

    router.push({
      pathname: "/edit-task",
      params: { id: String(taskId) },
    });
  };

  const handleAddTask = () => {
    if (!ensureLoggedIn()) return;

    setSelectedTaskId(null);

    router.push({
      pathname: "/add-task",
    });
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
      <View style={styles.header}>
        <View style={styles.topHeaderRow}>
          <Pressable
            style={styles.homeButton}
            onPress={() => router.replace("/")}
          >
            <Text style={styles.homeText}>⌂</Text>
          </Pressable>

          <View style={styles.yearControl}>
            <Pressable
              style={styles.yearNavButton}
              disabled={!canGoPrevYear}
              onPress={() => changeYear(-1)}
            >
              <Text
                style={[
                  styles.yearNavText,
                  !canGoPrevYear && styles.disabledText,
                ]}
              >
                ‹
              </Text>
            </Pressable>

            <Text style={styles.yearText}>{year + 543} BE</Text>

            <Pressable
              style={styles.yearNavButton}
              disabled={!canGoNextYear}
              onPress={() => changeYear(1)}
            >
              <Text
                style={[
                  styles.yearNavText,
                  !canGoNextYear && styles.disabledText,
                ]}
              >
                ›
              </Text>
            </Pressable>
          </View>

          <Pressable style={styles.addButton} onPress={handleAddTask}>
            <Text style={styles.addText}>＋</Text>
          </Pressable>
        </View>

        <View style={styles.monthHeaderRow}>
          <Pressable
            style={styles.monthNavButton}
            disabled={!canGoPrev}
            onPress={() => changeMonth(-1)}
          >
            <Text style={[styles.navText, !canGoPrev && styles.disabledText]}>
              ‹
            </Text>
          </Pressable>

          <Text style={styles.monthText}>
            {currentDate.toLocaleString("en-US", { month: "long" })}
          </Text>

          <Pressable
            style={styles.monthNavButton}
            disabled={!canGoNext}
            onPress={() => changeMonth(1)}
          >
            <Text style={[styles.navText, !canGoNext && styles.disabledText]}>
              ›
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.weekRow}>
        {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
          <Text key={index} style={styles.weekText}>
            {day}
          </Text>
        ))}
      </View>

      <ScrollView>
        <View style={styles.calendarGrid}>
          {getDaysInMonth().map((date, index) => {
            if (!date) return <View key={index} style={styles.dayBox} />;

            const dayTasks = tasksByDate(date);
            const active = isSameDay(date, selectedDate);
            const isToday = isSameDay(date, today);

            return (
              <Pressable
                key={index}
                style={[
                  styles.dayBox,
                  active && styles.activeDayBox,
                  isToday && styles.todayBox,
                ]}
                onPress={() => {
                  setSelectedDate(date);
                  setSelectedTaskId(null);
                }}
              >
                <Text
                  style={[
                    styles.dayNumber,
                    active && styles.activeText,
                    isToday && styles.todayText,
                  ]}
                >
                  {date.getDate()}
                </Text>

                {dayTasks.slice(0, 2).map((task) => {
                  const taskColor = getTaskRepeatColor(task);

                  return (
                    <View
                      key={task.id}
                      style={[
                        styles.taskChip,
                        {
                          backgroundColor: taskColor.backgroundColor,
                          borderColor: taskColor.borderColor,
                        },
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        style={[
                          styles.taskChipText,
                          { color: taskColor.textColor },
                        ]}
                      >
                        {task.title}
                      </Text>

                      <Text
                        numberOfLines={1}
                        style={[
                          styles.taskTime,
                          { color: taskColor.timeColor },
                        ]}
                      >
                        {formatTime(task.start_time)}
                      </Text>
                    </View>
                  );
                })}

                {dayTasks.length > 2 && (
                  <Text style={styles.moreText}>
                    +{dayTasks.length - 2} more
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.todaySection}>
          <Text style={styles.sectionTitle}>
            Tasks on {selectedDate.getDate()}{" "}
            {selectedDate.toLocaleString("en-US", { month: "short" })}
          </Text>

          {selectedTasks.length === 0 ? (
            <Text style={styles.emptyText}>No active tasks</Text>
          ) : (
            selectedTasks.map((task) => {
              const isSelected = selectedTaskId === task.id;
              const taskColor = getTaskRepeatColor(task);
              const taskConflicts = selectedConflictMap[task.id] || [];

              return (
                <Pressable
                  key={task.id}
                  style={[
                    styles.taskCard,
                    isSelected && styles.taskCardSelected,
                    { borderLeftColor: taskColor.backgroundColor },
                  ]}
                  onPress={() =>
                    setSelectedTaskId(isSelected ? null : task.id)
                  }
                >
                  <View style={styles.taskCardHeader}>
                    <View
                      style={[
                        styles.repeatDot,
                        { backgroundColor: taskColor.backgroundColor },
                      ]}
                    />

                    <Text style={styles.taskTitle}>{task.title}</Text>
                  </View>

                  <Text style={styles.taskDetail}>
                    {formatTime(task.start_time)} - {formatTime(task.end_time)}
                  </Text>

                  <Text style={styles.repeatLabel}>
                    Repeat: {getRepeatType(task)}
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

                  {task.detail ? (
                    <Text style={styles.detailText}>{task.detail}</Text>
                  ) : null}

                  {isSelected && (
                    <View style={styles.actionRow}>
                      <Pressable
                        style={styles.doneButton}
                        onPress={() => handleDoneTask(task.id)}
                      >
                        <Text style={styles.actionText}>Done</Text>
                      </Pressable>

                      <Pressable
                        style={styles.editButton}
                        onPress={() => handleEditTask(task)}
                      >
                        <Text style={styles.actionText}>Edit</Text>
                      </Pressable>

                      <Pressable
                        style={styles.deleteButton}
                        onPress={() => handleDeleteTask(task)}
                      >
                        <Text style={styles.actionText}>Delete</Text>
                      </Pressable>
                    </View>
                  )}
                </Pressable>
              );
            })
          )}

          <View style={styles.plannerSection}>
            <View style={styles.plannerHeaderRow}>
              <View style={styles.plannerTitleBox}>
                <Text style={styles.plannerTitle}>Free Time</Text>
                <Text style={styles.plannerSubtitle}>
                  {getPlannerSubtitle(plannerStatus)}
                </Text>
              </View>

              <Text style={styles.plannerBadge}>
                {freeTimeSlots.length} slots
              </Text>
            </View>

            {plannerStatus === "past" ? (
              <Text style={styles.emptyText}>
                Past date - free time suggestion is not available
              </Text>
            ) : freeTimeSlots.length === 0 ? (
              <Text style={styles.emptyText}>
                No available free time slots on this day
              </Text>
            ) : (
              freeTimeSlots.map((slot, index) => (
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

          {selectedCompletedTasks.length > 0 && (
            <View style={styles.completedSection}>
              <Text style={styles.completedTitle}>
                Completed {selectedCompletedTasks.length}
              </Text>

              {selectedCompletedTasks.map((task) => (
                <View key={task.id} style={styles.completedCard}>
                  <View style={styles.completedCheckBox}>
                    <Text style={styles.completedCheck}>✓</Text>
                  </View>

                  <View style={styles.completedContent}>
                    <Text style={styles.completedTaskTitle}>{task.title}</Text>

                    <Text style={styles.completedTaskTime}>
                      {formatTime(task.start_time)} -{" "}
                      {formatTime(task.end_time)}
                    </Text>

                    <Text style={styles.completedRepeatLabel}>
                      Repeat: {getRepeatType(task)}
                    </Text>

                    {task.detail ? (
                      <Text style={styles.completedTaskDetail}>
                        {task.detail}
                      </Text>
                    ) : null}

                    <Pressable
                      style={styles.undoButton}
                      onPress={() => handleUndoCompletedTask(task.id)}
                    >
                      <Text style={styles.undoButtonText}>Undo</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

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
                : "Are you sure you want to delete this task?"}
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
                <Text style={styles.deleteButtonText}>Delete Task</Text>
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
    paddingBottom: 12,
    backgroundColor: COLORS.background,
  },
  topHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  homeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  homeText: {
    fontSize: 32,
    color: COLORS.primaryDark,
    fontWeight: "700",
    lineHeight: 38,
  },
  yearControl: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  yearNavButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  yearNavText: {
    fontSize: 32,
    color: COLORS.primaryDark,
    fontWeight: "600",
    lineHeight: 34,
  },
  yearText: {
    minWidth: 90,
    fontSize: 22,
    color: COLORS.primaryDark,
    fontWeight: "600",
    textAlign: "center",
  },
  addButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  addText: {
    fontSize: 38,
    color: COLORS.primaryDark,
    lineHeight: 42,
  },
  monthHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  monthNavButton: {
    width: 72,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
  },
  navText: {
    fontSize: 46,
    color: COLORS.primaryDark,
    lineHeight: 52,
  },
  disabledText: {
    color: COLORS.completed,
  },
  monthText: {
    minWidth: 170,
    textAlign: "center",
    fontSize: 48,
    fontWeight: "bold",
    color: COLORS.text,
    lineHeight: 56,
  },
  weekRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 8,
    marginTop: 10,
    backgroundColor: COLORS.background,
  },
  weekText: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.text,
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: COLORS.background,
  },
  dayBox: {
    width: `${100 / 7}%`,
    minHeight: 145,
    paddingHorizontal: 3,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderBottomColor: COLORS.border,
    borderRightColor: COLORS.border,
    overflow: "hidden",
  },
  activeDayBox: {
    backgroundColor: COLORS.accent,
  },
  todayBox: {
    borderWidth: 1,
    borderColor: COLORS.primaryDark,
  },
  dayNumber: {
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 4,
    color: COLORS.text,
    lineHeight: 26,
  },
  activeText: {
    color: COLORS.primaryDark,
  },
  todayText: {
    color: COLORS.primaryDark,
  },
  taskChip: {
    width: "100%",
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 3,
    marginBottom: 3,
    borderWidth: 1,
    overflow: "hidden",
  },
  taskChipText: {
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 12,
  },
  taskTime: {
    fontSize: 10,
    lineHeight: 12,
  },
  moreText: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
    fontWeight: "700",
    textAlign: "center",
  },
  todaySection: {
    padding: 20,
    paddingBottom: 90,
    backgroundColor: COLORS.background,
  },
  sectionTitle: {
    fontSize: 26,
    fontWeight: "bold",
    color: COLORS.text,
    marginBottom: 14,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 18,
    marginBottom: 12,
  },
  taskCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderLeftWidth: 8,
    borderColor: COLORS.border,
  },
  taskCardSelected: {
    borderWidth: 2,
    borderLeftWidth: 8,
    borderColor: COLORS.primaryDark,
  },
  taskCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  repeatDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  taskTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.text,
  },
  taskDetail: {
    marginTop: 6,
    fontSize: 16,
    color: COLORS.primaryDark,
  },
  repeatLabel: {
    marginTop: 4,
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: "600",
  },
  conflictTimeBox: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  conflictTimeLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.primaryDark,
    marginBottom: 4,
  },
  conflictTimeText: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 18,
    fontWeight: "600",
  },
  detailText: {
    marginTop: 8,
    fontSize: 15,
    color: COLORS.textMuted,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  doneButton: {
    flex: 1,
    backgroundColor: COLORS.secondary,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  editButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  deleteButton: {
    flex: 1,
    backgroundColor: COLORS.danger,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  actionText: {
    color: COLORS.textLight,
    fontSize: 16,
    fontWeight: "700",
  },
  plannerSection: {
    marginTop: 18,
    marginBottom: 20,
    backgroundColor: COLORS.cardSoft,
    borderRadius: 18,
    padding: 16,
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
    fontSize: 21,
    fontWeight: "bold",
    color: COLORS.text,
  },
  plannerSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: COLORS.textMuted,
  },
  plannerBadge: {
    backgroundColor: COLORS.primaryDark,
    color: COLORS.textLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
  },
  freeSlotCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
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
    color: COLORS.primaryDark,
  },
  freeSlotDuration: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.textMuted,
  },
  completedSection: {
    marginTop: 20,
    backgroundColor: COLORS.cardSoft,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  completedTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: COLORS.textMuted,
    marginBottom: 12,
  },
  completedCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  completedCheckBox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: COLORS.secondary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  completedCheck: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "bold",
  },
  completedContent: {
    flex: 1,
  },
  completedTaskTitle: {
    fontSize: 18,
    color: COLORS.completed,
    textDecorationLine: "line-through",
  },
  completedTaskTime: {
    marginTop: 4,
    fontSize: 14,
    color: COLORS.textMuted,
  },
  completedRepeatLabel: {
    marginTop: 4,
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: "600",
  },
  completedTaskDetail: {
    marginTop: 4,
    fontSize: 14,
    color: COLORS.textMuted,
  },
  undoButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  undoButtonText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
  deleteOverlay: {
    flex: 1,
    backgroundColor: "rgba(42, 37, 40, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  deleteModalBox: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  deleteModalTitle: {
    fontSize: 24,
    fontWeight: "bold",
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
    backgroundColor: COLORS.secondary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  cancelDeleteText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
  },
});
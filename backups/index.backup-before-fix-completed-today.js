/*import { Ionicons } from "@expo/vector-icons";
import { useRootNavigationState, useRouter } from "expo-router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import BottomNav from "../src/components/BottomNav";
import { auth } from "../src/config/firebase";
import { COLORS } from "../src/constants/theme";
import { useLanguage } from "../src/i18n/LanguageContext";
import {
  listenTasks,
  undoTaskDone,
  updateTaskStatus,
} from "../src/services/taskService";

export default function HomeScreen() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { t, language, toggleLanguage } = useLanguage();

  const today = useMemo(() => new Date(), []);
  const [tasks, setTasks] = useState([]);
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

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
        Alert.alert(t("error"), "Unable to load tasks.");
      }
    }

    return () => unsubscribe();
  }, [isAuthReady, user, router, t]);

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

  const isFutureDate = (value) => {
    const date = normalizeDate(value);
    if (!date) return false;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    return date > todayStart && !isSameDay(date, todayStart);
  };

  const formatTime = (value) => {
    const date = normalizeDate(value);
    if (!date) return "";

    return date.toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDateShort = (value) => {
    const date = normalizeDate(value);
    if (!date) return "";

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const formatDuration = (minutes) => {
    if (minutes < 60) return `${minutes} min`;

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (remainingMinutes === 0) return `${hours} hr`;

    return `${hours} hr ${remainingMinutes} min`;
  };

  const getUserName = () => {
    if (user?.displayName) return user.displayName;
    if (user?.email) return user.email.split("@")[0];
    return "User";
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

    if (dayStart >= dayEnd) return [];

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

  const getPriorityScore = (priority) => {
    const value = String(priority || "Medium").toLowerCase();

    if (value === "high") return 30;
    if (value === "medium") return 20;
    if (value === "low") return 10;

    return 15;
  };

  const getDeadlineScore = (deadline) => {
    const deadlineDate = normalizeDate(deadline);

    if (!deadlineDate) return 0;

    const now = new Date();
    const diffMs = deadlineDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 35;
    if (diffDays === 1) return 30;
    if (diffDays <= 3) return 25;
    if (diffDays <= 7) return 15;

    return 5;
  };

  const getFitScore = (taskDuration, slotDuration) => {
    if (!taskDuration || !slotDuration) return 0;

    if (taskDuration > slotDuration) return -50;

    const remaining = slotDuration - taskDuration;

    if (remaining <= 15) return 30;
    if (remaining <= 30) return 25;
    if (remaining <= 60) return 15;

    return 8;
  };

  const getSmartSuggestedTaskForSlot = (slot, candidateTasks) => {
    if (!slot || !candidateTasks || candidateTasks.length === 0) {
      return null;
    }

    const scoredTasks = candidateTasks
      .filter((task) => !task.is_completed)
      .map((task) => {
        const duration = Number(task.estimated_duration_minutes || 60);
        const priority = task.priority || "Medium";
        const deadline = task.deadline;

        const priorityScore = getPriorityScore(priority);
        const deadlineScore = getDeadlineScore(deadline);
        const fitScore = getFitScore(duration, slot.duration_minutes);

        const totalScore = priorityScore + deadlineScore + fitScore;

        const reasons = [];

        if (String(priority).toLowerCase() === "high") {
          reasons.push(language === "th" ? "ความสำคัญสูง" : "high priority");
        } else if (String(priority).toLowerCase() === "medium") {
          reasons.push(
            language === "th" ? "ความสำคัญปานกลาง" : "medium priority"
          );
        }

        const deadlineDate = normalizeDate(deadline);

        if (deadlineDate) {
          const now = new Date();
          const diffDays = Math.ceil(
            (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (diffDays <= 0) {
            reasons.push(
              language === "th" ? "กำหนดส่งวันนี้" : "deadline is today"
            );
          } else if (diffDays === 1) {
            reasons.push(
              language === "th" ? "กำหนดส่งพรุ่งนี้" : "deadline is tomorrow"
            );
          } else if (diffDays <= 3) {
            reasons.push(
              language === "th" ? "กำหนดส่งใกล้เข้ามา" : "deadline is near"
            );
          }
        }

        if (duration <= slot.duration_minutes) {
          reasons.push(
            language === "th"
              ? `พอดีกับช่วงว่าง ${formatDuration(slot.duration_minutes)}`
              : `fits this ${formatDuration(slot.duration_minutes)} free slot`
          );
        } else {
          reasons.push(
            language === "th"
              ? `ต้องใช้เวลา ${formatDuration(duration)}`
              : `needs ${formatDuration(duration)}`
          );
        }

        return {
          task,
          score: totalScore,
          duration,
          reason:
            reasons.length > 0
              ? reasons.join(", ")
              : language === "th"
              ? "เหมาะกับช่วงเวลาว่างนี้"
              : "suitable for this available time",
        };
      })
      .sort((a, b) => b.score - a.score);

    return scoredTasks[0] || null;
  };

  const getPriorityLabel = (task) => {
    if (task.priority) return task.priority;

    if (task.has_conflict) return "Conflict";
    if (task.is_recurring) return "Repeat";

    return "Task";
  };

  const getPriorityStyle = (task) => {
    if (task.has_conflict) {
      return {
        bg: "#FEE2E2",
        color: "#DC2626",
        icon: "alert-circle-outline",
      };
    }

    if (task.priority === "High" || task.priority === "high") {
      return {
        bg: "#FEE2E2",
        color: "#DC2626",
        icon: "flag-outline",
      };
    }

    if (task.is_recurring) {
      return {
        bg: "#EAF4FF",
        color: COLORS.primary,
        icon: "repeat-outline",
      };
    }

    if (task.is_generated_session) {
      return {
        bg: "#F3E8FF",
        color: "#7C3AED",
        icon: "layers-outline",
      };
    }

    if (task.planning_enabled) {
      return {
        bg: "#ECFDF5",
        color: COLORS.success,
        icon: "git-branch-outline",
      };
    }

    return {
      bg: COLORS.cardSoft,
      color: COLORS.textSecondary,
      icon: "ellipse-outline",
    };
  };

  const todayTasks = tasks
    .filter((task) => isSameDay(task.start_time, today))
    .sort((a, b) => {
      const timeA = normalizeDate(a.start_time)?.getTime() || 0;
      const timeB = normalizeDate(b.start_time)?.getTime() || 0;
      return timeA - timeB;
    });

  const activeTodayTasks = todayTasks.filter((task) => !task.is_completed);
  const completedTodayTasks = todayTasks.filter((task) => task.is_completed);

  const upcomingTasks = tasks
    .filter((task) => !task.is_completed && isFutureDate(task.start_time))
    .sort((a, b) => {
      const timeA = normalizeDate(a.start_time)?.getTime() || 0;
      const timeB = normalizeDate(b.start_time)?.getTime() || 0;
      return timeA - timeB;
    })
    .slice(0, 3);

  const todayFreeTimeSlots = suggestTodayFreeTimeSlots(todayTasks, {
    minSlotMinutes: 15,
  });

  const firstFreeSlot = todayFreeTimeSlots[0];

  const smartSuggestion = getSmartSuggestedTaskForSlot(firstFreeSlot, [
    ...activeTodayTasks,
    ...upcomingTasks,
  ]);

  const suggestedTask = smartSuggestion?.task || null;

  const handleDoneTask = async (taskId) => {
    try {
      await updateTaskStatus(taskId, "completed");
    } catch (error) {
      console.error("Done task error:", error);
      Alert.alert(t("error"), "Unable to update task status.");
    }
  };

  const handleUndoTask = async (taskId) => {
    try {
      await undoTaskDone(taskId);
    } catch (error) {
      console.error("Undo task error:", error);
      Alert.alert(t("error"), "Unable to restore this task.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (error) {
      console.error("Logout error:", error);
      Alert.alert(t("error"), "Unable to log out.");
    }
  };

  const handleLanguagePress = () => {
    toggleLanguage();
  };

  const handleNotificationPress = () => {
    Alert.alert(t("notifications"), t("notificationsComingSoon"));
  };

  if (!rootNavigationState?.key || !isAuthReady) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>{t("loading")}</Text>
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
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerTextBox}>
            <Text style={styles.greetingText}>
              {t("hello")}, {getUserName()}
            </Text>

            <Text style={styles.dateText}>
              {today.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </Text>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              style={styles.iconButton}
              onPress={handleLanguagePress}
            >
              <Text style={styles.languageText}>
                {language === "en" ? "TH" : "EN"}
              </Text>
            </Pressable>

            <Pressable
              style={styles.iconButton}
              onPress={handleNotificationPress}
            >
              <Ionicons
                name="notifications-outline"
                size={22}
                color={COLORS.text}
              />
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleBox}>
            <View style={styles.sectionIconBlue}>
              <Ionicons
                name="checkbox-outline"
                size={20}
                color={COLORS.primary}
              />
            </View>
            <Text style={styles.sectionTitle}>{t("todaysTasks")}</Text>
          </View>

          <Pressable onPress={() => router.push("/tasks")}>
            <Text style={styles.viewAllText}>{t("viewAll")} ›</Text>
          </Pressable>
        </View>

        {activeTodayTasks.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t("noActiveTasksToday")}</Text>
          </View>
        ) : (
          activeTodayTasks.slice(0, 3).map((task, index) => {
            const tagStyle = getPriorityStyle(task);

            return (
              <Pressable
                key={task.id}
                style={[
                  styles.taskCard,
                  index === 0 && styles.taskCardRed,
                  index === 1 && styles.taskCardBlue,
                  index === 2 && styles.taskCardGreen,
                ]}
              >
                <Pressable
                  style={styles.checkCircle}
                  onPress={() => handleDoneTask(task.id)}
                />

                <View style={styles.taskContent}>
                  <Text style={styles.taskTitle}>{task.title}</Text>

                  <View style={styles.timeRow}>
                    <Ionicons
                      name="time-outline"
                      size={15}
                      color={COLORS.textMuted}
                    />
                    <Text style={styles.taskTime}>
                      {formatTime(task.start_time)} - {formatTime(task.end_time)}
                    </Text>
                  </View>

                  {task.planning_enabled ? (
                    <Text style={styles.progressText}>
                      {task.planned_completed_count || 0}/
                      {task.planned_session_count || 0} sessions completed
                    </Text>
                  ) : null}
                </View>

                <View
                  style={[
                    styles.taskTag,
                    {
                      backgroundColor: tagStyle.bg,
                    },
                  ]}
                >
                  <Ionicons
                    name={tagStyle.icon}
                    size={14}
                    color={tagStyle.color}
                  />
                  <Text
                    style={[
                      styles.taskTagText,
                      {
                        color: tagStyle.color,
                      },
                    ]}
                  >
                    {getPriorityLabel(task)}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}

        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleBox}>
            <View style={styles.sectionIconPurple}>
              <Ionicons name="time-outline" size={20} color="#7C3AED" />
            </View>
            <Text style={styles.sectionTitle}>{t("upcomingTasks")}</Text>
          </View>

          <Pressable onPress={() => router.push("/tasks")}>
            <Text style={styles.viewAllText}>{t("viewAll")} ›</Text>
          </Pressable>
        </View>

        <View style={styles.upcomingCard}>
          {upcomingTasks.length === 0 ? (
            <Text style={styles.emptyText}>{t("noUpcomingTasks")}</Text>
          ) : (
            upcomingTasks.map((task, index) => (
              <View
                key={task.id}
                style={[
                  styles.upcomingRow,
                  index !== upcomingTasks.length - 1 && styles.upcomingDivider,
                ]}
              >
                <View style={styles.upcomingIcon}>
                  <Ionicons
                    name={
                      task.is_generated_session
                        ? "layers-outline"
                        : "document-text-outline"
                    }
                    size={18}
                    color="#7C3AED"
                  />
                </View>

                <Text style={styles.upcomingTitle} numberOfLines={1}>
                  {task.title}
                </Text>

                <View style={styles.upcomingTimeBox}>
                  <Ionicons
                    name="calendar-outline"
                    size={15}
                    color={COLORS.textMuted}
                  />
                  <Text style={styles.upcomingTime}>
                    {formatDateShort(task.start_time)},{" "}
                    {formatTime(task.start_time)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleBox}>
            <View style={styles.sectionIconYellow}>
              <Ionicons name="bulb-outline" size={20} color="#D97706" />
            </View>
            <Text style={styles.sectionTitle}>{t("todaysFreeTime")}</Text>
          </View>
        </View>

        <View style={styles.freeTimeCard}>
          <View style={styles.freeTimeIllustration}>
            <Ionicons name="alarm-outline" size={46} color={COLORS.primary} />
          </View>

          <View style={styles.freeTimeInfo}>
            {firstFreeSlot ? (
              <>
                <View style={styles.freeTimeLine}>
                  <Ionicons
                    name="time-outline"
                    size={17}
                    color={COLORS.textMuted}
                  />
                  <Text style={styles.freeTimeText}>
                    {t("available")}:{" "}
                    <Text style={styles.freeTimeHighlight}>
                      {formatTime(firstFreeSlot.start_time)} -{" "}
                      {formatTime(firstFreeSlot.end_time)}
                    </Text>
                  </Text>
                </View>

                <View style={styles.freeTimeLine}>
                  <Ionicons name="star-outline" size={17} color="#D97706" />
                  <Text style={styles.freeTimeText}>
                    {t("suggestedTask")}:{" "}
                    <Text style={styles.freeTimeTask}>
                      {suggestedTask?.title || t("noSuitableTask")}
                    </Text>
                  </Text>
                </View>

                <View style={styles.freeTimeLine}>
                  <Ionicons
                    name="locate-outline"
                    size={17}
                    color={COLORS.textMuted}
                  />
                  <Text style={styles.freeTimeReason}>
                    {t("reason")}:{" "}
                    {smartSuggestion?.reason ||
                      "choose a task that fits this free slot"}
                  </Text>
                </View>
              </>
            ) : (
              <Text style={styles.emptyText}>{t("noAvailableFreeTime")}</Text>
            )}
          </View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleBox}>
            <View style={styles.sectionIconGreen}>
              <Ionicons
                name="checkmark-circle-outline"
                size={20}
                color={COLORS.success}
              />
            </View>
            <Text style={styles.sectionTitle}>{t("completedTasks")}</Text>
          </View>

          <Pressable onPress={() => router.push("/tasks")}>
            <Text style={styles.viewAllText}>{t("viewAll")} ›</Text>
          </Pressable>
        </View>

        <View style={styles.completedCard}>
          {completedTodayTasks.length === 0 ? (
            <Text style={styles.emptyText}>{t("noCompletedTasksToday")}</Text>
          ) : (
            completedTodayTasks.slice(0, 2).map((task) => (
              <View key={task.id} style={styles.completedRow}>
                <Pressable
                  style={styles.completedCheck}
                  onPress={() => handleUndoTask(task.id)}
                >
                  <Ionicons
                    name="checkmark"
                    size={18}
                    color={COLORS.textLight}
                  />
                </Pressable>

                <Text style={styles.completedTitle} numberOfLines={1}>
                  {task.title}
                </Text>

                <View style={styles.completedBadge}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={15}
                    color={COLORS.success}
                  />
                  <Text style={styles.completedBadgeText}>{t("done")}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <BottomNav activeTab="home" />

      <Pressable
        style={styles.fabButton}
        onPress={() => router.push("/add-task")}
      >
        <Ionicons name="add" size={34} color={COLORS.textLight} />
      </Pressable>
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
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 22,
    paddingTop: 62,
    paddingBottom: 130,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 28,
  },
  headerTextBox: {
    flex: 1,
    paddingRight: 14,
  },
  greetingText: {
    fontSize: 34,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: -0.6,
  },
  dateText: {
    marginTop: 8,
    fontSize: 16,
    color: COLORS.textMuted,
  },
  headerActions: {
    flexDirection: "row",
    gap: 10,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  languageText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: "900",
  },
  sectionHeaderRow: {
    marginTop: 8,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitleBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sectionIconBlue: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#EAF4FF",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionIconPurple: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#F3E8FF",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionIconYellow: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionIconGreen: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.text,
  },
  viewAllText: {
    fontSize: 15,
    color: COLORS.primary,
    fontWeight: "700",
  },
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 18,
  },
  emptyText: {
    fontSize: 15,
    color: COLORS.textMuted,
  },
  taskCard: {
    minHeight: 94,
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    borderLeftWidth: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  taskCardRed: {
    borderLeftColor: "#FCA5A5",
  },
  taskCardBlue: {
    borderLeftColor: "#93C5FD",
  },
  taskCardGreen: {
    borderLeftColor: "#86EFAC",
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: COLORS.primary,
    marginRight: 14,
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.text,
  },
  progressText: {
    marginTop: 6,
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: "800",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 7,
    gap: 6,
  },
  taskTime: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: "600",
  },
  taskTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  taskTagText: {
    fontSize: 12,
    fontWeight: "800",
  },
  upcomingCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 22,
    overflow: "hidden",
  },
  upcomingRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  upcomingDivider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider || COLORS.border,
  },
  upcomingIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F3E8FF",
    alignItems: "center",
    justifyContent: "center",
  },
  upcomingTitle: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
    fontWeight: "700",
  },
  upcomingTimeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  upcomingTime: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: "600",
  },
  freeTimeCard: {
    backgroundColor: "#FFFBEB",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#FDE68A",
    padding: 18,
    marginBottom: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  freeTimeIllustration: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
  },
  freeTimeInfo: {
    flex: 1,
    gap: 8,
  },
  freeTimeLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  freeTimeText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  freeTimeHighlight: {
    color: "#D97706",
    fontWeight: "900",
  },
  freeTimeTask: {
    color: COLORS.text,
    fontWeight: "900",
  },
  freeTimeReason: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: "600",
  },
  completedCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    marginBottom: 12,
  },
  completedRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  completedCheck: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.success,
    alignItems: "center",
    justifyContent: "center",
  },
  completedTitle: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
    fontWeight: "700",
  },
  completedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  completedBadgeText: {
    color: COLORS.success,
    fontSize: 12,
    fontWeight: "800",
  },
  fabButton: {
    position: "absolute",
    right: 30,
    bottom: 92,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: COLORS.background,
  },
});
*/
import { Ionicons } from "@expo/vector-icons";
import { useRootNavigationState, useRouter } from "expo-router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import BottomNav from "../src/components/BottomNav";
import { auth } from "../src/config/firebase";
import { COLORS } from "../src/constants/theme";
import { useLanguage } from "../src/i18n/LanguageContext";
import {
  listenTasks,
  undoTaskDone,
  updateTaskStatus,
} from "../src/services/taskService";
import {
  formatDuration,
  getBestRecommendationForDate,
  normalizeDate,
} from "../src/utils/smartScheduler";

export default function HomeScreen() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { t, language, toggleLanguage } = useLanguage();

  const today = useMemo(() => new Date(), []);
  const [tasks, setTasks] = useState([]);
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

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
        Alert.alert(t("error"), "Unable to load tasks.");
      }
    }

    return () => unsubscribe();
  }, [isAuthReady, user, router, t]);

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

  const isFutureDate = (value) => {
    const date = normalizeDate(value);
    if (!date) return false;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    return date > todayStart && !isSameDay(date, todayStart);
  };

  const formatTime = (value) => {
    const date = normalizeDate(value);
    if (!date) return "";

    return date.toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDateShort = (value) => {
    const date = normalizeDate(value);
    if (!date) return "";

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const getUserName = () => {
    if (user?.displayName) return user.displayName;
    if (user?.email) return user.email.split("@")[0];
    return "User";
  };

  const translateRecommendationReason = (reason) => {
    if (language !== "th") return reason;

    const reasonMap = {
      "High priority": "ความสำคัญสูง",
      "Medium priority": "ความสำคัญปานกลาง",
      "Low priority": "ความสำคัญต่ำ",
      "Deadline is today": "กำหนดส่งวันนี้",
      "Deadline is tomorrow": "กำหนดส่งพรุ่งนี้",
      "Deadline is near": "กำหนดส่งใกล้เข้ามา",
      "Overdue deadline": "เลยกำหนดส่งแล้ว",
      "Part of a planning session": "เป็นงานย่อยจากแผนการทำงาน",
      "Main planning task": "เป็นงานหลักแบบวางแผน",
      "Has time conflict, may need adjustment": "มีเวลาทับซ้อน อาจต้องปรับเวลา",
    };

    if (reasonMap[reason]) return reasonMap[reason];

    if (reason.startsWith("Fits this")) {
      return reason
        .replace("Fits this", "พอดีกับช่วงว่าง")
        .replace("free slot", "");
    }

    if (reason.startsWith("Needs")) {
      return reason
        .replace("Needs", "ต้องใช้เวลา")
        .replace("longer than this free slot", "นานกว่าช่วงว่างนี้");
    }

    return reason;
  };

  const formatRecommendationReasons = (recommendation) => {
    if (!recommendation?.reasons || recommendation.reasons.length === 0) {
      return language === "th"
        ? "เหมาะกับช่วงเวลาว่างนี้"
        : "Suitable for this available time";
    }

    return recommendation.reasons
      .slice(0, 3)
      .map(translateRecommendationReason)
      .join(", ");
  };

  const getPriorityLabel = (task) => {
    if (task.priority) return task.priority;

    if (task.has_conflict) return "Conflict";
    if (task.is_recurring) return "Repeat";

    return "Task";
  };

  const getPriorityStyle = (task) => {
    if (task.has_conflict) {
      return {
        bg: "#FEE2E2",
        color: "#DC2626",
        icon: "alert-circle-outline",
      };
    }

    if (task.is_generated_session) {
      return {
        bg: "#F3E8FF",
        color: "#7C3AED",
        icon: "layers-outline",
      };
    }

    if (task.planning_enabled) {
      return {
        bg: "#ECFDF5",
        color: COLORS.success,
        icon: "git-branch-outline",
      };
    }

    if (task.priority === "High" || task.priority === "high") {
      return {
        bg: "#FEE2E2",
        color: "#DC2626",
        icon: "flag-outline",
      };
    }

    if (task.priority === "Medium" || task.priority === "medium") {
      return {
        bg: "#FEF3C7",
        color: COLORS.warning,
        icon: "alert-outline",
      };
    }

    if (task.priority === "Low" || task.priority === "low") {
      return {
        bg: "#DCFCE7",
        color: COLORS.success,
        icon: "leaf-outline",
      };
    }

    if (task.is_recurring) {
      return {
        bg: "#EAF4FF",
        color: COLORS.primary,
        icon: "repeat-outline",
      };
    }

    return {
      bg: COLORS.cardSoft,
      color: COLORS.textSecondary,
      icon: "ellipse-outline",
    };
  };

  const todayTasks = tasks
    .filter((task) => isSameDay(task.start_time, today))
    .sort((a, b) => {
      const timeA = normalizeDate(a.start_time)?.getTime() || 0;
      const timeB = normalizeDate(b.start_time)?.getTime() || 0;
      return timeA - timeB;
    });

  const activeTodayTasks = todayTasks.filter((task) => !task.is_completed);
  const completedTodayTasks = todayTasks.filter((task) => task.is_completed);

  const upcomingTasks = tasks
    .filter((task) => !task.is_completed && isFutureDate(task.start_time))
    .sort((a, b) => {
      const timeA = normalizeDate(a.start_time)?.getTime() || 0;
      const timeB = normalizeDate(b.start_time)?.getTime() || 0;
      return timeA - timeB;
    })
    .slice(0, 3);

  const smartFreeTimeResult = getBestRecommendationForDate(tasks, today, {
    minSlotMinutes: 15,
    startHour: 0,
    endHour: 23,
    maxRecommendations: 3,
  });

  const firstFreeSlot = smartFreeTimeResult.slots[0] || null;
  const bestRecommendation = smartFreeTimeResult.best;
  const suggestedTask = bestRecommendation?.task || null;

  const handleDoneTask = async (taskId) => {
    try {
      await updateTaskStatus(taskId, "completed");
    } catch (error) {
      console.error("Done task error:", error);
      Alert.alert(t("error"), "Unable to update task status.");
    }
  };

  const handleUndoTask = async (taskId) => {
    try {
      await undoTaskDone(taskId);
    } catch (error) {
      console.error("Undo task error:", error);
      Alert.alert(t("error"), "Unable to restore this task.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (error) {
      console.error("Logout error:", error);
      Alert.alert(t("error"), "Unable to log out.");
    }
  };

  const handleLanguagePress = () => {
    toggleLanguage();
  };

  const handleNotificationPress = () => {
    Alert.alert(t("notifications"), t("notificationsComingSoon"));
  };

  if (!rootNavigationState?.key || !isAuthReady) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>{t("loading")}</Text>
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
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerTextBox}>
            <Text style={styles.greetingText}>
              {t("hello")}, {getUserName()}
            </Text>

            <Text style={styles.dateText}>
              {today.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </Text>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              style={styles.iconButton}
              onPress={handleLanguagePress}
            >
              <Text style={styles.languageText}>
                {language === "en" ? "TH" : "EN"}
              </Text>
            </Pressable>

            <Pressable
              style={styles.iconButton}
              onPress={handleNotificationPress}
            >
              <Ionicons
                name="notifications-outline"
                size={22}
                color={COLORS.text}
              />
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleBox}>
            <View style={styles.sectionIconBlue}>
              <Ionicons
                name="checkbox-outline"
                size={20}
                color={COLORS.primary}
              />
            </View>
            <Text style={styles.sectionTitle}>{t("todaysTasks")}</Text>
          </View>

          <Pressable onPress={() => router.push("/tasks")}>
            <Text style={styles.viewAllText}>{t("viewAll")} ›</Text>
          </Pressable>
        </View>

        {activeTodayTasks.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t("noActiveTasksToday")}</Text>
          </View>
        ) : (
          activeTodayTasks.slice(0, 3).map((task, index) => {
            const tagStyle = getPriorityStyle(task);

            return (
              <Pressable
                key={task.id}
                style={[
                  styles.taskCard,
                  index === 0 && styles.taskCardRed,
                  index === 1 && styles.taskCardBlue,
                  index === 2 && styles.taskCardGreen,
                ]}
              >
                <Pressable
                  style={styles.checkCircle}
                  onPress={() => handleDoneTask(task.id)}
                />

                <View style={styles.taskContent}>
                  <Text style={styles.taskTitle}>{task.title}</Text>

                  <View style={styles.timeRow}>
                    <Ionicons
                      name="time-outline"
                      size={15}
                      color={COLORS.textMuted}
                    />
                    <Text style={styles.taskTime}>
                      {formatTime(task.start_time)} - {formatTime(task.end_time)}
                    </Text>
                  </View>

                  {task.planning_enabled ? (
                    <Text style={styles.progressText}>
                      {task.planned_completed_count || 0}/
                      {task.planned_session_count || 0} sessions completed
                    </Text>
                  ) : null}
                </View>

                <View
                  style={[
                    styles.taskTag,
                    {
                      backgroundColor: tagStyle.bg,
                    },
                  ]}
                >
                  <Ionicons
                    name={tagStyle.icon}
                    size={14}
                    color={tagStyle.color}
                  />
                  <Text
                    style={[
                      styles.taskTagText,
                      {
                        color: tagStyle.color,
                      },
                    ]}
                  >
                    {getPriorityLabel(task)}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}

        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleBox}>
            <View style={styles.sectionIconPurple}>
              <Ionicons name="time-outline" size={20} color="#7C3AED" />
            </View>
            <Text style={styles.sectionTitle}>{t("upcomingTasks")}</Text>
          </View>

          <Pressable onPress={() => router.push("/tasks")}>
            <Text style={styles.viewAllText}>{t("viewAll")} ›</Text>
          </Pressable>
        </View>

        <View style={styles.upcomingCard}>
          {upcomingTasks.length === 0 ? (
            <Text style={styles.emptyText}>{t("noUpcomingTasks")}</Text>
          ) : (
            upcomingTasks.map((task, index) => (
              <View
                key={task.id}
                style={[
                  styles.upcomingRow,
                  index !== upcomingTasks.length - 1 && styles.upcomingDivider,
                ]}
              >
                <View style={styles.upcomingIcon}>
                  <Ionicons
                    name={
                      task.is_generated_session
                        ? "layers-outline"
                        : "document-text-outline"
                    }
                    size={18}
                    color="#7C3AED"
                  />
                </View>

                <Text style={styles.upcomingTitle} numberOfLines={1}>
                  {task.title}
                </Text>

                <View style={styles.upcomingTimeBox}>
                  <Ionicons
                    name="calendar-outline"
                    size={15}
                    color={COLORS.textMuted}
                  />
                  <Text style={styles.upcomingTime}>
                    {formatDateShort(task.start_time)},{" "}
                    {formatTime(task.start_time)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleBox}>
            <View style={styles.sectionIconYellow}>
              <Ionicons name="bulb-outline" size={20} color="#D97706" />
            </View>
            <Text style={styles.sectionTitle}>{t("todaysFreeTime")}</Text>
          </View>
        </View>

        <View style={styles.freeTimeCard}>
          <View style={styles.freeTimeIllustration}>
            <Ionicons name="alarm-outline" size={46} color={COLORS.primary} />
          </View>

          <View style={styles.freeTimeInfo}>
            {firstFreeSlot ? (
              <>
                <View style={styles.freeTimeLine}>
                  <Ionicons
                    name="time-outline"
                    size={17}
                    color={COLORS.textMuted}
                  />
                  <Text style={styles.freeTimeText}>
                    {t("available")}:{" "}
                    <Text style={styles.freeTimeHighlight}>
                      {formatTime(firstFreeSlot.start_time)} -{" "}
                      {formatTime(firstFreeSlot.end_time)}
                    </Text>
                  </Text>
                </View>

                <View style={styles.freeTimeLine}>
                  <Ionicons name="hourglass-outline" size={17} color="#D97706" />
                  <Text style={styles.freeTimeText}>
                    {language === "th" ? "ระยะเวลา" : "Duration"}:{" "}
                    <Text style={styles.freeTimeHighlight}>
                      {formatDuration(firstFreeSlot.duration_minutes)}
                    </Text>
                  </Text>
                </View>

                <View style={styles.freeTimeLine}>
                  <Ionicons name="star-outline" size={17} color="#D97706" />
                  <Text style={styles.freeTimeText}>
                    {t("suggestedTask")}:{" "}
                    <Text style={styles.freeTimeTask}>
                      {suggestedTask?.title || t("noSuitableTask")}
                    </Text>
                  </Text>
                </View>

                {bestRecommendation ? (
                  <View style={styles.freeTimeLine}>
                    <Ionicons
                      name="analytics-outline"
                      size={17}
                      color={COLORS.textMuted}
                    />
                    <Text style={styles.freeTimeReason}>
                      {language === "th" ? "คะแนนความเหมาะสม" : "Fit score"}:{" "}
                      {Math.round(bestRecommendation.score)}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.freeTimeLine}>
                  <Ionicons
                    name="locate-outline"
                    size={17}
                    color={COLORS.textMuted}
                  />
                  <Text style={styles.freeTimeReason}>
                    {t("reason")}:{" "}
                    {bestRecommendation
                      ? formatRecommendationReasons(bestRecommendation)
                      : "choose a task that fits this free slot"}
                  </Text>
                </View>
              </>
            ) : (
              <Text style={styles.emptyText}>{t("noAvailableFreeTime")}</Text>
            )}
          </View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleBox}>
            <View style={styles.sectionIconGreen}>
              <Ionicons
                name="checkmark-circle-outline"
                size={20}
                color={COLORS.success}
              />
            </View>
            <Text style={styles.sectionTitle}>{t("completedTasks")}</Text>
          </View>

          <Pressable onPress={() => router.push("/tasks")}>
            <Text style={styles.viewAllText}>{t("viewAll")} ›</Text>
          </Pressable>
        </View>

        <View style={styles.completedCard}>
          {completedTodayTasks.length === 0 ? (
            <Text style={styles.emptyText}>{t("noCompletedTasksToday")}</Text>
          ) : (
            completedTodayTasks.slice(0, 2).map((task) => (
              <View key={task.id} style={styles.completedRow}>
                <Pressable
                  style={styles.completedCheck}
                  onPress={() => handleUndoTask(task.id)}
                >
                  <Ionicons
                    name="checkmark"
                    size={18}
                    color={COLORS.textLight}
                  />
                </Pressable>

                <Text style={styles.completedTitle} numberOfLines={1}>
                  {task.title}
                </Text>

                <View style={styles.completedBadge}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={15}
                    color={COLORS.success}
                  />
                  <Text style={styles.completedBadgeText}>{t("done")}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <BottomNav activeTab="home" />

      <Pressable
        style={styles.fabButton}
        onPress={() => router.push("/add-task")}
      >
        <Ionicons name="add" size={34} color={COLORS.textLight} />
      </Pressable>
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
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 22,
    paddingTop: 62,
    paddingBottom: 130,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 28,
  },
  headerTextBox: {
    flex: 1,
    paddingRight: 14,
  },
  greetingText: {
    fontSize: 34,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: -0.6,
  },
  dateText: {
    marginTop: 8,
    fontSize: 16,
    color: COLORS.textMuted,
  },
  headerActions: {
    flexDirection: "row",
    gap: 10,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  languageText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: "900",
  },
  sectionHeaderRow: {
    marginTop: 8,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitleBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sectionIconBlue: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#EAF4FF",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionIconPurple: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#F3E8FF",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionIconYellow: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionIconGreen: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.text,
  },
  viewAllText: {
    fontSize: 15,
    color: COLORS.primary,
    fontWeight: "700",
  },
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 18,
  },
  emptyText: {
    fontSize: 15,
    color: COLORS.textMuted,
  },
  taskCard: {
    minHeight: 94,
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    borderLeftWidth: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  taskCardRed: {
    borderLeftColor: "#FCA5A5",
  },
  taskCardBlue: {
    borderLeftColor: "#93C5FD",
  },
  taskCardGreen: {
    borderLeftColor: "#86EFAC",
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: COLORS.primary,
    marginRight: 14,
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.text,
  },
  progressText: {
    marginTop: 6,
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: "800",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 7,
    gap: 6,
  },
  taskTime: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: "600",
  },
  taskTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  taskTagText: {
    fontSize: 12,
    fontWeight: "800",
  },
  upcomingCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 22,
    overflow: "hidden",
  },
  upcomingRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  upcomingDivider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider || COLORS.border,
  },
  upcomingIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F3E8FF",
    alignItems: "center",
    justifyContent: "center",
  },
  upcomingTitle: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
    fontWeight: "700",
  },
  upcomingTimeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  upcomingTime: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: "600",
  },
  freeTimeCard: {
    backgroundColor: "#FFFBEB",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#FDE68A",
    padding: 18,
    marginBottom: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  freeTimeIllustration: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
  },
  freeTimeInfo: {
    flex: 1,
    gap: 8,
  },
  freeTimeLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  freeTimeText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  freeTimeHighlight: {
    color: "#D97706",
    fontWeight: "900",
  },
  freeTimeTask: {
    color: COLORS.text,
    fontWeight: "900",
  },
  freeTimeReason: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: "600",
  },
  completedCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    marginBottom: 12,
  },
  completedRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  completedCheck: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.success,
    alignItems: "center",
    justifyContent: "center",
  },
  completedTitle: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
    fontWeight: "700",
  },
  completedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  completedBadgeText: {
    color: COLORS.success,
    fontSize: 12,
    fontWeight: "800",
  },
  fabButton: {
    position: "absolute",
    right: 30,
    bottom: 92,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: COLORS.background,
  },
});
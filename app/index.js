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

  const locale = language === "th" ? "th-TH" : "en-US";

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

    let unsubscribe = () => { };

    try {
      unsubscribe = listenTasks((data) => {
        setTasks(data);
      });
    } catch (error) {
      console.error("Listen tasks error:", error);

      if (error?.message === "AUTH_REQUIRED") {
        router.replace("/login");
      } else {
        Alert.alert(t("error"), t("unableToLoadTasks"));
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

    return date.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDateShort = (value) => {
    const date = normalizeDate(value);
    if (!date) return "";

    return date.toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
    });
  };

  const getUserName = () => {
    if (user?.displayName) return user.displayName;
    if (user?.email) return user.email.split("@")[0];
    return language === "th" ? "ผู้ใช้" : "User";
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
      "Part of a planning session": "เป็นกิจกรรมย่อยจากโหมดวางแผน",
      "Main planning task": "เป็นกิจกรรมหลักแบบวางแผน",
      "Has time conflict, may need adjustment":
        "มีเวลาทับซ้อน อาจต้องปรับเวลา",
    };

    if (reasonMap[reason]) return reasonMap[reason];

    if (reason.startsWith("Fits this")) {
      return reason
        .replace("Fits this", "พอดีกับช่วงว่าง")
        .replace("free slot", "ช่วงเวลาว่าง");
    }

    if (reason.startsWith("Needs")) {
      return reason
        .replace("Needs", "ต้องใช้เวลา")
        .replace("longer than this free slot", "นานกว่าช่วงเวลาว่างนี้");
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
    if (task.has_conflict) {
      return language === "th" ? "เวลาทับซ้อน" : "Conflict";
    }

    if (task.is_generated_session) {
      return language === "th" ? "เซสชันวางแผน" : "Session";
    }

    if (task.planning_enabled) {
      return language === "th" ? "วางแผน" : "Planning";
    }

    if (task.is_recurring) {
      return language === "th" ? "ทำซ้ำ" : "Repeat";
    }

    if (task.priority === "High" || task.priority === "high") {
      return t("high");
    }

    if (task.priority === "Medium" || task.priority === "medium") {
      return t("medium");
    }

    if (task.priority === "Low" || task.priority === "low") {
      return t("low");
    }

    return t("task");
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

  const sortByStartTimeAsc = (a, b) => {
    const timeA = normalizeDate(a.start_time)?.getTime() || 0;
    const timeB = normalizeDate(b.start_time)?.getTime() || 0;
    return timeA - timeB;
  };

  const sortByCompletedTimeDesc = (a, b) => {
    const completedA =
      normalizeDate(a?.completedAt) ||
      normalizeDate(a?.completed_at) ||
      normalizeDate(a?.updatedAt) ||
      normalizeDate(a?.updated_at) ||
      normalizeDate(a?.end_time) ||
      normalizeDate(a?.start_time);

    const completedB =
      normalizeDate(b?.completedAt) ||
      normalizeDate(b?.completed_at) ||
      normalizeDate(b?.updatedAt) ||
      normalizeDate(b?.updated_at) ||
      normalizeDate(b?.end_time) ||
      normalizeDate(b?.start_time);

    return (completedB?.getTime() || 0) - (completedA?.getTime() || 0);
  };

  const isOverdueTask = (task) => {
    if (!task || task.is_completed === true) return false;

    const endTime = normalizeDate(task.end_time);
    if (!endTime) return false;

    return endTime.getTime() < new Date().getTime();
  };

  const isCompletedLateTask = (task) => {
    return task?.is_completed === true && task?.completed_late === true;
  };

  const isCompletedNormalTask = (task) => {
    return task?.is_completed === true && task?.completed_late !== true;
  };

  const activeTasks = tasks.filter((task) => task?.is_completed !== true);

  const overdueTasks = activeTasks
    .filter(isOverdueTask)
    .sort(sortByStartTimeAsc);

  const todayTasks = tasks
    .filter((task) => isSameDay(task.start_time, today))
    .sort(sortByStartTimeAsc);

  const activeTodayTasks = todayTasks.filter(
    (task) => task.is_completed !== true && !isOverdueTask(task)
  );

  const completedLateTasks = tasks
    .filter(isCompletedLateTask)
    .sort(sortByCompletedTimeDesc);

  const completedTasks = tasks
    .filter(isCompletedNormalTask)
    .sort(sortByCompletedTimeDesc);

  const upcomingAllTasks = tasks
    .filter(
      (task) =>
        !task.is_completed &&
        !isOverdueTask(task) &&
        isFutureDate(task.start_time)
    )
    .sort(sortByStartTimeAsc);

  const upcomingTasks = upcomingAllTasks.slice(0, 3);

  const smartFreeTimeResult = getBestRecommendationForDate(tasks, today, {
    minSlotMinutes: 15,
    startHour: 4,
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
      Alert.alert(t("error"), t("unableToUpdateTaskStatus"));
    }
  };

  const handleUndoTask = async (taskId) => {
    try {
      await undoTaskDone(taskId);
    } catch (error) {
      console.error("Undo task error:", error);
      Alert.alert(t("error"), t("unableToRestoreTask"));
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace("/login");
    } catch (error) {
      console.error("Logout error:", error);
      Alert.alert(t("error"), t("unableToLogout"));
    }
  };

  const handleLanguagePress = () => {
    toggleLanguage();
  };

  const handleNotificationPress = () => {
    Alert.alert(t("notifications"), t("notificationsComingSoon"));
  };

  const renderHomeTaskCard = (task, index, options = {}) => {
    const { showDoneButton = true, completed = false, completedLate = false } =
      options;

    const tagStyle = completedLate
      ? {
        bg: "#FEE2E2",
        color: "#EF4444",
        icon: "time-outline",
        label: t("completedLate"),
      }
      : completed
        ? {
          bg: "#DCFCE7",
          color: COLORS.success,
          icon: "checkmark-circle-outline",
          label: t("done"),
        }
        : getPriorityStyle(task);

    return (
      <Pressable
        key={task.id}
        style={[
          styles.taskCard,
          index === 0 && styles.taskCardRed,
          index === 1 && styles.taskCardBlue,
          index === 2 && styles.taskCardGreen,
          completedLate && styles.completedLateTaskCard,
          completed && styles.completedTaskCard,
        ]}
      >
        {showDoneButton ? (
          <Pressable
            style={styles.checkCircle}
            onPress={() => handleDoneTask(task.id)}
          />
        ) : (
          <Pressable
            style={[
              styles.completedCheck,
              completedLate && styles.completedLateCheck,
            ]}
            onPress={() => handleUndoTask(task.id)}
          >
            <Ionicons name="checkmark" size={18} color={COLORS.textLight} />
          </Pressable>
        )}

        <View style={styles.taskContent}>
          <Text
            style={[
              styles.taskTitle,
              completed && styles.completedTitleStrike,
              completedLate && styles.completedLateTitleStrike,
            ]}
            numberOfLines={1}
          >
            {task.title}
          </Text>

          {task.detail ? (
            <Text style={styles.taskDetail} numberOfLines={1}>
              {task.detail}
            </Text>
          ) : null}

          <View style={styles.timeRow}>
            <Ionicons
              name="calendar-outline"
              size={15}
              color={COLORS.textMuted}
            />
            <Text style={styles.taskTime}>{formatDateShort(task.start_time)}</Text>

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
              {task.planned_session_count || 0} {t("sessionsCompleted")}
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
          <Ionicons name={tagStyle.icon} size={14} color={tagStyle.color} />
          <Text
            style={[
              styles.taskTagText,
              {
                color: tagStyle.color,
              },
            ]}
          >
            {tagStyle.label || getPriorityLabel(task)}
          </Text>
        </View>
      </Pressable>
    );
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
        <Text style={styles.loadingText}>{t("redirectingToLogin")}</Text>
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
              {today.toLocaleDateString(locale, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </Text>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              style={[styles.iconButton, { display: "none" }]}
              onPress={handleLanguagePress}
            >
              <Text style={styles.languageText}>
                {language === "en" ? "TH" : "EN"}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.iconButton, { display: "none" }]}
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

        {overdueTasks.length > 0 ? (
          <>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleBox}>
                <View style={styles.sectionIconRed}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={20}
                    color="#EF4444"
                  />
                </View>
                <Text style={styles.sectionTitle}>{t("overdueTasks")}</Text>
              </View>

              {overdueTasks.length > 3 ? (
                <Pressable onPress={() => router.push("/tasks")}>
                  <Text style={styles.viewAllText}>{t("viewAll")} ›</Text>
                </Pressable>
              ) : null}
            </View>

            {overdueTasks
              .slice(0, 3)
              .map((task, index) => renderHomeTaskCard(task, index))}
          </>
        ) : null}

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

          {activeTodayTasks.length > 3 ? (
            <Pressable onPress={() => router.push("/tasks")}>
              <Text style={styles.viewAllText}>{t("viewAll")} ›</Text>
            </Pressable>
          ) : null}
        </View>

        {activeTodayTasks.length === 0 ? (
          <Text style={styles.sectionEmptyText}>
            {t("noActiveTasksToday")}
          </Text>
        ) : (
          activeTodayTasks
            .slice(0, 3)
            .map((task, index) => renderHomeTaskCard(task, index))
        )}

        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleBox}>
            <View style={styles.sectionIconPurple}>
              <Ionicons name="time-outline" size={20} color="#7C3AED" />
            </View>
            <Text style={styles.sectionTitle}>{t("upcomingTasks")}</Text>
          </View>
          {upcomingAllTasks.length > 3 ? (
            <Pressable onPress={() => router.push("/tasks")}>
              <Text style={styles.viewAllText}>{t("viewAll")} ›</Text>
            </Pressable>
          ) : null}
        </View>

        <View
          style={[
            styles.upcomingCard,
            upcomingTasks.length === 0 && styles.emptySectionNoBox,
          ]}
        >
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
                    {t("duration")}:{" "}
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
                {/*
                {bestRecommendation ? (
                  <View style={styles.freeTimeLine}>
                    <Ionicons
                      name="analytics-outline"
                      size={17}
                      color={COLORS.textMuted}
                    />
                    <Text style={styles.freeTimeReason}>
                      {t("fitScore")}: {Math.round(bestRecommendation.score)}
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
                      : language === "th"
                        ? "เลือกงานที่เหมาะกับช่วงเวลาว่างนี้"
                        : "choose a task that fits this free slot"}
                  </Text>
                </View>
                */}
              </>
            ) : (
              <Text style={styles.emptyText}>{t("noAvailableFreeTime")}</Text>
            )}
          </View>
        </View>

        {completedLateTasks.length > 0 ? (
          <>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleBox}>
                <View style={styles.sectionIconRed}>
                  <Ionicons name="time-outline" size={20} color="#EF4444" />
                </View>
                <Text style={styles.sectionTitle}>{t("completedLate")}</Text>
              </View>

              {completedLateTasks.length > 3 ? (
                <Pressable onPress={() => router.push("/tasks")}>
                  <Text style={styles.viewAllText}>{t("viewAll")} ›</Text>
                </Pressable>
              ) : null}
            </View>

            {completedLateTasks.slice(0, 3).map((task, index) =>
              renderHomeTaskCard(task, index, {
                showDoneButton: false,
                completedLate: true,
              })
            )}
          </>
        ) : null}

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
          {completedTasks.length > 3 ? (
            <Pressable onPress={() => router.push("/tasks")}>
              <Text style={styles.viewAllText}>{t("viewAll")} ›</Text>
            </Pressable>
          ) : null}
        </View>

        <View
          style={[
            styles.completedCard,
            completedTasks.length === 0 && styles.emptySectionNoBox,
          ]}
        >
          {completedTasks.length === 0 ? (
            <Text style={styles.emptyText}>{t("noCompletedTasks")}</Text>
          ) : (
            completedTasks.slice(0, 3).map((task, index) =>
              renderHomeTaskCard(task, index, {
                showDoneButton: false,
                completed: true,
              })
            )
          )}
        </View>
      </ScrollView>

      <BottomNav activeTab="home" />

      <Pressable
        style={styles.fabButton}
        onPress={() =>
          router.push({
            pathname: "/add-task",
            params: {
              from: "home",
            },
          })
        }
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
    paddingBottom: 170,
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
  sectionIconRed: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#FEE2E2",
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
  completedTaskCard: {
    borderLeftColor: "#86EFAC",
  },
  completedLateTaskCard: {
    borderLeftColor: "#F87171",
  },
  completedLateCheck: {
    backgroundColor: "#EF4444",
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
  taskDetail: {
    marginTop: 4,
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: "600",
  },
  completedTitleStrike: {
    color: COLORS.textMuted,
    textDecorationLine: "line-through",
  },
  completedLateTitleStrike: {
    color: COLORS.textMuted,
    textDecorationLine: "line-through",
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
    flexWrap: "wrap",
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
    padding: 16,
    marginBottom: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
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
    marginRight: 12,
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
    bottom: 135,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: COLORS.background,
    zIndex: 20,
    elevation: 12,
  },
  sectionEmptyText: {
    marginTop: -4,
    marginBottom: 22,
    marginLeft: 54,
    fontSize: 15,
    color: COLORS.textMuted,
    fontWeight: "600",
  },

  emptySectionNoBox: {
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
    borderRadius: 0,
    paddingTop: 0,
    paddingBottom: 18,
    paddingLeft: 54,
    paddingRight: 0,
    marginBottom: 4,
    overflow: "visible",
  },
});
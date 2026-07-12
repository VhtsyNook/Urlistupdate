import { Ionicons } from "@expo/vector-icons";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import BottomNav from "../src/components/BottomNav";
import { auth } from "../src/config/firebase";
import { COLORS } from "../src/constants/theme";
import {
  disconnectGoogleCalendarEvents,
  syncGoogleCalendarEvents,
} from "../src/services/googleCalendarService";

export default function ProfileScreen() {
  const router = useRouter();
  const user = auth.currentUser;

  const [isSyncingGoogle, setIsSyncingGoogle] = useState(false);

  const getUserName = () => {
    if (user?.displayName) return user.displayName;
    if (user?.email) return user.email.split("@")[0];
    return "User";
  };

  const getProviderName = () => {
    const providerId = user?.providerData?.[0]?.providerId || "";

    if (providerId.includes("google")) {
      return "Google Account";
    }

    if (providerId.includes("password")) {
      return "Email / Password";
    }

    return "Signed in";
  };

  const handleLogout = async () => {
    try {
      try {
        await GoogleSignin.signOut();
      } catch (googleError) {
        console.log("Google sign out skipped:", googleError?.message);
      }

      await signOut(auth);
      router.replace("/login");
    } catch (error) {
      console.error("Logout error:", error);
      Alert.alert("Error", "Unable to log out.");
    }
  };

  const handleLanguagePress = () => {
    Alert.alert(
      "Language",
      "Language switching is available from the Home page."
    );
  };

  const handleNotificationPress = () => {
    Alert.alert(
      "Notifications",
      "Notification center will be available soon."
    );
  };

  const handleConnectGoogleCalendar = async () => {
    try {
      setIsSyncingGoogle(true);

      const result = await syncGoogleCalendarEvents({
        calendarId: "primary",
        daysBack: 30,
        daysForward: 120,
        clearOldEvents: false,
      });

      Alert.alert(
        "Google Calendar Connected",
        `Sync สำเร็จ ${result.synced_count} event(s)\n\nEvent เหล่านี้ถูกบันทึกเป็น Busy Time แล้ว`
      );
    } catch (error) {
      console.error("Connect Google Calendar error:", error);

      if (error?.message === "GOOGLE_ACCESS_TOKEN_NOT_FOUND") {
        Alert.alert(
          "Google Calendar",
          "ไม่พบ access token จาก Google กรุณาลองล็อกอินใหม่"
        );
        return;
      }

      if (error?.message === "GOOGLE_CALENDAR_PERMISSION_DENIED") {
        Alert.alert(
          "Permission required",
          "กรุณาอนุญาตให้แอปอ่าน Google Calendar"
        );
        return;
      }

      Alert.alert(
        "Google Calendar Error",
        "เชื่อม Google Calendar ไม่สำเร็จ กรุณาลองใหม่"
      );
    } finally {
      setIsSyncingGoogle(false);
    }
  };

  const handleConnectMicrosoftCalendar = () => {
    Alert.alert(
      "Microsoft / Teams Calendar",
      "ขั้นถัดไปจะเชื่อม Microsoft Graph Calendar API เพื่อดึง Outlook / Teams events มาใช้ใน Smart Scheduler"
    );
  };

  const handleSyncCalendarNow = async () => {
    try {
      setIsSyncingGoogle(true);

      const result = await syncGoogleCalendarEvents({
        calendarId: "primary",
        daysBack: 30,
        daysForward: 120,
        clearOldEvents: false,
      });

      Alert.alert(
        "Sync Completed",
        `อัปเดต Google Calendar แล้ว ${result.synced_count} event(s)`
      );
    } catch (error) {
      console.error("Sync calendar error:", error);
      Alert.alert(
        "Sync Error",
        "Sync Google Calendar ไม่สำเร็จ กรุณาลองใหม่"
      );
    } finally {
      setIsSyncingGoogle(false);
    }
  };

  const handleDisconnectCalendar = () => {
    Alert.alert(
      "Disconnect Google Calendar",
      "ต้องการลบ event ที่ sync จาก Google Calendar ออกจากแอปไหม?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            try {
              setIsSyncingGoogle(true);

              const result = await disconnectGoogleCalendarEvents();

              Alert.alert(
                "Disconnected",
                `ลบ Google Calendar events แล้ว ${result.deleted_count || 0} event(s)`
              );
            } catch (error) {
              console.error("Disconnect calendar error:", error);
              Alert.alert(
                "Error",
                "ลบ Google Calendar events ไม่สำเร็จ"
              );
            } finally {
              setIsSyncingGoogle(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.pageTitle}>Profile</Text>
          <Text style={styles.pageSubtitle}>
            Account, calendar sync, and preferences
          </Text>
        </View>

        <View style={styles.profileCard}>
          {user?.photoURL ? (
            <Image source={{ uri: user.photoURL }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Ionicons name="person" size={38} color={COLORS.textLight} />
            </View>
          )}

          <Text style={styles.userName}>{getUserName()}</Text>

          <Text style={styles.emailText} numberOfLines={1}>
            {user?.email || ""}
          </Text>

          <View style={styles.providerBadge}>
            <Ionicons
              name="shield-checkmark-outline"
              size={15}
              color={COLORS.primaryDark}
            />
            <Text style={styles.providerText}>{getProviderName()}</Text>
          </View>
        </View>

        <View style={[styles.sectionHeader, { display: "none" }]}>
          <Text style={styles.sectionTitle}>Calendar Integration</Text>
          <Text style={styles.sectionSubtitle}>
            Sync external calendars as busy time for smart scheduling.
          </Text>
        </View>

        <View style={[styles.calendarCard, { display: "none" }]}>
          <Pressable
            style={styles.calendarItem}
            onPress={handleConnectGoogleCalendar}
            disabled={isSyncingGoogle}
          >
            <View style={styles.googleIcon}>
              <Text style={styles.googleIconText}>G</Text>
            </View>

            <View style={styles.calendarTextBox}>
              <Text style={styles.menuTitle}>Connect Google Calendar</Text>
              <Text style={styles.menuSubtitle}>
                Gmail / Google Workspace / University Google account
              </Text>
            </View>

            {isSyncingGoogle ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Ionicons
                name="chevron-forward"
                size={20}
                color={COLORS.textMuted}
              />
            )}
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            style={[styles.calendarItem, { display: "none" }]}
            onPress={handleConnectMicrosoftCalendar}
          >
            <View style={styles.microsoftIcon}>
              <Ionicons
                name="calendar-outline"
                size={22}
                color={COLORS.textLight}
              />
            </View>

            <View style={styles.calendarTextBox}>
              <Text style={styles.menuTitle}>Connect Microsoft / Teams</Text>
              <Text style={styles.menuSubtitle}>
                Outlook Calendar, Microsoft 365, and Teams meetings
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={20}
              color={COLORS.textMuted}
            />
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            style={[styles.calendarItem, { display: "none" }]}
            onPress={handleSyncCalendarNow}
            disabled={isSyncingGoogle}
          >
            <View style={styles.menuIcon}>
              <Ionicons
                name="sync-outline"
                size={22}
                color={COLORS.primary}
              />
            </View>

            <View style={styles.calendarTextBox}>
              <Text style={styles.menuTitle}>Sync Google Calendar Now</Text>
              <Text style={styles.menuSubtitle}>
                Update external events and busy time slots
              </Text>
            </View>

            {isSyncingGoogle ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Ionicons
                name="chevron-forward"
                size={20}
                color={COLORS.textMuted}
              />
            )}
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            style={styles.calendarItem}
            onPress={handleDisconnectCalendar}
            disabled={isSyncingGoogle}
          >
            <View style={styles.dangerIcon}>
              <Ionicons
                name="unlink-outline"
                size={22}
                color={COLORS.danger}
              />
            </View>

            <View style={styles.calendarTextBox}>
              <Text style={styles.menuTitle}>Disconnect Google Calendar</Text>
              <Text style={styles.menuSubtitle}>
                Remove synced Google Calendar events from this app
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={20}
              color={COLORS.textMuted}
            />
          </Pressable>
        </View>

        <View style={styles.menuCard}>
          <Pressable style={[styles.menuItem, { display: "none" }]} onPress={handleLanguagePress}>
            <View style={styles.menuIcon}>
              <Ionicons
                name="language-outline"
                size={22}
                color={COLORS.primary}
              />
            </View>

            <View style={styles.menuTextBox}>
              <Text style={styles.menuTitle}>Language</Text>
              <Text style={styles.menuSubtitle}>English / Thai</Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={20}
              color={COLORS.textMuted}
            />
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            style={[styles.menuItem, { display: "none" }]}
            onPress={handleNotificationPress}
          >
            <View style={styles.menuIcon}>
              <Ionicons
                name="notifications-outline"
                size={22}
                color={COLORS.primary}
              />
            </View>

            <View style={styles.menuTextBox}>
              <Text style={styles.menuTitle}>Notifications</Text>
              <Text style={styles.menuSubtitle}>
                Task reminders and alerts
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={20}
              color={COLORS.textMuted}
            />
          </Pressable>
        </View>

        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons
            name="log-out-outline"
            size={22}
            color={COLORS.textLight}
          />
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </ScrollView>

      <BottomNav activeTab="profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 62,
  },
  contentContainer: {
    paddingBottom: 140,
  },
  header: {
    marginBottom: 24,
  },
  pageTitle: {
    fontSize: 36,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: -0.7,
  },
  pageSubtitle: {
    marginTop: 6,
    fontSize: 16,
    color: COLORS.textMuted,
  },
  profileCard: {
    backgroundColor: COLORS.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    alignItems: "center",
    marginBottom: 22,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
    marginBottom: 14,
    backgroundColor: COLORS.cardSoft,
  },
  userName: {
    fontSize: 24,
    fontWeight: "900",
    color: COLORS.text,
    textAlign: "center",
  },
  emailText: {
    marginTop: 6,
    fontSize: 14,
    color: COLORS.textMuted,
    maxWidth: "90%",
  },
  providerBadge: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.primaryLight || COLORS.cardSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  providerText: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.primaryDark,
  },
  sectionHeader: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 21,
    fontWeight: "900",
    color: COLORS.text,
  },
  sectionSubtitle: {
    marginTop: 4,
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 20,
  },
  calendarCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 18,
    overflow: "hidden",
  },
  calendarItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  calendarTextBox: {
    flex: 1,
  },
  googleIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.cardSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  googleIconText: {
    fontSize: 22,
    fontWeight: "900",
    color: "#4285F4",
  },
  microsoftIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  dangerIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
  },
  menuCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 18,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  menuIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  menuTextBox: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.text,
  },
  menuSubtitle: {
    marginTop: 3,
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.divider || COLORS.border,
    marginLeft: 70,
  },
  logoutButton: {
    backgroundColor: COLORS.danger,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  logoutText: {
    color: COLORS.textLight,
    fontSize: 17,
    fontWeight: "800",
  },
});
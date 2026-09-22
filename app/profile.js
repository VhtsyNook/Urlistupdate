import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import { useEffect, useState } from "react";
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

import { SafeAreaView } from "react-native-safe-area-context";
import BottomNav from "../src/components/BottomNav";
import { auth } from "../src/config/firebase";
import { COLORS } from "../src/constants/theme";
import { useLanguage } from "../src/i18n/LanguageContext";
import {
  disconnectGoogleCalendarEvents,
  requestGoogleCalendarAccess,
  syncGoogleCalendarEvents,
  syncUrlistTasksToGoogleCalendar,
} from "../src/services/googleCalendarService";

export default function ProfileScreen() {
  const router = useRouter();
  const user = auth.currentUser;
  const { language } = useLanguage();

  const isThai = language === "th";
  const text = (en, th) => (isThai ? th : en);

  const [isSyncingGoogle, setIsSyncingGoogle] = useState(false);
  const [isGoogleCalendarConnected, setIsGoogleCalendarConnected] =
    useState(false);

  const googleCalendarStatusKey = `google_calendar_connected_${user?.uid || "guest"
    }`;

  useEffect(() => {
    const loadGoogleCalendarStatus = async () => {
      try {
        const savedStatus = await AsyncStorage.getItem(
          googleCalendarStatusKey
        );

        setIsGoogleCalendarConnected(savedStatus === "true");
      } catch (error) {
        console.log(
          "Load Google Calendar status error:",
          error?.message
        );
      }
    };

    loadGoogleCalendarStatus();
  }, [googleCalendarStatusKey]);

  const getUserName = () => {
    if (user?.displayName) return user.displayName;
    if (user?.email) return user.email.split("@")[0];
    return text("User", "ผู้ใช้");
  };

  const getProviderName = () => {
    const providerId = user?.providerData?.[0]?.providerId || "";

    if (providerId.includes("google")) {
      return text("Google Account", "บัญชี Google");
    }

    if (providerId.includes("password")) {
      return text("Email / Password", "อีเมล / รหัสผ่าน");
    }

    return text("Signed in", "เข้าสู่ระบบแล้ว");
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
      Alert.alert(
        text("Error", "เกิดข้อผิดพลาด"),
        text("Unable to log out.", "ไม่สามารถออกจากระบบได้")
      );
    }
  };

  const handleLanguagePress = () => {
    Alert.alert(
      text("Language", "ภาษา"),
      text(
        "Language switching is available from the Home page.",
        "สามารถเปลี่ยนภาษาได้จากหน้า Home"
      )
    );
  };

  const handleNotificationPress = () => {
    Alert.alert(
      text("Notifications", "การแจ้งเตือน"),
      text(
        "Notification center will be available soon.",
        "ศูนย์การแจ้งเตือนจะเปิดใช้งานเร็ว ๆ นี้"
      )
    );
  };



  const handleConnectMicrosoftCalendar = () => {
    Alert.alert(
      text("Microsoft / Teams Calendar", "ปฏิทิน Microsoft / Teams"),
      text(
        "The next step will connect Microsoft Graph Calendar API to import Outlook / Teams events into Smart Scheduler.",
        "ขั้นถัดไปจะเชื่อม Microsoft Graph Calendar API เพื่อดึง Outlook / Teams events มาใช้ใน Smart Scheduler"
      )
    );
  };

  const handleGoogleCalendarSync = async () => {
    if (isSyncingGoogle) {
      return;
    }

    try {
      setIsSyncingGoogle(true);

      // ถ้ายังไม่ได้เชื่อม ระบบจะเปิดหน้าต่างเลือกบัญชี Google ก่อน
      await requestGoogleCalendarAccess();

      const importedResult = await syncGoogleCalendarEvents({
        calendarId: "primary",
        daysBack: 30,
        daysForward: 120,
        clearOldEvents: false,
      });

      const exportedResult =
        await syncUrlistTasksToGoogleCalendar({
          calendarId: "primary",
        });

      // บันทึกว่าเชื่อมต่อสำเร็จแล้ว
      await AsyncStorage.setItem(
        googleCalendarStatusKey,
        "true"
      );

      setIsGoogleCalendarConnected(true);

      Alert.alert(
        text(
          "Google Calendar Synced",
          "เชื่อมต่อและ Sync สำเร็จ"
        ),
        text(
          `Imported from Google: ${importedResult.synced_count} event(s)

Urlist → Google
Created: ${exportedResult.created_count}
Updated: ${exportedResult.updated_count}
Skipped: ${exportedResult.skipped_count}
Failed: ${exportedResult.failed_count}`,
          `นำเข้าจาก Google ${importedResult.synced_count} event(s)

Urlist → Google
สร้าง ${exportedResult.created_count}
อัปเดต ${exportedResult.updated_count}
ข้าม ${exportedResult.skipped_count}
ไม่สำเร็จ ${exportedResult.failed_count}`
        )
      );
    } catch (error) {
      const errorMessage = String(error?.message || "");

      const isDisconnected =
        errorMessage.includes(
          "requires a user to be signed in"
        ) ||
        errorMessage.includes("SIGN_IN_REQUIRED");

      if (isDisconnected) {
        await AsyncStorage.removeItem(
          googleCalendarStatusKey
        );

        setIsGoogleCalendarConnected(false);

        console.log(
          "GOOGLE CALENDAR SYNC SKIPPED: DISCONNECTED"
        );

        return;
      }

      console.error(
        "Google Calendar sync error:",
        error
      );

      Alert.alert(
        text(
          "Google Calendar Error",
          "เกิดข้อผิดพลาด Google Calendar"
        ),
        text(
          "Unable to connect and sync Google Calendar. Please try again.",
          "ไม่สามารถเชื่อมต่อและ Sync Google Calendar ได้ กรุณาลองใหม่"
        )
      );
    } finally {
      setIsSyncingGoogle(false);
    }
  };

  const handleDisconnectCalendar = () => {
    Alert.alert(
      text("Disconnect Google Calendar", "ยกเลิกการเชื่อมต่อ Google Calendar"),
      text(
        "Do you want to remove synced Google Calendar events from this app?",
        "ต้องการลบ event ที่ sync จาก Google Calendar ออกจากแอปไหม?"
      ),
      [
        {
          text: text("Cancel", "ยกเลิก"),
          style: "cancel",
        },
        {
          text: text("Disconnect", "ยกเลิกการเชื่อมต่อ"),
          style: "destructive",
          onPress: async () => {
            try {
              setIsSyncingGoogle(true);

              const result = await disconnectGoogleCalendarEvents();

              await AsyncStorage.removeItem(
                googleCalendarStatusKey
              );

              setIsGoogleCalendarConnected(false);

              Alert.alert(
                text("Disconnected", "ยกเลิกการเชื่อมต่อแล้ว"),
                text(
                  `Removed ${result.deleted_count || 0} Google Calendar event(s).`,
                  `ลบ Google Calendar events แล้ว ${result.deleted_count || 0} event(s)`
                )
              );
            } catch (error) {
              console.error("Disconnect calendar error:", error);
              Alert.alert(
                text("Error", "เกิดข้อผิดพลาด"),
                text(
                  "Unable to remove Google Calendar events.",
                  "ลบ Google Calendar events ไม่สำเร็จ"
                )
              );
            } finally {
              setIsSyncingGoogle(false);
            }
          },
        },
      ]
    );
  };

  const handleGoogleCalendarPress = () => {
    if (isGoogleCalendarConnected) {
      handleDisconnectCalendar();
      return;
    }

    handleGoogleCalendarSync();
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        bounces={false}
        alwaysBounceVertical={false}
        alwaysBounceHorizontal={false}
      >
        <View style={styles.header}>
          <Text style={styles.pageTitle}>{text("Profile", "โปรไฟล์")}</Text>
          <Text style={styles.pageSubtitle}></Text>
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

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {text("Time preferences", "การตั้งค่าเวลา")}
          </Text>
        </View>

        <View style={styles.menuCard}>
          <Pressable
            style={styles.menuItem}
            onPress={() => router.push("/user-pattern")}
          >
            <View style={styles.menuIcon}>
              <Ionicons
                name="options-outline"
                size={22}
                color={COLORS.primary}
              />
            </View>

            <View style={styles.menuTextBox}>
              <Text style={styles.menuTitle}>
                {text("Personal Time Pattern", "รูปแบบเวลาส่วนตัว")}
              </Text>
              <Text style={styles.menuSubtitle}>
                {text(
                  "Wake, sleep, focus periods, and daily activity limits",
                  "เวลาตื่น–นอน ช่วงโฟกัส และชั่วโมงกิจกรรมสูงสุดต่อวัน"
                )}
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={20}
              color={COLORS.textMuted}
            />
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {text("Calendar Integration", "การเชื่อมต่อปฏิทิน")}
          </Text>
        </View>

        <View style={styles.calendarCard}>
          <Pressable
            style={styles.calendarItem}
            onPress={handleGoogleCalendarPress}
            disabled={isSyncingGoogle}
          >
            {isGoogleCalendarConnected ? (
              <View style={styles.dangerIcon}>
                <Ionicons
                  name="unlink-outline"
                  size={22}
                  color={COLORS.danger}
                />
              </View>
            ) : (
              <View style={styles.googleIcon}>
                <Text style={styles.googleIconText}>G</Text>
              </View>
            )}

            <View style={styles.calendarTextBox}>
              <Text
                style={[
                  styles.menuTitle,
                  isGoogleCalendarConnected && styles.disconnectText,
                ]}
              >
                {isGoogleCalendarConnected
                  ? text(
                    "Disconnect Google Calendar",
                    "ยกเลิกการเชื่อมต่อ Google Calendar"
                  )
                  : text(
                    "Connect Google Calendar",
                    "เชื่อมต่อ Google Calendar"
                  )}
              </Text>
            </View>

            {isSyncingGoogle && (
              <ActivityIndicator
                size="small"
                color={
                  isGoogleCalendarConnected
                    ? COLORS.danger
                    : COLORS.primary
                }
              />
            )}
          </Pressable>
        </View>


        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons
            name="log-out-outline"
            size={22}
            color={COLORS.textLight}
          />
          <Text style={styles.logoutText}>{text("Logout", "ออกจากระบบ")}</Text>
        </Pressable>
      </ScrollView>

      <BottomNav activeTab="profile" />
    </SafeAreaView>
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
  },
  contentContainer: {
    paddingTop: 10,
    paddingBottom: 220,
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
  disconnectText: {
    color: COLORS.danger,
  },
  menuSubtitle: {
    marginTop: 3,
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 18,
  },

  logoutButton: {
    backgroundColor: COLORS.danger,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    marginBottom: 40,
  },
  logoutText: {
    color: COLORS.textLight,
    fontSize: 17,
    fontWeight: "800",
  },
});
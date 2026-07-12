import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { COLORS } from "../constants/theme";
import { useLanguage } from "../i18n/LanguageContext";

export default function BottomNav({ activeTab = "home" }) {
  const router = useRouter();
  const { t } = useLanguage();

  const tabs = [
    {
      key: "home",
      label: t("navHome"),
      icon: activeTab === "home" ? "home" : "home-outline",
      route: "/",
    },
    {
      key: "calendar",
      label: t("navCalendar"),
      icon: activeTab === "calendar" ? "calendar" : "calendar-outline",
      route: "/calentask",
    },
    {
      key: "task",
      label: t("navTasks"),
      icon: activeTab === "task" ? "list" : "list-outline",
      route: "/tasks",
    },
    {
      key: "profile",
      label: t("navProfile"),
      icon: activeTab === "profile" ? "person" : "person-outline",
      route: "/profile",
    },
  ];

  return (
    <View style={styles.bottomNav}>
      {tabs.map((tab) => {
        const active = activeTab === tab.key;

        return (
          <Pressable
            key={tab.key}
            style={({ pressed }) => [
              styles.navItem,
              active && styles.navItemActive,
              pressed && styles.navItemPressed,
            ]}
            onPress={() => router.push(tab.route)}
          >
            <Ionicons
              name={tab.icon}
              size={23}
              color={active ? COLORS.primary : COLORS.textMuted}
            />

            <Text
              style={[styles.navText, active && styles.navTextActive]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    position: "absolute",
    left: 16,
    right: 16,

    // เพิ่มค่านี้เพื่อยกแถบเมนูขึ้น ไม่ให้โดน navigation bar ของมือถือบัง
    bottom: Platform.OS === "android" ? 45 : 16,

    height: 70,
    borderRadius: 24,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 8,

    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowRadius: 18,
    elevation: 8,
  },
  navItem: {
    flex: 1,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  navItemActive: {
    backgroundColor: COLORS.primaryLight || "#EAF4FF",
  },
  navItemPressed: {
    opacity: 0.75,
  },
  navText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: "800",
  },
  navTextActive: {
    color: COLORS.primary,
  },
});
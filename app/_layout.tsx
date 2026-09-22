import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import {
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { LanguageProvider } from "../src/i18n/LanguageContext";

export default function RootLayout() {
  const colorScheme = useColorScheme();

  const navigationTheme =
    colorScheme === "dark" ? DarkTheme : DefaultTheme;

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <ThemeProvider value={navigationTheme}>
          <SafeAreaView
            style={{
              flex: 1,
              backgroundColor: navigationTheme.colors.background,
            }}
            edges={["top", "left", "right"]}
          >
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="login" />
              <Stack.Screen name="index" />
              <Stack.Screen name="add-task" />
              <Stack.Screen name="edit-task" />
              <Stack.Screen name="calentask" />
              <Stack.Screen name="tasks" />
              <Stack.Screen name="profile" />
            </Stack>

            <StatusBar style="auto" />
          </SafeAreaView>
        </ThemeProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
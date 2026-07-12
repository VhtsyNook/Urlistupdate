import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { LanguageProvider } from "../src/i18n/LanguageContext";

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <LanguageProvider>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
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
      </ThemeProvider>
    </LanguageProvider>
  );
}
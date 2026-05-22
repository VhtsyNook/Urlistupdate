import { useRouter } from "expo-router";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { auth, db } from "../src/config/firebase";
import { COLORS } from "../src/constants/theme";

export default function LoginScreen() {
  const router = useRouter();

  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setIsAuthReady(true);

      if (currentUser) {
        router.replace("/");
      }
    });

    return unsubscribe;
  }, [router]);

  const validateForm = () => {
    if (!email.trim()) {
      Alert.alert("Error", "กรุณาใส่อีเมล");
      return false;
    }

    if (!password.trim()) {
      Alert.alert("Error", "กรุณาใส่รหัสผ่าน");
      return false;
    }

    if (password.length < 6) {
      Alert.alert("Error", "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      return false;
    }

    return true;
  };

  const createUserProfile = async (user) => {
    const userRef = doc(db, "users", user.uid);

    await setDoc(
      userRef,
      {
        user_id: user.uid,
        email: user.email || "",
        displayName: user.displayName || "",
        photoUrl: user.photoURL || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      setIsLoading(true);

      const cleanEmail = email.trim().toLowerCase();

      if (mode === "login") {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
        router.replace("/");
        return;
      }

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        cleanEmail,
        password
      );

      await createUserProfile(userCredential.user);
      router.replace("/");
    } catch (error) {
      console.log("Auth error:", error?.code || error?.message);

      if (error.code === "auth/email-already-in-use") {
        Alert.alert("Error", "อีเมลนี้มีบัญชีแล้ว","กรุณาเปลี่ยนไปหน้า Login แล้วเข้าสู่ระบบด้วยอีเมลนี้");
        return;
      }

      if (error.code === "auth/invalid-email") {
        Alert.alert("Error", "รูปแบบอีเมลไม่ถูกต้อง");
        return;
      }

      if (error.code === "auth/invalid-credential") {
        Alert.alert("Error", "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
        return;
      }

      if (error.code === "auth/user-not-found") {
        Alert.alert("Error", "ไม่พบบัญชีผู้ใช้นี้");
        return;
      }

      if (error.code === "auth/wrong-password") {
        Alert.alert("Error", "รหัสผ่านไม่ถูกต้อง");
        return;
      }

      if (error.code === "auth/weak-password") {
        Alert.alert("Error", "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
        return;
      }

      Alert.alert("Error", "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthReady) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>
          {mode === "login" ? "Login" : "Create Account"}
        </Text>

        <Text style={styles.subtitle}>
          {mode === "login"
            ? " "
            : " "}
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={COLORS.textMuted}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={COLORS.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Pressable
          style={[styles.primaryButton, isLoading && styles.disabledButton]}
          onPress={handleSubmit}
          disabled={isLoading}
        >
          <Text style={styles.primaryButtonText}>
            {isLoading
              ? "Please wait..."
              : mode === "login"
              ? "Login"
              : "Sign Up"}
          </Text>
        </Pressable>

        <Pressable
          style={styles.switchButton}
          onPress={() => {
            setMode(mode === "login" ? "signup" : "login");
          }}
          disabled={isLoading}
        >
          <Text style={styles.switchText}>
            {mode === "login"
              ? "Don't have an account? Sign up."
              : "Already have an account? Log in."}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
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
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 26,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  title: {
    fontSize: 34,
    fontWeight: "bold",
    color: COLORS.text,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 28,
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  input: {
    backgroundColor: COLORS.cardSoft,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: COLORS.text,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  primaryButton: {
    backgroundColor: COLORS.primaryDark,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: COLORS.textLight,
    fontSize: 18,
    fontWeight: "bold",
  },
  switchButton: {
    marginTop: 18,
    alignItems: "center",
  },
  switchText: {
    color: COLORS.primaryDark,
    fontSize: 15,
    fontWeight: "700",
  },
});
// src/config/firebase.js

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  getReactNativePersistence,
  initializeAuth,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBlRRZYPgzq9KYDZCNpGhVmuiFH7E6GXrU",
  authDomain: "to-do-list-272d1.firebaseapp.com",
  projectId: "to-do-list-272d1",
  storageBucket: "to-do-list-272d1.firebasestorage.app",
  messagingSenderId: "1065859599553",
  appId: "1:1065859599553:web:75550b791d4f1e6480d840",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

let auth;

try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (error) {
  auth = getAuth(app);
}

const db = getFirestore(app);

export { app, auth, db };

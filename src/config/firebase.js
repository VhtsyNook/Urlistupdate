// src/config/firebase.js

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBlRRZYPgzq9KYDZCNpGhVmuiFH7E6GXrU",
  authDomain: "to-do-list-272d1.firebaseapp.com",
  projectId: "to-do-list-272d1",
  storageBucket: "to-do-list-272d1.firebasestorage.app",
  messagingSenderId: "1065859599553",
  appId: "1:1065859599553:web:75550b791d4f1e6480d840"
};


const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Replace these placeholders with your actual Firebase project web app keys
// Import the functions you need from the SDKs you need

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDJZ0aa9hJMFqA-lPxwGR5Ouc0Jb7VEnG0",
  authDomain: "academic-quiz-26.firebaseapp.com",
  projectId: "academic-quiz-26",
  storageBucket: "academic-quiz-26.firebasestorage.app",
  messagingSenderId: "372532334013",
  appId: "1:372532334013:web:a8a787f8aed25fc585d6d4",
};

// Initialize Firebase

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

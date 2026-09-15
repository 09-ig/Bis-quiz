import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Replace these placeholders with your actual Firebase project web app keys
// Import the functions you need from the SDKs you need

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCHY0S_eKdH9_MuuY3por1tgGPX3ncVhu8",
  authDomain: "bis-college.firebaseapp.com",
  projectId: "bis-college",
  storageBucket: "bis-college.firebasestorage.app",
  messagingSenderId: "85744330778",
  appId: "1:85744330778:web:1233280ea991934aac09a3",
  measurementId: "G-RRPVVM0QJT"
};

// Initialize Firebase

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

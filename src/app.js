import { db } from "./firebase.js";
import { collection, getDocs } from "firebase/firestore";

// Helper function to convert JSON to CSV and trigger download in browser
function downloadCSV(dataArray, filename) {
  if (dataArray.length === 0) {
    alert("No data found to export!");
    return;
  }

  // Get CSV Headers (fields) from the first object
  const headers = Object.keys(dataArray[0]);
  const csvRows = [headers.join(",")]; // Add header row

  // Map each document to a CSV line
  for (const row of dataArray) {
    const values = headers.map(header => {
      const val = row[header];
      // Escape double quotes and wrap in quotes to handle commas inside text fields
      const escaped = ('' + (val ?? '')).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(","));
  }

  // Generate and trigger download
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// 1. Export all questions
export async function exportQuestions() {
  const querySnapshot = await getDocs(collection(db, "questions"));
  const questions = [];
  querySnapshot.forEach(doc => {
    questions.push({ id: doc.id, ...doc.data() });
  });
  downloadCSV(questions, "questions_export");
}

// 2. Export all quiz attempts (Remember: You must be signed in as an ADMIN!)
export async function exportQuizAttempts() {
  try {
    const querySnapshot = await getDocs(collection(db, "quiz_attempts"));
    const attempts = [];
    querySnapshot.forEach(doc => {
      attempts.push({ id: doc.id, ...doc.data() });
    });
    downloadCSV(attempts, "quiz_attempts_export");
  } catch (error) {
    alert("Error: Only Admins can download quiz attempts! " + error.message);
  }
}

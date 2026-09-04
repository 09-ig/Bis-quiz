// Browser-side CSV dump, kept out of src/ on purpose: it is NOT imported by the
// app and nothing renders a button for it. The index.html buttons that used to
// call these were dead (this module's exports were never attached to window) and
// would have been visible to students on the shared link.
//
// The maintained export path is ../data-export-utility.js — `node
// data-export-utility.js` from the repo root, which needs serviceAccountKey.json
// and writes the full multi-sheet Quiz_Attempts_Report.xlsx.
//
// To use this one instead, import it from a module the app actually builds and
// call it while signed in as an admin.
import { db } from "../src/config/firebase.js";
import { collection, getDocs } from "firebase/firestore";

// Helper function to convert JSON to CSV and trigger download in browser
function downloadCSV(dataArray, filename) {
  if (dataArray.length === 0) {
    alert("No data found to export!");
    return;
  }

  // Union of keys across every row, not just the first: pre-multi-college
  // attempts have no collegeId/subjectId, so keying off row 0 would silently
  // drop those columns for the whole file if an old row happened to come first.
  const headers = [...new Set(dataArray.flatMap((row) => Object.keys(row)))];
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

import admin from "firebase-admin";
import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

// Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import JSON file in ES Module environment safely
const require = createRequire(import.meta.url);
const serviceAccount = require("./serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function generateMasterMLDataset() {
  try {
    // Initialize Master Excel Workbook
    const workbook = new ExcelJS.Workbook();

    // ==========================================
    // SHEET 1: QUIZ ATTEMPTS (BEHAVIORAL DATA)
    // ==========================================
    console.log("🔄 Fetching documents from quiz_attempts...");
    const quizSnapshot = await db.collection("quiz_attempts").get();

    const wsAttempts = workbook.addWorksheet("ML_Behavioral_Data");
    wsAttempts.columns = [
      { header: "attempt_id", key: "attempt_id", width: 25 },
      { header: "student_uid", key: "student_uid", width: 28 },
      { header: "student_name", key: "student_name", width: 28 },
      // Kept under the original `roll_number` header so the existing analysis
      // notebooks keyed on that column keep resolving across old and new rows.
      { header: "roll_number", key: "roll_number", width: 20 },
      { header: "student_email", key: "student_email", width: 35 },
      { header: "student_cgpa", key: "student_cgpa", width: 15 },
      { header: "institution", key: "institution", width: 30 },
      { header: "college_id", key: "college_id", width: 25 },
      { header: "subject_id", key: "subject_id", width: 25 },
      { header: "subject_name", key: "subject_name", width: 25 },
      { header: "submission_status", key: "submission_status", width: 20 },
      { header: "total_questions", key: "total_questions", width: 16 },
      { header: "correct_percentage", key: "correct_percentage", width: 18 },
      {
        header: "time_remaining_at_submission",
        key: "time_remaining_at_submission",
        width: 25,
      },
      { header: "timestamp", key: "timestamp", width: 25 },

      { header: "question_id", key: "question_id", width: 25 },
      { header: "confidence_rating", key: "confidence_rating", width: 18 },
      {
        header: "final_selected_option",
        key: "final_selected_option",
        width: 35,
      },
      { header: "is_correct", key: "is_correct", width: 12 },
      { header: "marked_for_review", key: "marked_for_review", width: 18 },
      { header: "option_changes", key: "option_changes", width: 15 },
      { header: "review_click_count", key: "review_click_count", width: 18 },
      { header: "time_spent", key: "time_spent", width: 12 },
    ];
    wsAttempts.getRow(1).font = { bold: true };

    let attemptsCount = 0;
    quizSnapshot.forEach((doc) => {
      const attemptId = doc.id;
      const data = doc.data();

      const studentUid = data.studentUid || "Unknown";
      const studentCgpa =
        data.studentCgpa !== undefined ? data.studentCgpa : null;
      // Pre-multi-college rows carry only `institution` (free text) and no
      // subject — they export with blanks rather than being dropped.
      const institution = data.collegeName || data.institution || "Unknown";
      const correctPercentage =
        data.correctPercentage !== undefined ? data.correctPercentage : 0;
      const timeRemaining =
        data.timeRemainingAtSubmission !== undefined
          ? data.timeRemainingAtSubmission
          : 0;
      const timestamp = data.timestamp || "";

      const behavioralMetrics = data.behavioralMetrics;

      if (behavioralMetrics && typeof behavioralMetrics === "object") {
        Object.keys(behavioralMetrics).forEach((questionId) => {
          const qDetails = behavioralMetrics[questionId];

          wsAttempts.addRow({
            attempt_id: attemptId,
            student_uid: studentUid,
            student_name: data.studentName || "",
            // Pre-multi-college rows wrote `rollNumber`; new rows write both.
            roll_number: data.studentRollNumber || data.rollNumber || "",
            student_email: data.studentEmail || "",
            student_cgpa: studentCgpa,
            institution: institution,
            college_id: data.collegeId || "",
            subject_id: data.subjectId || "",
            subject_name: data.subjectName || "",
            submission_status: data.submissionStatus || "submitted",
            total_questions: data.totalQuestions || 0,
            correct_percentage: correctPercentage,
            time_remaining_at_submission: timeRemaining,
            timestamp: timestamp,

            question_id: questionId,
            confidence_rating: qDetails.confidenceRating || 0,
            final_selected_option: qDetails.finalSelectedOption || "None",
            is_correct: qDetails.isCorrect === true ? 1 : 0,
            marked_for_review: qDetails.markedForReview === true ? 1 : 0,
            option_changes: qDetails.optionChanges || 0,
            review_click_count: qDetails.reviewClickCount || 0,
            time_spent: qDetails.timeSpent || 0,
          });
          attemptsCount++;
        });
      }
    });

    // ==========================================
    // SHEET 2: USERS PROFILE DETAILS
    // ==========================================
    console.log("🔄 Fetching documents from users...");
    const usersSnapshot = await db.collection("users").get();

    const wsUsers = workbook.addWorksheet("Student_Profiles");
    wsUsers.columns = [
      { header: "user_doc_id", key: "user_doc_id", width: 28 },
      { header: "student_uid", key: "student_uid", width: 28 },
      { header: "email", key: "email", width: 35 },
      { header: "role", key: "role", width: 15 },
      { header: "created_at", key: "created_at", width: 25 },
    ];
    wsUsers.getRow(1).font = { bold: true };

    let usersCount = 0;
    usersSnapshot.forEach((doc) => {
      const userData = doc.data();
      wsUsers.addRow({
        user_doc_id: doc.id,
        student_uid: userData.uid || doc.id,
        email: userData.email || "N/A",
        role: userData.role || "student",
        created_at: userData.createdAt || "",
      });
      usersCount++;
    });

    // ==========================================
    // SHEET 3: QUESTION BANK & NLP METRICS
    // ==========================================
    console.log("🔄 Fetching documents from questions...");
    const questionsSnapshot = await db.collection("questions").get();

    const wsQuestions = workbook.addWorksheet("Question_Bank");
    wsQuestions.columns = [
      { header: "question_id", key: "question_id", width: 25 },
      { header: "college_id", key: "college_id", width: 25 },
      { header: "subject_id", key: "subject_id", width: 25 },
      { header: "type", key: "type", width: 15 },
      { header: "difficulty", key: "difficulty", width: 12 },
      { header: "blooms_level", key: "blooms_level", width: 18 },
      { header: "flesch_ease", key: "flesch_ease", width: 12 },
      { header: "gunning_fog_index", key: "gunning_fog_index", width: 18 },
      { header: "lexical_diversity", key: "lexical_diversity", width: 18 },
      {
        header: "syntactic_complexity",
        key: "syntactic_complexity",
        width: 20,
      },
      { header: "correct_answer", key: "correct_answer", width: 35 },
      { header: "question_text", key: "question_text", width: 50 },
    ];
    wsQuestions.getRow(1).font = { bold: true };

    let questionsCount = 0;
    questionsSnapshot.forEach((doc) => {
      const qData = doc.data();

      wsQuestions.addRow({
        question_id: doc.id,
        college_id: qData.collegeId || "",
        subject_id: qData.subjectId || "",
        type: qData.type || "N/A",
        difficulty: qData.difficulty || "N/A",
        blooms_level: qData.bloomsLevel || "N/A",
        flesch_ease: qData.fleschEase !== undefined ? qData.fleschEase : null,
        gunning_fog_index:
          qData.gunningFogIndex !== undefined ? qData.gunningFogIndex : null,
        lexical_diversity:
          qData.lexicalDiversity !== undefined ? qData.lexicalDiversity : null,
        syntactic_complexity: qData.syntacticComplexity || "N/A",
        correct_answer: qData.correctAnswer || "N/A",
        question_text: qData.text || "N/A",
      });
      questionsCount++;
    });

    // ==========================================
    // SHEET 4: COLLEGE / SUBJECT REGISTRY
    // Makes the id columns on the other sheets self-describing.
    // ==========================================
    console.log("🔄 Fetching colleges and subjects...");
    const [collegesSnapshot, subjectsSnapshot] = await Promise.all([
      db.collection("colleges").get(),
      db.collection("subjects").get(),
    ]);

    const collegeNameById = {};
    collegesSnapshot.forEach((doc) => {
      collegeNameById[doc.id] = doc.data().name || "";
    });

    const wsScope = workbook.addWorksheet("College_Subject_Registry");
    wsScope.columns = [
      { header: "college_id", key: "college_id", width: 25 },
      { header: "college_name", key: "college_name", width: 35 },
      { header: "subject_id", key: "subject_id", width: 25 },
      { header: "subject_name", key: "subject_name", width: 25 },
      { header: "total_time_allowed_min", key: "total_time", width: 22 },
      { header: "passing_threshold_pct", key: "passing_threshold", width: 22 },
      { header: "exam_start_time", key: "exam_start_time", width: 25 },
      { header: "exam_end_time", key: "exam_end_time", width: 25 },
      { header: "active", key: "active", width: 10 },
    ];
    wsScope.getRow(1).font = { bold: true };

    let scopeCount = 0;
    subjectsSnapshot.forEach((doc) => {
      const s = doc.data();
      wsScope.addRow({
        college_id: s.collegeId || "",
        college_name: collegeNameById[s.collegeId] || "",
        subject_id: doc.id,
        subject_name: s.name || "",
        total_time: s.totalTimeAllowed ?? null,
        passing_threshold: s.passingThreshold ?? null,
        exam_start_time: s.examStartTime || "",
        exam_end_time: s.examEndTime || "",
        active: s.active === false ? 0 : 1,
      });
      scopeCount++;
    });

    // Save final combined workbook
    const outputPath = path.join(__dirname, "Quiz_Attempts_Report.xlsx");
    await workbook.xlsx.writeFile(outputPath);

    console.log(`\n============== EXPORT SUMMARY ==============`);
    console.log(`✅ Sheet 1 (ML_Behavioral_Data) : ${attemptsCount} rows.`);
    console.log(`✅ Sheet 2 (Student_Profiles)  : ${usersCount} profiles.`);
    console.log(
      `✅ Sheet 3 (Question_Bank)     : ${questionsCount} questions parsed.`,
    );
    console.log(
      `✅ Sheet 4 (College_Subject_Registry) : ${scopeCount} subject(s) across ${collegesSnapshot.size} college(s).`,
    );
    console.log(`📊 Master dataset updated in: ${outputPath}`);
    console.log(`============================================`);
  } catch (error) {
    console.error("❌ Error executing 3-sheet master compiler:", error);
  } finally {
    process.exit();
  }
}

generateMasterMLDataset();

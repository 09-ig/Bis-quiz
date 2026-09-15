import React, { useState, useEffect, useRef } from "react";
import { auth } from "../config/firebase";
import {
  DEFAULT_SUBJECT_SETTINGS,
  fetchAttemptedSubjectIds,
  fetchColleges,
  fetchQuestionsForSubject,
  fetchSubjects,
  hasAttempted,
  saveAttempt,
  subjectWindowStatus,
} from "../services/quizData";
import SubmissionModal from "./SubmissionModal";
import {
  Timer,
  BookMarked,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Trophy,
  Gauge,
  LogOut,
  Check,
  X,
} from "lucide-react";

export default function StudentDashboard({ user }) {
  // --- Candidate identity + quiz scope (chosen on the shared entry link) ---
  const [fullName, setFullName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [cgpa, setCgpa] = useState("");
  const [collegeId, setCollegeId] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const [colleges, setColleges] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [attemptedSubjectIds, setAttemptedSubjectIds] = useState(new Set());
  const [pickerLoading, setPickerLoading] = useState(true);
  const [startError, setStartError] = useState("");
  const [starting, setStarting] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());

  // Each college gets its own link: ?college=<id> pins the institution so a
  // student cannot pick the wrong one. A bare link with no parameter still
  // shows the full dropdown, so previously shared links keep working.
  const [linkedCollegeId] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("college") || "";
    } catch {
      return "";
    }
  });

  const [onboarded, setOnboarded] = useState(false);

  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [completed, setCompleted] = useState(false);

  // UI rendering state hooks
  const [answers, setAnswers] = useState({});
  const [confidence, setConfidence] = useState({});
  const [reviews, setReviews] = useState({});
  const [visited, setVisited] = useState({});
  const [timeLeft, setTimeLeft] = useState(
    DEFAULT_SUBJECT_SETTINGS.totalTimeAllowed * 60,
  );
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);

  // REAL-TIME ENGINE CORRECTIONS: Persistent references tracking metrics outside of closures
  const activeSecsRef = useRef(0);
  const timeSpentMapRef = useRef({});
  const optionChangesRef = useRef({});
  const reviewTimesMapRef = useRef({});
  const confidenceRef = useRef({});

  const countdownTimer = useRef(null);
  const focusTimer = useRef(null);

  // 🔽 PRODUCTION-GRADE ANTI-CHEAT LOCKDOWN ENGINE 🔽
  const [violationCount, setViolationCount] = useState(0);
  const [showWarning, setShowWarning] = useState(false);

  // Browser-compliant Fullscreen Activator
  const enterFullscreen = () => {
    const element = document.documentElement;
    if (element.requestFullscreen) element.requestFullscreen();
    else if (element.mozRequestFullScreen) element.mozRequestFullScreen();
    else if (element.webkitRequestFullscreen) element.webkitRequestFullscreen();
    else if (element.msRequestFullscreen) element.msRequestFullscreen();
  };

  const exitFullscreenQuietly = () => {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Grace window after entering (or re-entering) fullscreen during which the
  // security poller won't flag a violation, since requestFullscreen()'s
  // transition isn't instantaneous
  const graceUntilRef = useRef(0);

  // Marks the grace window whenever onboarding finishes (actual fullscreen
  // request now happens directly inside the "Start Test" click handler, so
  // it stays inside the user-gesture context browsers require)
  useEffect(() => {
    if (onboarded && !completed) {
      graceUntilRef.current = Date.now() + 2000;
    }
  }, [onboarded, completed]);

  // High-Frequency Background Event Guard (Detects focus loss, resizing, minimized frames)
  useEffect(() => {
    if (!onboarded || completed) return;

    const enforceSecurityLock = () => {
      if (Date.now() < graceUntilRef.current) return;

      const isNotFullscreen =
        !document.fullscreenElement &&
        !document.webkitFullscreenElement &&
        !document.mozFullScreenElement &&
        !document.msFullscreenElement;

      if (document.hidden || isNotFullscreen) {
        setShowWarning(true);
      }
    };

    const aggressivePoller = setInterval(enforceSecurityLock, 200);
    window.addEventListener("blur", enforceSecurityLock);
    document.addEventListener("visibilitychange", enforceSecurityLock);
    document.addEventListener("fullscreenchange", enforceSecurityLock);

    return () => {
      clearInterval(aggressivePoller);
      window.removeEventListener("blur", enforceSecurityLock);
      document.removeEventListener("visibilitychange", enforceSecurityLock);
      document.removeEventListener("fullscreenchange", enforceSecurityLock);
    };
  }, [onboarded, completed]);

  // Safely increment violation count state when the warning screen triggers
  useEffect(() => {
    if (showWarning) {
      setViolationCount((prev) => prev + 1);
    }
  }, [showWarning]);

  // Automated Cutoff Watcher: Runs outside the render thread to ensure non-blocking UI switching
  useEffect(() => {
    if (violationCount >= 3 && !completed) {
      const executeAutomaticTermination = async () => {
        alert(
          "Exam permanently terminated! You have exceeded the maximum allowed window violations (3/3). Your progress has been automatically saved.",
        );

        // Compile and sync the student data payload vector up to this exact moment
        const payload = compileSubmissionPayload(timeLeft, "auto_terminated");
        try {
          await saveAttempt(payload);
        } catch (err) {
          console.error(
            "Auto-submission cloud pipeline log failure:",
            err.message,
          );
        }

        // Close overlay and update completion state to route to the native success layout
        setShowWarning(false);
        setCompleted(true);

        // Clean up full screen restrictions
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      };

      executeAutomaticTermination();
    }
  }, [violationCount, completed]);

  // Handle Resuming the Assessment (Only works for strikes 1 and 2)
  const handleResumeTest = () => {
    if (violationCount < 3) {
      setShowWarning(false);
      enterFullscreen();
      graceUntilRef.current = Date.now() + 2000;
    }
  };

  // 🔒 BULLETPROOF SELECTION, COPY-PASTE & SHORTCUT HARDENING 🔒
  useEffect(() => {
    if (!onboarded || completed) return;

    // Inject engine-level CSS layout rules directly into document header to break text highlights
    const globalStyleBlock = document.createElement("style");
    globalStyleBlock.id = "anti-copy-exam-shield";
    globalStyleBlock.innerHTML = `
      * {
        -webkit-user-select: none !important;
        -moz-user-select: none !important;
        -ms-user-select: none !important;
        user-select: none !important;
      }
      input, textarea {
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
        user-select: text !important;
      }
    `;
    document.head.appendChild(globalStyleBlock);

    const blockEvent = (e) => e.preventDefault();

    const blockKeyCombinations = (e) => {
      // Intercept and break PrintScreen utility operations
      if (e.key === "PrintScreen") {
        navigator.clipboard.writeText("Protected Document Vector");
        alert("Screenshots and display captures are strictly prohibited.");
        e.preventDefault();
      }
      // Intercept standard extraction pipelines: Ctrl+P, Ctrl+U, Ctrl+Shift+I/C/J
      if (
        e.ctrlKey &&
        (e.key === "p" ||
          e.key === "P" ||
          e.key === "u" ||
          e.key === "U" ||
          (e.shiftKey && (e.key === "I" || e.key === "C" || e.key === "J")))
      ) {
        e.preventDefault();
      }
    };

    // Document Scope Event Overrides
    document.addEventListener("copy", blockEvent);
    document.addEventListener("cut", blockEvent);
    document.addEventListener("paste", blockEvent);
    document.addEventListener("contextmenu", blockEvent); // Completely neutralizes right clicks
    document.addEventListener("selectstart", blockEvent); // Completely locks down cursor select highlights
    document.addEventListener("dragstart", blockEvent); // Completely stops mouse image dragging
    window.addEventListener("keydown", blockKeyCombinations);

    return () => {
      // Discard constraints when component unmounts or completes
      const styleTag = document.getElementById("anti-copy-exam-shield");
      if (styleTag) styleTag.remove();

      document.removeEventListener("copy", blockEvent);
      document.removeEventListener("cut", blockEvent);
      document.removeEventListener("paste", blockEvent);
      document.removeEventListener("contextmenu", blockEvent);
      document.removeEventListener("selectstart", blockEvent);
      document.removeEventListener("dragstart", blockEvent);
      window.removeEventListener("keydown", blockKeyCombinations);
    };
  }, [onboarded, completed]);
  // 🔼 END OF PRODUCTION-GRADE ANTI-CHEAT ENGINE 🔼

  // --- Picker bootstrap: one shared link, so the student self-selects scope ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Settled, not all: the prior-attempts lookup is only a convenience for
      // greying out finished subjects. If Firestore rules block that query it
      // must not take the college dropdown down with it — handleOnboardSubmit
      // re-checks with a direct get() before letting anyone start.
      const [collegeResult, attemptResult] = await Promise.allSettled([
        fetchColleges({ activeOnly: true }),
        fetchAttemptedSubjectIds(user.uid),
      ]);
      if (cancelled) return;

      if (collegeResult.status === "fulfilled") {
        setColleges(collegeResult.value);
        // Only honour the link's college if it is real and currently live —
        // a stale or hidden id falls back to the dropdown rather than
        // stranding the student on an empty locked field.
        if (
          linkedCollegeId &&
          collegeResult.value.some((c) => c.id === linkedCollegeId)
        ) {
          setCollegeId(linkedCollegeId);
        }
      } else {
        console.error(
          "Failed to load institution registry:",
          collegeResult.reason,
        );
        setStartError(
          "Could not load the institution list. Refresh and try again.",
        );
      }

      if (attemptResult.status === "fulfilled") {
        setAttemptedSubjectIds(attemptResult.value);
      } else {
        console.warn("Prior-attempt lookup unavailable:", attemptResult.reason);
      }

      setPickerLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user.uid, linkedCollegeId]);

  // Subject list is scoped to the chosen college
  useEffect(() => {
    let cancelled = false;
    setSubjectId("");
    if (!collegeId) {
      setSubjects([]);
      return;
    }
    (async () => {
      try {
        const list = await fetchSubjects(collegeId, { activeOnly: true });
        if (!cancelled) setSubjects(list);
      } catch (err) {
        console.error("Failed to load subject list:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [collegeId]);

  // Ticks once a second so the picker's window notice can auto-transition
  // (opens / closes) without the student needing to refresh the page
  useEffect(() => {
    if (onboarded) return;
    const tickTimer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(tickTimer);
  }, [onboarded]);

  useEffect(() => {
    if (onboarded && questions.length > 0 && !completed) {
      countdownTimer.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(countdownTimer.current);
            forceAutoSubmission();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      focusTimer.current = setInterval(() => {
        activeSecsRef.current += 1;
      }, 1000);
    }
    return () => {
      clearInterval(countdownTimer.current);
      clearInterval(focusTimer.current);
    };
  }, [onboarded, currentIdx, questions, completed]);

  const syncActiveTelemetry = () => {
    if (questions.length === 0) return;
    const currentId = questions[currentIdx].id;

    const targetTime = activeSecsRef.current;
    if (targetTime > 0) {
      activeSecsRef.current = 0;
      timeSpentMapRef.current[currentId] =
        (timeSpentMapRef.current[currentId] || 0) + targetTime;
    }
  };

  const handleNavigate = (nextIdx) => {
    if (nextIdx < 0 || nextIdx >= questions.length) return;
    syncActiveTelemetry();
    const nextId = questions[nextIdx].id;
    setVisited((prev) => ({ ...prev, [nextId]: true }));
    setCurrentIdx(nextIdx);
  };

  const selectOptionValue = (val) => {
    const currentId = questions[currentIdx].id;

    setAnswers((prevAnswers) => {
      const originalVal = prevAnswers[currentId];
      if (originalVal === val) return prevAnswers;

      if (originalVal !== undefined && originalVal !== "") {
        optionChangesRef.current[currentId] =
          (optionChangesRef.current[currentId] || 0) + 1;
      }

      return { ...prevAnswers, [currentId]: val };
    });
  };

  const toggleReviewFlag = (questionId) => {
    if (!questionId) return;

    setReviews((prev) => ({ ...prev, [questionId]: !prev[questionId] }));
    reviewTimesMapRef.current[questionId] =
      (Number(reviewTimesMapRef.current[questionId]) || 0) + 1;
  };

  const recordConfidenceIndex = (rating) => {
    const currentId = questions[currentIdx].id;
    setConfidence((prev) => ({ ...prev, [currentId]: rating }));
    confidenceRef.current[currentId] = rating;
  };

  const getQuestionBadgeColor = (qId, idx) => {
    if (currentIdx === idx)
      return "bg-blue-50 border-blue-600 text-blue-700 font-bold ring-2 ring-blue-100 scale-105 shadow-sm";
    if (reviews[qId])
      return "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100";
    if (answers[qId])
      return "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100";
    if (visited[qId])
      return "bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100";
    return "bg-white border-slate-200 text-slate-400 hover:bg-slate-50";
  };

  const formatTimerClock = (seconds) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const formatWindowTime = (iso) => {
    if (!iso) return "";
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const selectedCollege = colleges.find((c) => c.id === collegeId);
  const selectedSubject = subjects.find((s) => s.id === subjectId);

  // Locked only once the linked college has resolved to a live institution.
  const collegeLocked =
    Boolean(linkedCollegeId) && collegeId === linkedCollegeId && Boolean(selectedCollege);

  // The entry window now lives on the subject, so it is evaluated per paper
  // rather than once globally.
  const windowStatus = selectedSubject
    ? subjectWindowStatus(selectedSubject, nowTick)
    : "open";

  const compileSubmissionPayload = (timeRemaining, status = "submitted") => {
    syncActiveTelemetry();

    let correctCount = 0;
    const trackingMetrics = {};

    questions.forEach((q) => {
      const selected = answers[q.id] || "";
      const isCorrect = selected === q.correctAnswer;
      if (isCorrect) correctCount++;

      trackingMetrics[q.id] = {
        finalSelectedOption: String(selected),
        timeSpent: Number(timeSpentMapRef.current[q.id] || 0),
        optionChanges: Number(optionChangesRef.current[q.id] || 0),
        markedForReview: Boolean(
          reviews[q.id] || (reviewTimesMapRef.current[q.id] || 0) > 0,
        ),
        reviewClickCount: Number(reviewTimesMapRef.current[q.id] || 0),
        confidenceRating: Number(confidenceRef.current[q.id] || 0),
        isCorrect: Boolean(isCorrect),
      };
    });

    return {
      collegeId,
      collegeName: selectedCollege?.name || "",
      subjectId,
      subjectName: selectedSubject?.name || "",
      // Retained under the original key so the existing export pipeline and any
      // already-collected Thapar rows stay column-compatible.
      institution: selectedCollege?.name || "",
      studentUid: user.uid,
      studentName: fullName.trim(),
      studentRollNumber: studentId.trim(),
      // Original single-college key, still written so exports and any downstream
      // analysis keyed on `rollNumber` keep resolving for new rows too.
      rollNumber: studentId.trim(),
      studentEmail: user.email || "",
      studentCgpa: parseFloat(cgpa),
      submissionStatus: status,
      totalQuestions: questions.length,
      correctPercentage:
        questions.length > 0
          ? Math.round((correctCount / questions.length) * 10000) / 100
          : 0,
      timeRemainingAtSubmission: Number(timeRemaining),
      timestamp: new Date().toISOString(),
      behavioralMetrics: trackingMetrics,
    };
  };

  const forceAutoSubmission = async () => {
    const payload = compileSubmissionPayload(0, "time_expired");
    try {
      await saveAttempt(payload);
      setCompleted(true);
    } catch (err) {
      console.error("Auto submission error:", err);
    }
  };

  const handleOnboardSubmit = async (e) => {
    e.preventDefault();
    setStartError("");

    if (!fullName.trim() || !studentId.trim() || !collegeId || !subjectId) {
      setStartError("Complete every field before starting.");
      return;
    }

    // Window check runs before anything async so we never take the screen over
    // for a sitting that cannot begin.
    const status = subjectWindowStatus(selectedSubject, Date.now());
    if (status === "not_started") {
      setStartError(
        `This paper opens on ${formatWindowTime(selectedSubject.examStartTime)}. This page unlocks automatically at that time.`,
      );
      return;
    }
    if (status === "closed") {
      setStartError(
        `The submission window for this paper closed on ${formatWindowTime(selectedSubject.examEndTime)}. Contact your administrator if you believe this is an error.`,
      );
      return;
    }

    // requestFullscreen() only works inside the click's user-gesture context, so
    // it fires here rather than from an effect after the awaits below.
    enterFullscreen();
    graceUntilRef.current = Date.now() + 2000;

    setStarting(true);
    try {
      // Re-check at the last moment: the picker list could be stale if the
      // student left this tab open across another sitting.
      if (await hasAttempted(user.uid, subjectId)) {
        setAttemptedSubjectIds((prev) => new Set(prev).add(subjectId));
        setStartError(
          "You have already submitted this subject. Pick a different one.",
        );
        exitFullscreenQuietly();
        return;
      }

      const subjectQuestions = await fetchQuestionsForSubject(subjectId);

      if (subjectQuestions.length === 0) {
        setStartError(
          "No questions have been published for this subject yet. Contact the administrator.",
        );
        exitFullscreenQuietly();
        return;
      }

      const minutes =
        Number(selectedSubject?.totalTimeAllowed) ||
        DEFAULT_SUBJECT_SETTINGS.totalTimeAllowed;

      setQuestions(subjectQuestions);
      setTimeLeft(minutes * 60);
      setVisited({ [subjectQuestions[0].id]: true });
      setCurrentIdx(0);
      setOnboarded(true);
    } catch (err) {
      console.error("Exam initialization failure:", err);
      setStartError("Could not start the test: " + err.message);
      exitFullscreenQuietly();
    } finally {
      setStarting(false);
    }
  };

  // Return to the picker so a student can sit a different subject. Every
  // per-attempt ref has to be cleared or telemetry bleeds across sittings.
  const startAnotherSubject = () => {
    setAttemptedSubjectIds((prev) => new Set(prev).add(subjectId));
    setSubjectId("");
    setOnboarded(false);
    setCompleted(false);
    setQuestions([]);
    setCurrentIdx(0);
    setAnswers({});
    setConfidence({});
    setReviews({});
    setVisited({});
    setViolationCount(0);
    setShowWarning(false);
    setIsSubmitModalOpen(false);
    setStartError("");
    activeSecsRef.current = 0;
    timeSpentMapRef.current = {};
    optionChangesRef.current = {};
    reviewTimesMapRef.current = {};
    confidenceRef.current = {};
  };

  if (!onboarded) {
    const remainingSubjects = subjects.filter(
      (s) => !attemptedSubjectIds.has(s.id),
    );
    const windowBlocked = Boolean(selectedSubject) && windowStatus !== "open";

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-5 shadow-sm">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3 text-slate-800 text-sm font-bold tracking-wide uppercase">
            <GraduationCap className="w-5 h-5 text-blue-600" /> Candidate
            Verification
          </div>

          {pickerLoading ? (
            <div className="py-10 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Loading institution registry
              </span>
            </div>
          ) : (
            <form onSubmit={handleOnboardSubmit} className="space-y-4">
              {startError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-[11px] p-2.5 rounded-lg font-medium">
                  {startError}
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-lg p-2.5 text-xs text-slate-800 outline-none transition"
                  placeholder="e.g., John Doe"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Student ID / Roll Number
                </label>
                <input
                  type="text"
                  required
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-lg p-2.5 text-xs text-slate-800 outline-none transition"
                  placeholder="e.g., 102103045"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Registered Email
                </label>
                <input
                  type="email"
                  value={user.email || ""}
                  readOnly
                  className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-500 outline-none cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Institution
                </label>
                {collegeLocked ? (
                  <input
                    type="text"
                    value={selectedCollege?.name || ""}
                    readOnly
                    className="w-full bg-slate-100 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-600 font-semibold outline-none cursor-not-allowed"
                  />
                ) : (
                  <select
                    required
                    value={collegeId}
                    onChange={(e) => setCollegeId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-lg p-2.5 text-xs text-slate-800 outline-none transition"
                  >
                    <option value="">Select your college...</option>
                    {colleges.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
                {colleges.length === 0 && (
                  <p className="text-[10px] text-rose-600 font-semibold mt-1">
                    No institutions are open right now. Contact the
                    administrator.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Subject
                </label>
                <select
                  required
                  value={subjectId}
                  disabled={!collegeId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-lg p-2.5 text-xs text-slate-800 outline-none transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {collegeId
                      ? "Select the subject quiz..."
                      : "Select an institution first"}
                  </option>
                  {subjects.map((s) => {
                    const done = attemptedSubjectIds.has(s.id);
                    return (
                      <option key={s.id} value={s.id} disabled={done}>
                        {s.name}
                        {done ? " — already submitted" : ""}
                      </option>
                    );
                  })}
                </select>
                {collegeId && remainingSubjects.length === 0 && (
                  <p className="text-[10px] text-amber-600 font-semibold mt-1">
                    {subjects.length === 0
                      ? "No subjects published for this institution yet."
                      : "You have completed every subject offered here."}
                  </p>
                )}

                {/* Per-subject entry window notice — auto-unlocks on the tick */}
                {selectedSubject && windowStatus === "not_started" && (
                  <p className="text-[10px] text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-2 mt-1.5 font-semibold leading-relaxed">
                    <Timer className="w-3 h-3 inline-block mr-1 -mt-0.5" />
                    This paper opens on{" "}
                    {formatWindowTime(selectedSubject.examStartTime)}. This page
                    will unlock automatically.
                  </p>
                )}
                {selectedSubject && windowStatus === "closed" && (
                  <p className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 mt-1.5 font-semibold leading-relaxed">
                    <Timer className="w-3 h-3 inline-block mr-1 -mt-0.5" />
                    The window for this paper closed on{" "}
                    {formatWindowTime(selectedSubject.examEndTime)}.
                  </p>
                )}
                {selectedSubject &&
                  windowStatus === "open" &&
                  selectedSubject.examEndTime && (
                    <p className="text-[10px] text-slate-500 mt-1.5 font-semibold">
                      Closes {formatWindowTime(selectedSubject.examEndTime)}.
                    </p>
                  )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Current Cumulative CGPA (0.00 - 10.00)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="10"
                  required
                  value={cgpa}
                  onChange={(e) => setCgpa(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-lg p-2.5 text-xs text-slate-800 outline-none transition"
                  placeholder="e.g., 9.12"
                />
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="submit"
                  disabled={starting || windowBlocked}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-lg text-xs tracking-wider transition uppercase shadow-sm"
                >
                  {starting
                    ? "Preparing Test..."
                    : windowStatus === "not_started"
                      ? "Not Yet Open"
                      : windowStatus === "closed"
                        ? "Window Closed"
                        : "Start Test"}
                </button>
                <button
                  type="button"
                  onClick={() => auth.signOut()}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2.5 rounded-lg text-xs tracking-wider transition uppercase text-center border border-slate-200/40"
                >
                  ◀ Cancel & Go Back
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (completed) {
    const score = questions.reduce((acc, q) => acc + (answers[q.id] === q.correctAnswer ? 1 : 0), 0);
    const selectedSubject = subjects.find((s) => s.id === subjectId);

    return (
      <div className="min-h-screen bg-slate-50 p-4 select-none pb-20 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-6 mt-10">
          <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-4 shadow-sm text-center">
            <Trophy className="w-12 h-12 text-emerald-500 mx-auto" />
            <h2 className="text-base font-bold text-slate-800 uppercase tracking-wide">
              Test Submitted Successfully.
            </h2>
            
            <div className="py-4">
              <div className="text-3xl font-black text-blue-600 tracking-tight">
                {score} <span className="text-xl text-slate-400 font-bold mx-1">/</span> {questions.length}
              </div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                Final Score
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed font-medium">
              Your answers and test progress for{" "}
              <span className="font-bold text-slate-700">
                {selectedSubject?.name || "this subject"}
              </span>{" "}
              have been securely saved.
            </p>
            <div className="pt-2 space-y-2 max-w-sm mx-auto">
              <button
                onClick={startAnotherSubject}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs px-5 py-2.5 rounded-lg transition font-bold uppercase tracking-wider shadow-sm"
              >
                Take Another Subject
              </button>
              <button
                onClick={() => auth.signOut()}
                className="w-full bg-slate-800 hover:bg-slate-900 text-white text-xs px-5 py-2.5 rounded-lg transition font-bold uppercase tracking-wider shadow-sm"
              >
                Log Out & Exit Test
              </button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-3 mb-4">
              Detailed Question Review
            </h3>
            <div className="space-y-4">
              {questions.map((q, i) => {
                const chosen = answers[q.id];
                const isCorrect = chosen === q.correctAnswer;
                return (
                  <div key={q.id} className={`p-4 rounded-xl border space-y-3 ${isCorrect ? "bg-emerald-50/30 border-emerald-100" : "bg-rose-50/30 border-rose-100"}`}>
                    <div className="flex gap-3">
                      <div className="mt-0.5 shrink-0">
                        {isCorrect ? (
                          <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
                            <X className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                      <div className="space-y-3 w-full">
                        <p className="text-sm font-semibold text-slate-800 leading-snug">
                          <span className="text-slate-400 font-mono mr-1">{i + 1}.</span> {q.text}
                        </p>
                        
                        <div className="grid sm:grid-cols-2 gap-2 text-xs">
                          <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Your Answer</div>
                            <div className={`font-medium ${!chosen ? "text-slate-400 italic" : (isCorrect ? "text-emerald-700" : "text-rose-700")}`}>
                              {chosen || "Not Answered"}
                            </div>
                          </div>
                          
                          {!isCorrect && (
                            <div className="bg-white p-2.5 rounded-lg border border-emerald-100 bg-emerald-50/50">
                              <div className="text-[10px] uppercase font-bold text-emerald-600/70 tracking-wider mb-1">Correct Answer</div>
                              <div className="font-medium text-emerald-700">
                                {q.correctAnswer}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeQuestion = questions[currentIdx] || {
    text: "",
    options: [],
    id: "",
  };

  const missingConfidenceCount = questions.filter(
    (q) => answers[q.id] && !confidence[q.id],
  ).length;

  return (
    <div
      className="min-h-screen bg-slate-50 text-slate-600 font-sans text-xs flex flex-col md:flex-row select-none"
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onPaste={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      onSelectStart={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      <div className="flex-1 p-6 space-y-6 flex flex-col justify-between">
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 relative shadow-sm">
            <div className="absolute top-3 right-4 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
              Item Cluster {currentIdx + 1} of {questions.length}
            </div>
            <div className="flex gap-3 text-slate-800 text-sm font-medium leading-relaxed">
              <span className="text-blue-600 font-bold font-mono">
                {currentIdx + 1}.
              </span>
              <p className="whitespace-pre-wrap">{activeQuestion.text}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {activeQuestion.options.map((opt, i) => {
              const isSelected = answers[activeQuestion.id] === opt;
              return (
                <button
                  key={i}
                  onClick={() => selectOptionValue(opt)}
                  className={`w-full text-left font-medium border p-3.5 rounded-xl transition flex items-center gap-4 ${isSelected ? "bg-blue-50/50 border-blue-500 text-blue-700 font-semibold shadow-sm" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"}`}
                >
                  <div
                    className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs font-mono transition-all ${isSelected ? "border-blue-600 bg-blue-600 text-white font-bold shadow-sm" : "border-slate-300 text-slate-400"}`}
                  >
                    {String.fromCharCode(65 + i)}
                  </div>
                  <span>{opt}</span>
                </button>
              );
            })}
          </div>

          {answers[activeQuestion.id] && (
            <div
              className={`bg-white border p-4 rounded-xl space-y-2.5 shadow-sm transition-all duration-300 ${!confidence[activeQuestion.id] ? "border-rose-300 bg-rose-50/10" : "border-slate-200"}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-slate-500">
                  <Gauge className="w-3.5 h-3.5 text-blue-600" /> Response
                  Confidence Index
                </div>
                {!confidence[activeQuestion.id] && (
                  <span className="text-[9px] text-rose-600 font-bold uppercase tracking-wide animate-pulse">
                    ⚠️ Mark your confidence
                  </span>
                )}
              </div>
              <div className="flex bg-slate-100 border border-slate-200/60 p-1 rounded-xl gap-1">
                {[1, 2, 3, 4, 5].map((num) => {
                  const isActive = confidence[activeQuestion.id] === num;
                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => recordConfidenceIndex(num)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${isActive ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
                    >
                      {num}
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-between text-[9px] text-slate-400 font-bold uppercase tracking-wide px-1">
                <span>Complete Guess</span>
                <span>Absolute Certainty</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-200 gap-3 mt-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleNavigate(currentIdx - 1)}
              disabled={currentIdx === 0}
              className="bg-white border border-slate-200 hover:border-slate-300 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 text-xs text-slate-600 disabled:opacity-30 disabled:pointer-events-none transition shadow-sm"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>
            <button
              type="button"
              onClick={() => handleNavigate(currentIdx + 1)}
              disabled={currentIdx === questions.length - 1}
              className="bg-white border border-slate-200 hover:border-slate-300 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 text-xs text-slate-600 disabled:opacity-30 disabled:pointer-events-none transition shadow-sm"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => toggleReviewFlag(activeQuestion.id)}
            className={`font-bold px-4 py-1.5 border rounded-lg flex items-center gap-2 text-xs uppercase tracking-wider transition shadow-sm ${reviews[activeQuestion.id] ? "bg-amber-50 border-amber-400 text-amber-700" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}
          >
            <BookMarked className="w-3.5 h-3.5" />{" "}
            {reviews[activeQuestion.id] ? "Flagged" : "Mark for Review"}
          </button>
        </div>
      </div>

      <div className="w-full md:w-80 bg-white border-l border-slate-200 p-6 flex flex-col justify-between shadow-sm">
        <div className="space-y-6">
          <div className="bg-slate-50 border border-slate-200/60 rounded-xl px-4 py-2.5">
            <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider block">
              Active Paper
            </span>
            <div className="text-[11px] font-bold text-slate-700 mt-0.5 truncate">
              {selectedSubject?.name}
            </div>
            <div className="text-[9px] text-slate-400 font-medium truncate">
              {selectedCollege?.name}
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200/60 rounded-xl py-3.5 px-4 relative">
            <div className="flex justify-between items-center">
              <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider block">
                Remaining Time Vector
              </span>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Disconnect terminal session?"))
                    auth.signOut();
                }}
                className="text-slate-300 hover:text-rose-600 transition"
                title="Force Log Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
            <div
              className={`text-xl font-bold font-mono tracking-wider flex items-center justify-center gap-1.5 mt-1 ${timeLeft < 300 ? "text-rose-600 animate-pulse" : "text-blue-600"}`}
            >
              <Timer className="w-4 h-4" /> {formatTimerClock(timeLeft)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[9px] font-bold uppercase tracking-wide">
            <div className="bg-slate-50 border border-slate-200 p-2 rounded-lg text-center">
              <span className="text-slate-400 block">Attempted</span>
              <span className="text-xs text-emerald-600 font-bold mt-0.5 block">
                {questions.filter((q) => answers[q.id]).length}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-2 rounded-lg text-center">
              <span className="text-slate-400 block">In Review</span>
              <span className="text-xs text-amber-600 font-bold mt-0.5 block">
                {questions.filter((q) => reviews[q.id]).length}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-2 rounded-lg text-center">
              <span className="text-slate-400 block">Pending</span>
              <span className="text-xs text-rose-600 font-bold mt-0.5 block">
                {
                  questions.filter((q) => visited[q.id] && !answers[q.id])
                    .length
                }
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 p-2 rounded-lg text-center">
              <span className="text-slate-400 block">Unvisited</span>
              <span className="text-xs text-slate-400 font-bold mt-0.5 block">
                {questions.filter((q) => !visited[q.id]).length}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
              Assessment Grid Matrix
            </span>
            <div className="grid grid-cols-8 gap-1 p-2 bg-slate-50 border border-slate-100 rounded-xl">
              {questions.map((q, index) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => handleNavigate(index)}
                  className={`py-1.5 border rounded font-mono font-bold text-center text-[10px] transition flex items-center justify-center ${getQuestionBadgeColor(q.id, index)}`}
                >
                  {(index + 1).toString().padStart(2, "0")}
                </button>
              ))}
            </div>
          </div>
        </div>

        {missingConfidenceCount > 0 && (
          <div className="text-rose-600 font-bold text-center text-[10px] mt-4 uppercase animate-pulse bg-rose-50 border border-rose-200/50 p-2.5 rounded-xl">
            ⚠️ Mark confidence on all answered questions to submit (
            {missingConfidenceCount} remaining)
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            if (missingConfidenceCount > 0) {
              alert(
                `Please mark your confidence level for all answered questions first (${missingConfidenceCount} remaining).`,
              );
              return;
            }
            syncActiveTelemetry();
            setIsSubmitModalOpen(true);
          }}
          className={`w-full font-bold py-2.5 rounded-xl text-xs tracking-wider transition uppercase mt-2 shadow-sm ${missingConfidenceCount > 0 ? "bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300/40" : "bg-rose-600 hover:bg-rose-700 text-white"}`}
        >
          Final Exam Submission
        </button>
      </div>

      {isSubmitModalOpen && (
        <SubmissionModal
          questions={questions}
          answers={answers}
          reviews={reviews}
          reviewTimesMap={{ ...reviewTimesMapRef.current }}
          visited={visited}
          onClose={() => setIsSubmitModalOpen(false)}
          onSubmitConfirm={async () => {
            const payload = compileSubmissionPayload(timeLeft);
            try {
              await saveAttempt(payload);
              setCompleted(true);
              setIsSubmitModalOpen(false);
            } catch (err) {
              alert("Data pipeline submission failure: " + err.message);
            }
          }}
        />
      )}

      {/* 🔽 OPAQUE LOCKDOWN WALL FOR STRIKES 1 & 2 🔽 */}
      {showWarning && violationCount < 3 && (
        <div className="fixed inset-0 bg-slate-950 flex items-center justify-center z-50 p-4 select-none">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-2xl border-t-4 border-amber-500 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-7 h-7 text-amber-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>

            <h3 className="text-base font-bold text-slate-800 uppercase tracking-wide">
              Security Focus Alert
            </h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              You navigated away from the exam or left fullscreen view. All
              background processes and focus variations are monitored.
            </p>

            <div className="my-4 p-3 rounded-xl border flex justify-between items-center text-left bg-amber-50 border-amber-100">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-amber-700">
                  System Integrity Telemetry:
                </div>
                <div className="text-xs text-slate-700 font-medium mt-0.5">
                  Focus Violation Record
                </div>
              </div>
              <div className="text-xl font-mono font-bold px-3 py-1 rounded-lg border shadow-sm text-amber-600 bg-white border-amber-200">
                {violationCount} / 3
              </div>
            </div>

            <button
              type="button"
              onClick={handleResumeTest}
              className="w-full text-white bg-amber-500 hover:bg-amber-600 font-bold py-2.5 rounded-xl text-xs tracking-wider transition uppercase shadow-md"
            >
              Re-engage Fullscreen & Resume
            </button>
          </div>
        </div>
      )}
      {/* 🔼 END OF OPAQUE LOCKDOWN WALL 🔼 */}
    </div>
  );
}

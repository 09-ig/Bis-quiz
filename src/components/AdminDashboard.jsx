import React, { useState, useEffect } from "react";
import { auth } from "../config/firebase";
import {
  assignQuestionsToSubject,
  createCollege,
  createSubject,
  deleteSubject,
  fetchColleges,
  fetchQuestionsForSubject,
  fetchSubjects,
  fetchUnassignedQuestions,
  publishQuestions,
  updateCollege,
  updateSubject,
  DEFAULT_SUBJECT_SETTINGS,
} from "../services/quizData";
import {
  PlusCircle,
  Sliders,
  Database,
  LogOut,
  Terminal,
  Trash2,
  Edit3,
  Check,
  X,
  Send,
  Building2,
  BookOpen,
  Settings2,
  ArrowRightLeft,
} from "lucide-react";

// Converts a stored ISO timestamp into the local "YYYY-MM-DDTHH:mm" value
// expected by <input type="datetime-local">
const isoToLocalInputValue = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function AdminDashboard() {
  // --- Scope: every question, setting and publish below is bound to this pair ---
  const [colleges, setColleges] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [collegeId, setCollegeId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [showManager, setShowManager] = useState(false);

  const [newCollegeName, setNewCollegeName] = useState("");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [renamingCollegeId, setRenamingCollegeId] = useState(null);
  const [renamingSubjectId, setRenamingSubjectId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [copiedCollegeId, setCopiedCollegeId] = useState("");

  const [totalTime, setTotalTime] = useState(
    DEFAULT_SUBJECT_SETTINGS.totalTimeAllowed,
  );
  const [passingScore, setPassingScore] = useState(
    DEFAULT_SUBJECT_SETTINGS.passingThreshold,
  );
  // Entry window is per subject now, not one global settings/config document —
  // three colleges will not sit the same paper in the same hour.
  const [examStartTime, setExamStartTime] = useState("");
  const [examEndTime, setExamEndTime] = useState("");

  // Local sandboxed working memory pool (Draft Mode)
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false); // Defaulting to false so it doesn't force a pre-auth load screen
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [legacyQuestions, setLegacyQuestions] = useState([]);

  const [qText, setQText] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [qType, setQType] = useState("theoretical");
  const [difficulty, setDifficulty] = useState("medium");
  const [blooms, setBlooms] = useState("Understanding");

  // Inline editing state vectors
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    text: "",
    options: ["", "", "", ""],
    correctAnswer: "",
    type: "theoretical",
    difficulty: "medium",
    bloomsLevel: "Understanding",
  });

  const selectedCollege = colleges.find((c) => c.id === collegeId);
  const selectedSubject = subjects.find((s) => s.id === subjectId);

  // Safe Mount Trigger: Only pulls data if an authenticated user is actually present
  useEffect(() => {
    if (auth.currentUser) {
      refreshColleges();
      refreshLegacyQuestions();
    }
  }, []);

  const refreshColleges = async () => {
    try {
      setColleges(await fetchColleges());
    } catch (err) {
      console.error("Failed to load institution registry:", err);
    }
  };

  const refreshSubjects = async (cid) => {
    if (!cid) return setSubjects([]);
    try {
      setSubjects(await fetchSubjects(cid));
    } catch (err) {
      console.error("Failed to load subject registry:", err);
    }
  };

  const refreshLegacyQuestions = async () => {
    try {
      setLegacyQuestions(await fetchUnassignedQuestions());
    } catch (err) {
      console.error("Failed to scan for unassigned questions:", err);
    }
  };

  // The link to hand one college. ?college=<id> pins the institution on the
  // student's side so nobody can sit under the wrong college by mistake.
  const studentLinkFor = (id) => `${window.location.origin}/?college=${id}`;

  const handleCopyLink = async (college) => {
    const link = studentLinkFor(college.id);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedCollegeId(college.id);
      setTimeout(() => setCopiedCollegeId(""), 2000);
    } catch {
      // Clipboard access can be refused (permissions, non-secure origin) —
      // fall back to showing the link so it can still be copied by hand.
      window.prompt(`Copy the link for ${college.name}:`, link);
    }
  };

  const guardUnsaved = () =>
    !hasUnsavedChanges ||
    window.confirm(
      "You have uncommitted changes in this subject's sandbox. Switching scope discards them. Continue?",
    );

  const handleSelectCollege = async (cid) => {
    if (!guardUnsaved()) return;
    setCollegeId(cid);
    setSubjectId("");
    setQuestions([]);
    setHasUnsavedChanges(false);
    await refreshSubjects(cid);
  };

  const handleSelectSubject = async (sid) => {
    if (!guardUnsaved()) return;
    setSubjectId(sid);
    setEditingId(null);
    setHasUnsavedChanges(false);

    if (!sid) {
      setQuestions([]);
      return;
    }

    const subject = subjects.find((s) => s.id === sid);
    setTotalTime(
      subject?.totalTimeAllowed ?? DEFAULT_SUBJECT_SETTINGS.totalTimeAllowed,
    );
    setPassingScore(
      subject?.passingThreshold ?? DEFAULT_SUBJECT_SETTINGS.passingThreshold,
    );
    setExamStartTime(isoToLocalInputValue(subject?.examStartTime));
    setExamEndTime(isoToLocalInputValue(subject?.examEndTime));

    try {
      setLoading(true);
      setQuestions(await fetchQuestionsForSubject(sid));
    } catch (err) {
      console.error("Failed to load question repository:", err);
    } finally {
      setLoading(false);
    }
  };

  // ---------------- College & subject administration ----------------

  const handleCreateCollege = async (e) => {
    e.preventDefault();
    if (!newCollegeName.trim()) return;
    try {
      const id = await createCollege(newCollegeName);
      setNewCollegeName("");
      await refreshColleges();
      await handleSelectCollege(id);
    } catch (err) {
      alert("Could not add institution: " + err.message);
    }
  };

  const handleCreateSubject = async (e) => {
    e.preventDefault();
    if (!newSubjectName.trim() || !collegeId) return;
    try {
      await createSubject(collegeId, newSubjectName);
      setNewSubjectName("");
      await refreshSubjects(collegeId);
    } catch (err) {
      alert("Could not add subject: " + err.message);
    }
  };

  const handleToggleCollege = async (college) => {
    await updateCollege(college.id, { active: college.active === false });
    await refreshColleges();
  };

  const handleToggleSubject = async (subject) => {
    await updateSubject(subject.id, { active: subject.active === false });
    await refreshSubjects(collegeId);
  };

  const handleRenameCollege = async (id) => {
    if (!renameDraft.trim()) return;
    await updateCollege(id, { name: renameDraft.trim() });
    setRenamingCollegeId(null);
    await refreshColleges();
  };

  const handleRenameSubject = async (id) => {
    if (!renameDraft.trim()) return;
    await updateSubject(id, { name: renameDraft.trim() });
    setRenamingSubjectId(null);
    await refreshSubjects(collegeId);
  };

  const handleDeleteSubject = async (subject) => {
    if (
      !window.confirm(
        `Delete "${subject.name}" and every question published under it? Existing student attempts are NOT deleted. This cannot be undone.`,
      )
    )
      return;
    try {
      await deleteSubject(subject.id);
      if (subjectId === subject.id) {
        setSubjectId("");
        setQuestions([]);
        setHasUnsavedChanges(false);
      }
      await refreshSubjects(collegeId);
    } catch (err) {
      alert("Could not delete subject: " + err.message);
    }
  };

  const handleImportLegacyQuestions = async () => {
    if (!subjectId) return;
    if (
      !window.confirm(
        `Move ${legacyQuestions.length} pre-existing question(s) into "${selectedSubject?.name}"? They currently belong to no subject and are invisible to students.`,
      )
    )
      return;
    try {
      await assignQuestionsToSubject(
        legacyQuestions.map((q) => q.id),
        collegeId,
        subjectId,
      );
      await refreshLegacyQuestions();
      setQuestions(await fetchQuestionsForSubject(subjectId));
    } catch (err) {
      alert("Import failed: " + err.message);
    }
  };

  // ---------------- Settings & questions (subject-scoped) ----------------

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (!subjectId) return;

    const startIso = examStartTime ? new Date(examStartTime).toISOString() : "";
    const endIso = examEndTime ? new Date(examEndTime).toISOString() : "";

    if (startIso && endIso && new Date(endIso) <= new Date(startIso)) {
      return alert("Close time must be after the open time.");
    }

    try {
      await updateSubject(subjectId, {
        totalTimeAllowed: parseInt(totalTime),
        passingThreshold: parseInt(passingScore),
        examStartTime: startIso,
        examEndTime: endIso,
      });
      await refreshSubjects(collegeId);
      alert(`Configuration updated for ${selectedSubject?.name}.`);
    } catch (err) {
      alert("Could not save configuration: " + err.message);
    }
  };

  const runLinguisticParser = (text) => {
    const sentences =
      text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length || 1;
    const words = text.split(/\s+/).filter((w) => w.trim().length > 0);
    const totalWords = words.length || 1;

    let syllables = 0;
    let polySyllables = 0;
    const uniqueTokens = new Set();

    words.forEach((word) => {
      const clean = word.toLowerCase().replace(/[^a-z]/g, "");
      uniqueTokens.add(clean);
      let count =
        clean
          .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
          .replace(/^y/, "")
          .match(/[aeiouy]{1,2}/g)?.length || 1;
      syllables += count;
      if (count >= 3) polySyllables++;
    });

    const ease =
      206.835 -
      1.015 * (totalWords / sentences) -
      84.6 * (syllables / totalWords);
    const fog =
      0.4 * (totalWords / sentences + 100 * (polySyllables / totalWords));
    const diversity = uniqueTokens.size / totalWords;
    const trackingComplexity = totalWords / sentences > 12 ? "High" : "Low";

    return {
      fleschEase: Math.max(0, Math.min(100, Math.round(ease * 10) / 10)),
      gunningFogIndex: Math.round(fog * 10) / 10,
      lexicalDiversity: Math.round(diversity * 100) / 100,
      syntacticComplexity: trackingComplexity,
    };
  };

  const handleAddQuestionLocal = (e) => {
    e.preventDefault();
    if (!subjectId) return alert("Select an institution and subject first.");
    if (!qText || !correctAnswer || options.some((o) => !o))
      return alert("Fill out all prompt windows completely.");

    const analytics = runLinguisticParser(qText);
    const localId = "temp_" + Date.now();

    const newQuestion = {
      id: localId,
      text: qText,
      options: [...options],
      correctAnswer,
      type: qType,
      difficulty,
      bloomsLevel: blooms,
      collegeId,
      subjectId,
      ...analytics,
      isNew: true,
    };

    setQuestions([...questions, newQuestion]);
    setHasUnsavedChanges(true);

    setQText("");
    setOptions(["", "", "", ""]);
    setCorrectAnswer("");
  };

  const handleDeleteQuestionLocal = (id) => {
    setQuestions(questions.filter((q) => q.id !== id));
    setHasUnsavedChanges(true);
  };

  const startEditing = (q) => {
    setEditingId(q.id);
    setEditForm({
      text: q.text,
      options: [...q.options],
      correctAnswer: q.correctAnswer,
      type: q.type || "theoretical",
      difficulty: q.difficulty || "medium",
      bloomsLevel: q.bloomsLevel || "Understanding",
    });
  };

  const handleSaveEditLocal = (id) => {
    if (
      !editForm.text ||
      !editForm.correctAnswer ||
      editForm.options.some((o) => !o)
    ) {
      return alert("Parameters cannot be empty.");
    }

    const updatedAnalytics = runLinguisticParser(editForm.text);

    setQuestions(
      questions.map((q) =>
        q.id === id
          ? { ...q, ...editForm, ...updatedAnalytics, isEdited: true }
          : q,
      ),
    );
    setEditingId(null);
    setHasUnsavedChanges(true);
  };

  const handlePublishTestLive = async () => {
    if (!subjectId) return alert("Select an institution and subject first.");
    if (
      !window.confirm(
        `Commit all changes to "${selectedCollege?.name} — ${selectedSubject?.name}"? This overwrites the live paper for THIS subject only.`,
      )
    )
      return;

    setLoading(true);
    try {
      await publishQuestions(collegeId, subjectId, questions);
      setHasUnsavedChanges(false);
      alert("Test configuration synchronized live successfully!");
      setQuestions(await fetchQuestionsForSubject(subjectId));
    } catch (err) {
      alert("Batch deployment failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const scopeReady = Boolean(collegeId && subjectId);

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-700">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* DRAFT STATE RUNTIME FLOATER HEADER NOTICE */}
        {hasUnsavedChanges && (
          <div className="bg-amber-500 text-white font-bold p-3 rounded-xl shadow-md text-xs flex justify-between items-center">
            <span>
              ⚠️ WARNING: You have uncommitted changes to{" "}
              {selectedSubject?.name}. Students will not see updates until you
              push changes live.
            </span>
            <button
              onClick={handlePublishTestLive}
              className="bg-white text-slate-900 px-4 py-1.5 rounded-lg hover:bg-slate-100 flex items-center gap-1 transition uppercase tracking-wider text-[11px]"
            >
              <Send className="w-3.5 h-3.5 text-blue-600" /> Publish Test Live
            </button>
          </div>
        )}

        {/* HEADER PANEL */}
        <div className="flex items-center justify-between bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
          <div className="flex items-center gap-3">
            <Terminal className="w-5 h-5 text-blue-600" />
            <h2 className="text-sm font-bold tracking-wider text-slate-800 uppercase">
              Assessment Blueprint Matrix (Admin Sandbox)
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePublishTestLive}
              disabled={loading || !scopeReady}
              className="flex items-center gap-2 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg transition font-bold uppercase tracking-wider shadow-sm"
            >
              <Send className="w-3.5 h-3.5" /> Commit All Changes Done
            </button>
            <button
              onClick={() => auth.signOut()}
              className="flex items-center gap-2 text-xs border border-slate-200 hover:border-rose-300 px-3 py-2 rounded-lg transition bg-white text-slate-600 hover:text-rose-600 shadow-sm"
            >
              <LogOut className="w-3.5 h-3.5" /> Disconnect
            </button>
          </div>
        </div>

        {/* SCOPE SELECTOR — everything below operates on this college + subject */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-wider">
              <Building2 className="w-4 h-4 text-blue-600" /> Active Scope
            </div>
            <button
              onClick={() => setShowManager(!showManager)}
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider border border-slate-200 hover:border-blue-300 hover:text-blue-600 px-3 py-1.5 rounded-lg transition text-slate-500"
            >
              <Settings2 className="w-3.5 h-3.5" />
              {showManager ? "Hide" : "Manage"} Colleges & Subjects
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Institution
              </label>
              <select
                value={collegeId}
                onChange={(e) => handleSelectCollege(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-500 text-slate-800"
              >
                <option value="">Select institution...</option>
                {colleges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.active === false ? " (hidden from students)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Subject
              </label>
              <select
                value={subjectId}
                disabled={!collegeId}
                onChange={(e) => handleSelectSubject(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-500 text-slate-800 disabled:opacity-50"
              >
                <option value="">
                  {collegeId
                    ? "Select subject..."
                    : "Select an institution first"}
                </option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.active === false ? " (hidden from students)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {colleges.length === 0 && !showManager && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 font-semibold">
              No institutions exist yet. Open “Manage Colleges & Subjects” to
              add your first one.
            </p>
          )}

          {/* MANAGER PANEL */}
          {showManager && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-3 border-t border-slate-100">
              {/* Colleges */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />{" "}
                  Institutions ({colleges.length})
                </div>
                <form onSubmit={handleCreateCollege} className="flex gap-2">
                  <input
                    type="text"
                    value={newCollegeName}
                    onChange={(e) => setNewCollegeName(e.target.value)}
                    placeholder="New college name"
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-500"
                  />
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider transition"
                  >
                    Add
                  </button>
                </form>
                <div className="space-y-1.5">
                  {colleges.map((c) => (
                    <div
                      key={c.id}
                      className={`flex items-center gap-2 border rounded-lg p-2 text-[11px] ${c.id === collegeId ? "border-blue-300 bg-blue-50/40" : "border-slate-200 bg-white"}`}
                    >
                      {renamingCollegeId === c.id ? (
                        <>
                          <input
                            autoFocus
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            className="flex-1 border border-slate-300 rounded p-1 text-[11px] outline-none"
                          />
                          <button
                            onClick={() => handleRenameCollege(c.id)}
                            className="p-1 text-emerald-600"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setRenamingCollegeId(null)}
                            className="p-1 text-slate-400"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleSelectCollege(c.id)}
                            className="flex-1 text-left font-semibold text-slate-700 truncate"
                          >
                            {c.name}
                          </button>
                          <button
                            onClick={() => handleToggleCollege(c)}
                            title={
                              c.active === false
                                ? "Hidden from students — click to publish"
                                : "Visible to students — click to hide"
                            }
                            className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${c.active === false ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}
                          >
                            {c.active === false ? "Hidden" : "Live"}
                          </button>
                          <button
                            onClick={() => handleCopyLink(c)}
                            title={`Copy the student link for ${c.name}`}
                            className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border transition ${copiedCollegeId === c.id ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-white text-slate-500 border-slate-200 hover:text-blue-600 hover:border-blue-300"}`}
                          >
                            {copiedCollegeId === c.id ? "Copied" : "Link"}
                          </button>
                          <button
                            onClick={() => {
                              setRenamingCollegeId(c.id);
                              setRenameDraft(c.name);
                            }}
                            className="p-1 text-slate-400 hover:text-blue-600"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Subjects */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <BookOpen className="w-3.5 h-3.5 text-blue-600" /> Subjects
                  {selectedCollege ? ` — ${selectedCollege.name}` : ""}
                </div>
                {!collegeId ? (
                  <p className="text-[11px] text-slate-400 italic p-2">
                    Select an institution to manage its subjects.
                  </p>
                ) : (
                  <>
                    <form onSubmit={handleCreateSubject} className="flex gap-2">
                      <input
                        type="text"
                        value={newSubjectName}
                        onChange={(e) => setNewSubjectName(e.target.value)}
                        placeholder="New subject name"
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-500"
                      />
                      <button
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider transition"
                      >
                        Add
                      </button>
                    </form>
                    <div className="space-y-1.5">
                      {subjects.map((s) => (
                        <div
                          key={s.id}
                          className={`flex items-center gap-2 border rounded-lg p-2 text-[11px] ${s.id === subjectId ? "border-blue-300 bg-blue-50/40" : "border-slate-200 bg-white"}`}
                        >
                          {renamingSubjectId === s.id ? (
                            <>
                              <input
                                autoFocus
                                value={renameDraft}
                                onChange={(e) => setRenameDraft(e.target.value)}
                                className="flex-1 border border-slate-300 rounded p-1 text-[11px] outline-none"
                              />
                              <button
                                onClick={() => handleRenameSubject(s.id)}
                                className="p-1 text-emerald-600"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setRenamingSubjectId(null)}
                                className="p-1 text-slate-400"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleSelectSubject(s.id)}
                                className="flex-1 text-left font-semibold text-slate-700 truncate"
                              >
                                {s.name}
                                <span className="ml-2 font-normal text-slate-400">
                                  {s.totalTimeAllowed ??
                                    DEFAULT_SUBJECT_SETTINGS.totalTimeAllowed}
                                  m
                                </span>
                              </button>
                              <button
                                onClick={() => handleToggleSubject(s)}
                                title={
                                  s.active === false
                                    ? "Hidden from students — click to publish"
                                    : "Visible to students — click to hide"
                                }
                                className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${s.active === false ? "bg-slate-100 text-slate-400 border-slate-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}
                              >
                                {s.active === false ? "Hidden" : "Live"}
                              </button>
                              <button
                                onClick={() => {
                                  setRenamingSubjectId(s.id);
                                  setRenameDraft(s.name);
                                }}
                                className="p-1 text-slate-400 hover:text-blue-600"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteSubject(s)}
                                className="p-1 text-slate-400 hover:text-rose-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                      {subjects.length === 0 && (
                        <p className="text-[11px] text-slate-400 italic p-2">
                          No subjects yet for this institution.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* LEGACY MIGRATION BANNER — questions written before subjects existed */}
        {legacyQuestions.length > 0 && (
          <div className="bg-sky-50 border border-sky-200 text-sky-900 p-3 rounded-xl text-[11px] flex justify-between items-center gap-4">
            <span className="font-semibold">
              {legacyQuestions.length} question(s) from the original single-college
              quiz have no subject assigned, so no student can see them.
              {scopeReady
                ? ` Move them into "${selectedSubject?.name}"?`
                : " Select a college and subject above to file them."}
            </span>
            <button
              onClick={handleImportLegacyQuestions}
              disabled={!scopeReady}
              className="shrink-0 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition uppercase tracking-wider text-[10px] font-bold"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" /> Move Into Subject
            </button>
          </div>
        )}

        {!scopeReady ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center shadow-sm">
            <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Select an institution and subject to edit its paper
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Timing, threshold and questions are stored per subject, per
              college.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* LEFT COLUMN: EXAM PARAMETERS */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm h-fit">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-slate-800 font-bold text-xs uppercase tracking-wider">
                  <Sliders className="w-4 h-4 text-blue-600" /> Exam Parameters
                </div>
                <div className="text-[10px] text-slate-400 font-semibold -mt-1">
                  {selectedCollege?.name} › {selectedSubject?.name}
                </div>
                <form onSubmit={handleSaveSettings} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Allowed Duration (Min)
                    </label>
                    <input
                      type="number"
                      value={totalTime}
                      onChange={(e) => setTotalTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-500 text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Passing Threshold Score (%)
                    </label>
                    <input
                      type="number"
                      value={passingScore}
                      onChange={(e) => setPassingScore(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-500 text-slate-800"
                    />
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Quiz Opens At
                    </label>
                    <input
                      type="datetime-local"
                      value={examStartTime}
                      onChange={(e) => setExamStartTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-500 text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Quiz Closes At
                    </label>
                    <input
                      type="datetime-local"
                      value={examEndTime}
                      onChange={(e) => setExamEndTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-500 text-slate-800"
                    />
                    <p className="text-[9px] text-slate-400 mt-1 leading-relaxed">
                      Students can only enter THIS subject between these two
                      times. Leave both blank to allow access at any time.
                    </p>
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold py-2 rounded-lg transition uppercase tracking-wider shadow-sm"
                  >
                    Commit Exam Configurations
                  </button>
                </form>
              </div>

              {/* RIGHT COLUMN: QUESTION COMPILER */}
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-slate-800 font-bold text-xs uppercase tracking-wider">
                  <PlusCircle className="w-4 h-4 text-blue-600" /> Build
                  Assessment Question (Draft Sandbox)
                </div>
                <form
                  onSubmit={handleAddQuestionLocal}
                  className="space-y-3 text-xs"
                >
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Question Body Text
                    </label>
                    <textarea
                      rows="2"
                      value={qText}
                      onChange={(e) => setQText(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-500 text-slate-800"
                      placeholder="Type structural question stem context..."
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {options.map((opt, idx) => (
                      <div key={idx}>
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Option Variable Token [{idx + 1}]
                        </label>
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const next = [...options];
                            next[idx] = e.target.value;
                            setOptions(next);
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-500 text-slate-800"
                          placeholder={`Enter structural answer alternative ${idx + 1}`}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Correct Identity
                      </label>
                      <select
                        value={correctAnswer}
                        onChange={(e) => setCorrectAnswer(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-500 text-slate-700"
                      >
                        <option value="">SELECT...</option>
                        {options.map(
                          (o, i) =>
                            o && (
                              <option key={i} value={o}>
                                Variant {i + 1}
                              </option>
                            ),
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Evaluation Class
                      </label>
                      <select
                        value={qType}
                        onChange={(e) => setQType(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-500 text-slate-700"
                      >
                        <option value="theoretical">Theoretical</option>
                        <option value="numerical">Numerical</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Target Difficulty
                      </label>
                      <select
                        value={difficulty}
                        onChange={(e) => setDifficulty(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-500 text-slate-700"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Bloom's Level
                      </label>
                      <select
                        value={blooms}
                        onChange={(e) => setBlooms(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-500 text-slate-700"
                      >
                        <option value="Remembering">Remembering</option>
                        <option value="Understanding">Understanding</option>
                        <option value="Applying">Applying</option>
                        <option value="Analyzing">Analyzing</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold py-2.5 rounded-lg transition uppercase tracking-wider shadow-sm"
                  >
                    Queue Item Into Sandbox Matrix
                  </button>
                </form>
              </div>
            </div>

            {/* WORKSPACE DISPLAY ROW */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-wider">
                  <Database className="w-4 h-4 text-blue-600" />{" "}
                  {selectedSubject?.name} Paper ({questions.length} Items)
                </div>
                {hasUnsavedChanges && (
                  <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full font-bold">
                    Unsaved Work Active
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[11px] font-medium text-slate-600">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-bold">
                      <th className="p-2.5">QUESTION CONTENT STEM</th>
                      <th className="p-2.5">TYPE</th>
                      <th className="p-2.5">BLOOM'S CLASS</th>
                      <th className="p-2.5">FLESCH READ</th>
                      <th className="p-2.5">GUNNING FOG</th>
                      <th className="p-2.5">LEXICAL DIVERSITY</th>
                      <th className="p-2.5">SYNTACTIC FORM</th>
                      <th className="p-2.5 text-right">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {questions.map((q) => {
                      const isEditing = editingId === q.id;
                      return (
                        <tr
                          key={q.id}
                          className={`hover:bg-slate-50 transition ${isEditing ? "bg-blue-50/40" : ""} ${q.isNew ? "bg-emerald-50/30" : ""}`}
                        >
                          <td className="p-2.5 max-w-xs text-slate-800 font-medium">
                            {isEditing ? (
                              <div className="space-y-2">
                                <textarea
                                  rows="2"
                                  value={editForm.text}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      text: e.target.value,
                                    })
                                  }
                                  className="w-full p-1.5 bg-white border border-slate-300 rounded text-xs outline-none"
                                />
                                <div className="grid grid-cols-2 gap-2">
                                  {editForm.options.map((opt, oIdx) => (
                                    <input
                                      key={oIdx}
                                      type="text"
                                      value={opt}
                                      onChange={(e) => {
                                        const nextOpts = [...editForm.options];
                                        nextOpts[oIdx] = e.target.value;
                                        setEditForm({
                                          ...editForm,
                                          options: nextOpts,
                                        });
                                      }}
                                      placeholder={`Option ${oIdx + 1}`}
                                      className="p-1 bg-white border border-slate-200 rounded text-[10px]"
                                    />
                                  ))}
                                </div>
                                <div className="flex gap-2">
                                  <select
                                    value={editForm.correctAnswer}
                                    onChange={(e) =>
                                      setEditForm({
                                        ...editForm,
                                        correctAnswer: e.target.value,
                                      })
                                    }
                                    className="p-1 bg-white border border-slate-200 rounded text-[10px]"
                                  >
                                    <option value="">
                                      Select Target Key Match...
                                    </option>
                                    {editForm.options.map(
                                      (o, i) =>
                                        o && (
                                          <option key={i} value={o}>
                                            Variant {i + 1}: {o}
                                          </option>
                                        ),
                                    )}
                                  </select>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <p className="line-clamp-2">{q.text}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[9px] text-slate-400 truncate font-mono">
                                    Key Target: {q.correctAnswer}
                                  </span>
                                  {q.isNew && (
                                    <span className="text-[8px] bg-emerald-100 text-emerald-700 px-1.5 py-0.2 rounded font-bold uppercase">
                                      Queued
                                    </span>
                                  )}
                                  {q.isEdited && (
                                    <span className="text-[8px] bg-amber-100 text-amber-700 px-1.5 py-0.2 rounded font-bold uppercase">
                                      Modified
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="p-2.5 uppercase text-xs text-slate-500">
                            {isEditing ? (
                              <select
                                value={editForm.type}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    type: e.target.value,
                                  })
                                }
                                className="p-1 bg-white border border-slate-200 rounded text-[10px]"
                              >
                                <option value="theoretical">Theoretical</option>
                                <option value="numerical">Numerical</option>
                              </select>
                            ) : (
                              q.type
                            )}
                          </td>
                          <td className="p-2.5 font-semibold text-blue-600">
                            {isEditing ? (
                              <select
                                value={editForm.bloomsLevel}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    bloomsLevel: e.target.value,
                                  })
                                }
                                className="p-1 bg-white border border-slate-200 rounded text-[10px]"
                              >
                                <option value="Remembering">Remembering</option>
                                <option value="Understanding">
                                  Understanding
                                </option>
                                <option value="Applying">Applying</option>
                                <option value="Analyzing">Analyzing</option>
                              </select>
                            ) : (
                              q.bloomsLevel
                            )}
                          </td>
                          <td className="p-2.5 font-semibold text-emerald-600">
                            {isEditing ? "Recalc" : q.fleschEase}
                          </td>
                          <td className="p-2.5 font-semibold text-amber-600">
                            {" "}
                            {isEditing ? "Recalc" : q.gunningFogIndex}
                          </td>
                          <td className="p-2.5 text-purple-600">
                            {" "}
                            {isEditing ? "Recalc" : q.lexicalDiversity}
                          </td>
                          <td className="p-2.5 uppercase text-slate-400 text-[10px]">
                            {isEditing ? "Recalc" : q.syntacticComplexity}
                          </td>
                          <td className="p-2.5 text-right">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleSaveEditLocal(q.id)}
                                  className="p-1 border border-emerald-200 bg-emerald-50 text-emerald-600 rounded"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="p-1 border border-slate-200 bg-slate-50 text-slate-500 rounded"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => startEditing(q)}
                                  className="p-1 border border-slate-200 bg-white text-slate-500 rounded hover:text-blue-600"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteQuestionLocal(q.id)}
                                  className="p-1 border border-rose-100 bg-white text-slate-400 rounded hover:text-rose-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {questions.length === 0 && !loading && (
                      <tr>
                        <td
                          colSpan="8"
                          className="p-6 text-center text-slate-400 italic text-[11px]"
                        >
                          No questions in this subject yet. Build one above.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

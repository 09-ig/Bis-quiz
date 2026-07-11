import React, { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  getDoc,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "../config/firebase";
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
  const [totalTime, setTotalTime] = useState(30);
  const [passingScore, setPassingScore] = useState(40);
  const [examStartTime, setExamStartTime] = useState("");
  const [examEndTime, setExamEndTime] = useState("");

  // Local sandboxed working memory pool (Draft Mode)
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false); // Defaulting to false so it doesn't force a pre-auth load screen
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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

  // Safe Mount Trigger: Only pulls data if an authenticated user is actually present
  useEffect(() => {
    if (auth.currentUser) {
      loadSettings();
      loadQuestions();
    }
  }, []);

  const loadSettings = async () => {
    try {
      const docSnap = await getDoc(doc(db, "settings", "config"));
      if (docSnap.exists()) {
        const data = docSnap.data();
        setTotalTime(data.totalTimeAllowed || 30);
        setPassingScore(data.passingThreshold || 40);
        setExamStartTime(isoToLocalInputValue(data.examStartTime));
        setExamEndTime(isoToLocalInputValue(data.examEndTime));
      }
    } catch (err) {
      console.error("Error reading configuration settings:", err);
    }
  };

  const loadQuestions = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, "questions"));
      setQuestions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Failed to load question repository:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();

    const startIso = examStartTime ? new Date(examStartTime).toISOString() : "";
    const endIso = examEndTime ? new Date(examEndTime).toISOString() : "";

    if (startIso && endIso && new Date(endIso) <= new Date(startIso)) {
      return alert("Close time must be after the open time.");
    }

    await setDoc(doc(db, "settings", "config"), {
      totalTimeAllowed: parseInt(totalTime),
      passingThreshold: parseInt(passingScore),
      examStartTime: startIso,
      examEndTime: endIso,
    });
    alert("Global configurations updated.");
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
    if (
      !window.confirm(
        "Are you ready to commit all changes? This will instantly overwrite the student matrix blueprint.",
      )
    )
      return;

    setLoading(true);
    try {
      const currentSnap = await getDocs(collection(db, "questions"));
      const currentCloudIds = currentSnap.docs.map((doc) => doc.id);

      const localIds = questions.map((q) => q.id);
      const idsToDelete = currentCloudIds.filter(
        (id) => !localIds.includes(id),
      );

      const batch = writeBatch(db);

      for (const id of idsToDelete) {
        batch.delete(doc(db, "questions", id));
      }

      questions.forEach((q) => {
        const cleanPayload = { ...q };
        delete cleanPayload.id;
        delete cleanPayload.isNew;
        delete cleanPayload.isEdited;

        if (q.id.toString().startsWith("temp_")) {
          const newDocRef = doc(collection(db, "questions"));
          batch.set(newDocRef, cleanPayload);
        } else {
          batch.set(doc(db, "questions", q.id), cleanPayload);
        }
      });

      await batch.commit();

      setHasUnsavedChanges(false);
      alert("Test configuration synchronized live successfully!");
      loadQuestions();
    } catch (err) {
      alert("Batch deployment failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-700">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* DRAFT STATE RUNTIME FLOATER HEADER NOTICE */}
        {hasUnsavedChanges && (
          <div className="bg-amber-500 text-white font-bold p-3 rounded-xl shadow-md text-xs flex justify-between items-center">
            <span>
              ⚠️ WARNING: You have uncommitted blueprint modifications. Students
              will not see updates until you push changes live.
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
              disabled={loading}
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT COLUMN: EXAM PARAMETERS */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm h-fit">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-slate-800 font-bold text-xs uppercase tracking-wider">
              <Sliders className="w-4 h-4 text-blue-600" /> Exam Parameters
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
                  Students can only enter the exam between these two times.
                  Leave both blank to allow access at any time.
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
              <PlusCircle className="w-4 h-4 text-blue-600" /> Build Assessment
              Question (Draft Sandbox)
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
              <Database className="w-4 h-4 text-blue-600" /> Sandboxed Working
              Workspace ({questions.length} Items)
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
                              setEditForm({ ...editForm, type: e.target.value })
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
                            <option value="Understanding">Understanding</option>
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
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

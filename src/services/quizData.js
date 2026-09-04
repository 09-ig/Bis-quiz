import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../config/firebase";

// Single choke point for every Firestore read/write in the app. When the AWS
// migration resumes, this is the only file that has to be rewritten against the
// Express/DynamoDB API — the components stay untouched.

export const COLLEGES = "colleges";
export const SUBJECTS = "subjects";
export const QUESTIONS = "questions";
export const ATTEMPTS = "quiz_attempts";

export const DEFAULT_SUBJECT_SETTINGS = {
  totalTimeAllowed: 30,
  passingThreshold: 40,
  // Entry window, carried over from the single-college build but now stored per
  // subject rather than on settings/config — three colleges will not sit the
  // same paper at the same hour. Empty string on either side = unbounded.
  examStartTime: "",
  examEndTime: "",
};

// One attempt per (student, subject) is enforced structurally: the attempt
// document id IS the pair, so a second submission cannot create a second row.
export const attemptIdFor = (uid, subjectId) => `${uid}__${subjectId}`;

// Shared by the student gate and the admin panel so both read the window the
// same way. Returns "open" | "not_started" | "closed".
export function subjectWindowStatus(subject, now = Date.now()) {
  if (!subject) return "open";
  const start = subject.examStartTime
    ? new Date(subject.examStartTime).getTime()
    : null;
  const end = subject.examEndTime
    ? new Date(subject.examEndTime).getTime()
    : null;
  if (start && !isNaN(start) && now < start) return "not_started";
  if (end && !isNaN(end) && now >= end) return "closed";
  return "open";
}

const byName = (a, b) => (a.name || "").localeCompare(b.name || "");

// Filtered queries are sorted client-side on purpose — an orderBy alongside the
// where clause would demand a composite index for what are ~3-row collections.

export async function fetchColleges({ activeOnly = false } = {}) {
  const snap = await getDocs(collection(db, COLLEGES));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => !activeOnly || c.active !== false)
    .sort(byName);
}

export async function createCollege(name) {
  const ref = doc(collection(db, COLLEGES));
  await setDoc(ref, {
    name: name.trim(),
    active: true,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateCollege(collegeId, patch) {
  await updateDoc(doc(db, COLLEGES, collegeId), patch);
}

export async function fetchSubjects(collegeId, { activeOnly = false } = {}) {
  if (!collegeId) return [];
  const snap = await getDocs(
    query(collection(db, SUBJECTS), where("collegeId", "==", collegeId)),
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => !activeOnly || s.active !== false)
    .sort(byName);
}

export async function createSubject(collegeId, name) {
  const ref = doc(collection(db, SUBJECTS));
  await setDoc(ref, {
    collegeId,
    name: name.trim(),
    active: true,
    ...DEFAULT_SUBJECT_SETTINGS,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateSubject(subjectId, patch) {
  await updateDoc(doc(db, SUBJECTS, subjectId), patch);
}

export async function fetchSubject(subjectId) {
  const snap = await getDoc(doc(db, SUBJECTS, subjectId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function fetchQuestionsForSubject(subjectId) {
  if (!subjectId) return [];
  const snap = await getDocs(
    query(collection(db, QUESTIONS), where("subjectId", "==", subjectId)),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Questions written before subjects existed carry no subjectId. Firestore can't
// query for a missing field, so this scans the collection — fine at this size,
// and it only runs when the admin opens the migration banner.
export async function fetchUnassignedQuestions() {
  const snap = await getDocs(collection(db, QUESTIONS));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((q) => !q.subjectId);
}

export async function assignQuestionsToSubject(
  questionIds,
  collegeId,
  subjectId,
) {
  const batch = writeBatch(db);
  questionIds.forEach((id) =>
    batch.update(doc(db, QUESTIONS, id), { collegeId, subjectId }),
  );
  await batch.commit();
}

// Replaces the live question set for ONE subject. The delete pass is scoped by
// subjectId so publishing Physics can never wipe Chemistry.
export async function publishQuestions(collegeId, subjectId, localQuestions) {
  const existing = await getDocs(
    query(collection(db, QUESTIONS), where("subjectId", "==", subjectId)),
  );
  const localIds = new Set(localQuestions.map((q) => String(q.id)));

  const batch = writeBatch(db);

  existing.docs.forEach((d) => {
    if (!localIds.has(d.id)) batch.delete(d.ref);
  });

  localQuestions.forEach((q) => {
    const payload = { ...q, collegeId, subjectId };
    delete payload.id;
    delete payload.isNew;
    delete payload.isEdited;

    const ref = String(q.id).startsWith("temp_")
      ? doc(collection(db, QUESTIONS))
      : doc(db, QUESTIONS, q.id);
    batch.set(ref, payload);
  });

  await batch.commit();
}

export async function deleteSubject(subjectId) {
  const questions = await fetchQuestionsForSubject(subjectId);
  const batch = writeBatch(db);
  questions.forEach((q) => batch.delete(doc(db, QUESTIONS, q.id)));
  batch.delete(doc(db, SUBJECTS, subjectId));
  await batch.commit();
}

export async function hasAttempted(uid, subjectId) {
  const snap = await getDoc(doc(db, ATTEMPTS, attemptIdFor(uid, subjectId)));
  return snap.exists();
}

// Returns the subjectIds this student has already sat, so the picker can grey
// them out instead of failing only at "Start Test".
export async function fetchAttemptedSubjectIds(uid) {
  const snap = await getDocs(
    query(collection(db, ATTEMPTS), where("studentUid", "==", uid)),
  );
  return new Set(snap.docs.map((d) => d.data().subjectId).filter(Boolean));
}

export async function saveAttempt(payload) {
  await setDoc(
    doc(db, ATTEMPTS, attemptIdFor(payload.studentUid, payload.subjectId)),
    payload,
  );
}

import React, { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./config/firebase";
import AuthPortal from "./components/AuthPortal";
import AdminDashboard from "./components/AdminDashboard";
import StudentDashboard from "./components/StudentDashboard";
import { ShieldAlert } from "lucide-react";

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (currentUser) {
        setUser(currentUser);
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
            setRole(userDoc.data().role);
          } else {
            setRole("student"); // Graceful fallback
          }
        } catch (error) {
          console.error("Profile Connection Error:", error);
          setRole("student");
        }
      } else {
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading || (user && role === null)) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans text-slate-700 gap-3">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
        <div className="text-xs font-semibold tracking-wider text-slate-500 animate-pulse"></div>
      </div>
    );
  }

  if (!user) return <AuthPortal />;
  if (role === "admin") return <AdminDashboard />;
  if (role === "student") return <StudentDashboard user={user} />;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-lg font-bold text-slate-800 tracking-wide uppercase">
        Routing Failure
      </h1>
      <p className="text-slate-500 text-xs mt-1">
        Your profile context could not be parsed. Contact administration.
      </p>
    </div>
  );
}

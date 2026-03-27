"use client";

import { useState, useEffect } from "react";
import { X, RefreshCw, Activity, ChevronRight } from "lucide-react";

const API_URL = "http://localhost:5000";

export default function ReplaceExerciseModal({ isOpen, onClose, workoutId, exerciseIndex, onReplaced }: any) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [replacingWith, setReplacingWith] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && workoutId && exerciseIndex !== null) {
      setLoading(true);
      fetch(`${API_URL}/workouts/${workoutId}/alternatives/${exerciseIndex}`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(d => {
          if (d.success) setData(d);
          else setError(d.error || "Failed to load alternatives");
        })
        .catch(err => {
          console.error("ReplaceExerciseModal fetch error:", err);
          setError("Network error: " + err.message);
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, workoutId, exerciseIndex]);

  const handleReplace = async (newExerciseId: string) => {
    setReplacingWith(newExerciseId);
    try {
      const res = await fetch(`${API_URL}/workouts/${workoutId}/replace/${exerciseIndex}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newExerciseId })
      });
      const json = await res.json();
      if (json.success) {
        onReplaced();
        onClose();
      } else {
        alert(json.error || "Failed to replace");
      }
    } catch (e) {
      alert("Network error");
    } finally {
      setReplacingWith(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-violet-400" />
            <h2 className="text-lg font-bold text-white">Replacing Exercise</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto hidden-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-violet-500/30 border-t-violet-500 rounded-full animate-spin mb-4" />
              <p className="text-slate-400 animate-pulse">Running Ranking Engine...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
              {error}
            </div>
          ) : data ? (
            <div className="space-y-4">
              <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">Original Exercise</p>
                <p className="text-white font-medium">{data.targetExercise.name}</p>
                <div className="mt-2 flex gap-2">
                  <span className="text-[10px] px-2 py-0.5 bg-slate-700 text-slate-300 rounded-full">
                    {data.targetExercise.primary_muscle}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 bg-slate-700 text-slate-300 rounded-full">
                    {data.targetExercise.movement_pattern}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  AI Suggested Alternatives
                </p>
                <div className="space-y-2">
                  {data.alternatives.map((alt: any) => (
                    <button
                      key={alt._id}
                      onClick={() => handleReplace(alt._id)}
                      disabled={replacingWith === alt._id}
                      className="w-full text-left p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800 border border-slate-700/50 hover:border-violet-500/50 transition-all group flex items-center justify-between"
                    >
                      <div>
                        <p className="text-white font-medium group-hover:text-violet-300 transition-colors">{alt.name}</p>
                        <p className="text-xs text-slate-400 mt-1 capitalize">{alt.equipment} • {alt.difficulty}</p>
                      </div>
                      {replacingWith === alt._id ? (
                        <div className="w-4 h-4 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-violet-400 transition-colors" />
                      )}
                    </button>
                  ))}
                  {data.alternatives.length === 0 && (
                    <p className="text-sm text-slate-400 italic py-4 text-center">No precise alternatives found.</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

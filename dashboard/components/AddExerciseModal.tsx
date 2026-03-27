"use client";

import { useState, useEffect } from "react";
import { X, Search, Plus, Filter } from "lucide-react";

const API_URL = "http://localhost:5000";

export default function AddExerciseModal({ isOpen, onClose, workoutId, onAdded }: any) {
  const [exercises, setExercises] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetch(`${API_URL}/exercises?limit=300`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(d => {
          console.log("AddExerciseModal loaded:", d.count);
          if (Array.isArray(d)) setExercises(d);
          else if (d.data) setExercises(d.data);
          else setExercises([]);
        })
        .catch(err => {
          console.error("AddExerciseModal fetch error:", err);
          alert("Failed to load exercise database: " + err.message);
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  const handleAdd = async (exerciseId: string) => {
    setAddingId(exerciseId);
    try {
      const res = await fetch(`${API_URL}/workouts/${workoutId}/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exerciseId, sets: 3, reps: "8-12", rpe: 7 })
      });
      const json = await res.json();
      if (json.success) {
        onAdded();
        onClose();
        setSearch("");
      } else {
        alert(json.error || "Failed to add exercise");
      }
    } catch (e: any) {
      console.error("AddExerciseModal add error:", e);
      alert("Network error: " + e.message);
    } finally {
      setAddingId(null);
    }
  };

  if (!isOpen) return null;

  const filtered = exercises.filter((e: any) => {
    const nameMatch = e.name?.toLowerCase().includes(search.toLowerCase()) ?? false;
    const muscleMatch = e.primary_muscle?.toLowerCase().includes(search.toLowerCase()) ?? false;
    return nameMatch || muscleMatch;
  }).slice(0, 50);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-white">Add Custom Exercise</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 border-b border-slate-800 bg-slate-900 sticky top-0 z-10">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search by name or muscle (e.g. bicep curl)" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
        </div>

        <div className="p-4 overflow-y-auto hidden-scrollbar flex-1 min-h-[300px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 h-full">
              <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-4" />
              <p className="text-slate-400 animate-pulse">Loading database...</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((ex: any) => (
                <div key={ex._id} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:border-slate-600 transition-colors">
                  <div>
                    <p className="text-white font-medium">{ex.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-2 py-0.5 bg-slate-700/50 text-slate-300 rounded-full border border-slate-600/50">
                        {ex.primary_muscle}
                      </span>
                      <span className="text-[10px] text-slate-500 capitalize">{ex.equipment}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleAdd(ex._id)}
                    disabled={addingId === ex._id}
                    className="p-2 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-lg transition-all disabled:opacity-50 min-w-[40px] flex justify-center"
                  >
                    {addingId === ex._id ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
              {filtered.length === 0 && search && (
                <div className="text-center py-12 space-y-3">
                  <Filter className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-slate-400">No exercises found matching "{search}"</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

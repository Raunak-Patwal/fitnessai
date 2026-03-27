"use client";

import { useState, useEffect } from "react";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    Legend
} from "recharts";
import { Search, TrendingUp, Activity, BarChart3 } from "lucide-react";

const API_URL = "http://localhost:5000";

export default function ExerciseProgressChart({ userId }: { userId: string }) {
    const [exercises, setExercises] = useState<any[]>([]);
    const [search, setSearch] = useState("");
    const [selectedExercise, setSelectedExercise] = useState<any | null>(null);
    const [chartData, setChartData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    useEffect(() => {
        fetch(`${API_URL}/exercises?limit=300`)
            .then((res) => res.json())
            .then((data) => {
                if (Array.isArray(data)) setExercises(data);
                else if (data.data) setExercises(data.data);
            })
            .catch((fetchError) => console.error("Failed to fetch exercises for progress chart", fetchError));
    }, []);

    useEffect(() => {
        if (!userId || !selectedExercise) return;

        setLoading(true);
        setError(null);

        fetch(`${API_URL}/analytics/strength/${userId}/${selectedExercise._id}?weeks=24`)
            .then((res) => res.json())
            .then((data) => {
                if (data.success) {
                    const formatted = data.data.map((item: any) => {
                        const dateObj = new Date(item.date);
                        return {
                            ...item,
                            dateStr: `${dateObj.getMonth() + 1}/${dateObj.getDate()}`
                        };
                    });
                    setChartData(formatted);
                } else {
                    setError(data.error || "Failed to load data");
                    setChartData([]);
                }
            })
            .catch(() => {
                setError("Network error loading chart");
                setChartData([]);
            })
            .finally(() => setLoading(false));
    }, [userId, selectedExercise]);

    const filteredExercises = exercises.filter((exercise) =>
        exercise.name?.toLowerCase().includes(search.toLowerCase()) ||
        exercise.primary_muscle?.toLowerCase().includes(search.toLowerCase())
    ).slice(0, 50);

    const latestPoint = chartData.length > 0 ? chartData[chartData.length - 1] : null;
    const currentMax = chartData.length > 0 ? Math.max(...chartData.map((item) => item.estimated1RM || 0)) : 0;

    return (
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-6 lg:col-span-2">
            <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                    <h3 className="flex items-center gap-2 font-semibold text-white">
                        <TrendingUp className="h-5 w-5 text-emerald-400" />
                        Exercise Progression History
                    </h3>
                    <p className="mt-1 text-sm text-slate-400">Track estimated 1RM, peak load, total volume, and average RPE for a single lift.</p>
                </div>

                <div className="relative z-20 w-full md:w-72">
                    <div
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 p-2.5"
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    >
                        <Search className="ml-1 h-4 w-4 text-slate-400" />
                        <span className="flex-1 truncate text-sm text-white">
                            {selectedExercise ? selectedExercise.name : "Select an exercise..."}
                        </span>
                    </div>

                    {isDropdownOpen && (
                        <div className="absolute left-0 right-0 top-full mt-2 flex max-h-80 flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-800 shadow-2xl">
                            <div className="border-b border-slate-700 p-2">
                                <input
                                    type="text"
                                    placeholder="Search exercises..."
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    className="w-full rounded border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                                    onClick={(event) => event.stopPropagation()}
                                />
                            </div>
                            <div className="hidden-scrollbar space-y-1 overflow-y-auto p-2">
                                {filteredExercises.map((exercise) => (
                                    <div
                                        key={exercise._id}
                                        onClick={() => {
                                            setSelectedExercise(exercise);
                                            setIsDropdownOpen(false);
                                            setSearch("");
                                        }}
                                        className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 transition-colors ${
                                            selectedExercise?._id === exercise._id
                                                ? "bg-emerald-500/20 text-emerald-400"
                                                : "text-slate-300 hover:bg-slate-700"
                                        }`}
                                    >
                                        <span className="truncate pr-2 text-sm">{exercise.name}</span>
                                        <span className="shrink-0 rounded bg-slate-900/50 px-2 py-0.5 text-[10px] capitalize text-slate-500">{exercise.primary_muscle}</span>
                                    </div>
                                ))}
                                {filteredExercises.length === 0 && (
                                    <p className="py-4 text-center text-xs text-slate-500">No exercises found</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {selectedExercise && latestPoint && (
                <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                        <div className="text-xs uppercase tracking-wide text-slate-500">Current Best 1RM</div>
                        <div className="mt-2 text-2xl font-bold text-emerald-400">{currentMax.toFixed(1)} kg</div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                        <div className="text-xs uppercase tracking-wide text-slate-500">Latest Working Weight</div>
                        <div className="mt-2 text-2xl font-bold text-blue-400">{(latestPoint.weight || 0).toFixed(1)} kg</div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                        <div className="text-xs uppercase tracking-wide text-slate-500">Latest Total Volume</div>
                        <div className="mt-2 text-2xl font-bold text-violet-400">{Math.round(latestPoint.totalVolume || 0)} kg</div>
                    </div>
                </div>
            )}

            <div className="relative h-80 w-full">
                {!selectedExercise ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-800 bg-slate-900/50">
                        <Activity className="mb-3 h-8 w-8 text-slate-700" />
                        <p className="text-sm text-slate-500">Select an exercise to view your progression curve</p>
                    </div>
                ) : loading ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500/30 border-t-emerald-500"></div>
                    </div>
                ) : error ? (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl border border-rose-900/30 bg-rose-950/20">
                        <p className="text-rose-400">{error}</p>
                    </div>
                ) : chartData.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-800 bg-slate-900/50">
                        <p className="text-sm text-slate-500">No historical log data found for {selectedExercise.name}</p>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis dataKey="dateStr" stroke="#475569" fontSize={12} tickMargin={10} />
                            <YAxis stroke="#475569" fontSize={12} />
                            <Tooltip
                                contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }}
                                labelStyle={{ color: "#94a3b8" }}
                            />
                            <Legend />
                            <Line type="monotone" dataKey="estimated1RM" name="Estimated 1RM" stroke="#34d399" strokeWidth={3} dot={{ r: 4, fill: "#10b981", strokeWidth: 0 }} />
                            <Line type="monotone" dataKey="weight" name="Peak set weight" stroke="#60a5fa" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6", strokeWidth: 0 }} />
                            <Line type="monotone" dataKey="totalVolume" name="Session volume" stroke="#a78bfa" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </div>

            {chartData.length > 0 && selectedExercise && (
                <div className="mt-4 flex flex-wrap gap-4 text-xs">
                    <div className="flex items-center gap-2 text-slate-400">
                        <BarChart3 className="h-4 w-4 text-violet-400" />
                        Average reps in last session: <strong className="text-white">{(latestPoint?.avgReps || 0).toFixed(1)}</strong>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400">
                        <Activity className="h-4 w-4 text-amber-400" />
                        Average RPE in last session: <strong className="text-white">{(latestPoint?.rpe || 0).toFixed(1)}</strong>
                    </div>
                </div>
            )}
        </div>
    );
}


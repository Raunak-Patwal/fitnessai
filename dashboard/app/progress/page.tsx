"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
    AreaChart,
    Area,
    BarChart,
    Bar,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    Legend
} from "recharts";
import { TrendingUp, Dumbbell, Activity, Calendar, BrainCircuit, Database, Clock3 } from "lucide-react";
import Link from "next/link";
import ExerciseProgressChart from "../../components/ExerciseProgressChart";

const API_URL = "http://localhost:5000";

function formatShortDate(value: string) {
    const date = new Date(value);
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatDateTime(value: string) {
    return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDuration(minutes: number) {
    const total = Math.max(0, Math.round(Number(minutes) || 0));
    if (total < 60) return `${total} min`;
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function prettyMuscle(value: string) {
    return String(value || "general").replace(/_/g, " ");
}

function formatSigned(value: number) {
    if (!Number.isFinite(value)) return "0.0";
    return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

function formatSeries(values: number[] = [], suffix = "") {
    if (!Array.isArray(values) || values.length === 0) return "Not logged";
    return values.map((value) => `${value}${suffix}`).join(" / ");
}

export default function ProgressPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchProgressData = async () => {
            try {
                const userId = localStorage.getItem("fitness_ai_userId");
                if (!userId) {
                    setError("No user found. Please complete onboarding first.");
                    setLoading(false);
                    return;
                }

                const [summaryRes, experienceRes, historyRes] = await Promise.all([
                    fetch(`${API_URL}/analytics/summary/${userId}?weeks=12`),
                    fetch(`${API_URL}/analytics/experience/${userId}`),
                    fetch(`${API_URL}/analytics/history/${userId}?weeks=12`)
                ]);

                if (!summaryRes.ok || !experienceRes.ok) {
                    throw new Error("Analytics request failed");
                }

                const [summaryData, experienceData] = await Promise.all([
                    summaryRes.json(),
                    experienceRes.json()
                ]);
                const historyData = historyRes.ok
                    ? await historyRes.json()
                    : { data: [] };

                const sessions = (summaryData.data?.sessions || []).map((session: any) => ({
                    ...session,
                    label: formatShortDate(session.date)
                }));

                const weeklyVolume = (summaryData.data?.volumeTrend || []).map((entry: any) => ({
                    ...entry,
                    label: entry.week?.split("-").pop() || entry.week
                }));

                const fatigueTrend = (summaryData.data?.fatigue || []).map((entry: any) => ({
                    ...entry,
                    label: entry.week?.split("-").pop() || entry.week,
                    averageFatigue: entry.averageFatigue || 0
                }));

                const muscles = (summaryData.data?.muscles || []).slice(0, 8).map((entry: any) => ({
                    ...entry,
                    muscleLabel: prettyMuscle(entry.muscle)
                }));

                const rl = summaryData.data?.rl || {
                    topPositive: [],
                    topNegative: [],
                    recentAdaptations: [],
                    summary: { trackedExercises: 0, provenAdaptations: 0 }
                };

                const currentState = summaryData.data?.currentState || {};
                const currentLevel = experienceData?.data?.currentLevel ||
                    experienceData?.data?.experience ||
                    currentState.experienceLevel ||
                    "Beginner";
                const adherenceSummary = summaryData.data?.summary || {};
                const averageSessionVolume = sessions.length
                    ? Math.round(sessions.reduce((sum: number, item: any) => sum + (item.totalVolume || 0), 0) / sessions.length)
                    : 0;

                setData({
                    userId,
                    sessions,
                    weeklyVolume,
                    fatigueTrend,
                    muscles,
                    rl,
                    history: Array.isArray(historyData.data) ? historyData.data : [],
                    metrics: {
                        currentLevel: currentLevel.charAt(0).toUpperCase() + currentLevel.slice(1),
                        progressScore: currentState.progressScore || 0,
                        progressToNext: currentState.progressToNextLevel || 0,
                        totalWorkouts: adherenceSummary.totalWorkouts || sessions.length || 0,
                        adherenceRate: Math.round(adherenceSummary.overallAdherenceRate || 0),
                        averageSessionVolume,
                        latestIntensity: sessions.length ? sessions[sessions.length - 1].avgIntensity || 0 : 0,
                        latestFatigue: fatigueTrend.length ? fatigueTrend[fatigueTrend.length - 1].averageFatigue || 0 : 0,
                        trackedExercises: rl.summary?.trackedExercises || 0,
                        provenAdaptations: rl.summary?.provenAdaptations || 0
                    }
                });
                setLoading(false);
            } catch (fetchError) {
                console.error("Progress fetch error:", fetchError);
                setError("Could not fetch analytics data. Make sure the backend is running.");
                setLoading(false);
            }
        };

        fetchProgressData();
    }, []);

    if (loading) return <div className="m-8 h-96 animate-pulse rounded-xl border border-slate-800 bg-slate-900"></div>;

    if (error) {
        return (
            <div className="w-full py-20 text-center">
                <p className="mb-4 text-lg text-slate-400">{error}</p>
                <Link href="/onboarding" className="rounded bg-emerald-500 px-6 py-3 font-bold text-slate-950 hover:bg-emerald-400">
                    Go to Onboarding
                </Link>
            </div>
        );
    }

    return (
        <div className="w-full space-y-6">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-3xl font-bold text-transparent">
                        Elite Progress Tracker
                    </h1>
                    <p className="mt-2 text-slate-400">Per-set volume, intensity, adherence, fatigue, RL learning signals, and daily workout history.</p>
                </div>
                <Link href="/dashboard" className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
                    Back to Dashboard
                </Link>
            </header>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
                <MetricCard icon={<TrendingUp className="h-6 w-6 text-blue-400" />} label="Experience Level" value={data.metrics.currentLevel} sub={`Progress score ${data.metrics.progressScore}`} />
                <MetricCard icon={<Activity className="h-6 w-6 text-emerald-400" />} label="Sessions Logged" value={data.metrics.totalWorkouts} sub={`Avg volume ${data.metrics.averageSessionVolume} kg`} />
                <MetricCard icon={<Calendar className="h-6 w-6 text-amber-400" />} label="Adherence Rate" value={`${data.metrics.adherenceRate}%`} sub={`Next level ${data.metrics.progressToNext}%`} />
                <MetricCard icon={<BrainCircuit className="h-6 w-6 text-violet-400" />} label="RL Memory" value={data.metrics.trackedExercises} sub={`${data.metrics.provenAdaptations} verified changes`} />
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
                <div className="mb-4 flex items-center gap-2">
                    <Database className="h-5 w-5 text-cyan-400" />
                    <h3 className="font-semibold text-white">What This Analysis Is Showing</h3>
                </div>
                <div className="grid gap-4 lg:grid-cols-4">
                    <ExplainCard title="Experience" text={`Level progression is driven by logged completion quality, pain, and difficulty. Current score is ${data.metrics.progressScore}.`} />
                    <ExplainCard title="Adherence" text={`This compares planned sets with completed sets. Current adherence trend is ${data.metrics.adherenceRate}%.`} />
                    <ExplainCard title="Load" text={`Volume uses actual reps x actual weight, and intensity uses logged RPE. Latest average intensity is ${data.metrics.latestIntensity}.`} />
                    <ExplainCard title="Fatigue and RL" text={`Fatigue shows recovery stress and RL memory shows exercise preference shifts. Latest fatigue signal is ${data.metrics.latestFatigue}.`} />
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <ChartCard title="Session Volume Timeline" icon={<Dumbbell className="h-5 w-5 text-indigo-400" />}>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.sessions}>
                            <defs>
                                <linearGradient id="sessionVolume" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.45} />
                                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis dataKey="label" stroke="#475569" fontSize={12} tickMargin={10} />
                            <YAxis stroke="#475569" fontSize={12} />
                            <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }} />
                            <Area type="monotone" dataKey="totalVolume" stroke="#22c55e" fill="url(#sessionVolume)" strokeWidth={3} />
                        </AreaChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Intensity and Adherence" icon={<Clock3 className="h-5 w-5 text-amber-400" />}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.sessions}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis dataKey="label" stroke="#475569" fontSize={12} tickMargin={10} />
                            <YAxis yAxisId="left" stroke="#475569" fontSize={12} domain={[0, 10]} />
                            <YAxis yAxisId="right" orientation="right" stroke="#475569" fontSize={12} domain={[0, 100]} />
                            <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }} />
                            <Legend />
                            <Line yAxisId="left" type="monotone" dataKey="avgIntensity" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} name="Avg RPE" />
                            <Line yAxisId="right" type="monotone" dataKey="adherenceScore" stroke="#38bdf8" strokeWidth={3} dot={{ r: 4 }} name="Adherence" />
                        </LineChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <ChartCard title="Weekly Load and Fatigue" icon={<Activity className="h-5 w-5 text-emerald-400" />}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.weeklyVolume}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis dataKey="label" stroke="#475569" fontSize={12} tickMargin={10} />
                            <YAxis yAxisId="left" stroke="#475569" fontSize={12} />
                            <YAxis yAxisId="right" orientation="right" stroke="#475569" fontSize={12} domain={[0, 10]} />
                            <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }} />
                            <Legend />
                            <Bar yAxisId="left" dataKey="totalVolume" fill="#6366f1" radius={[6, 6, 0, 0]} name="Weekly volume" />
                            <Line yAxisId="right" type="monotone" dataKey="avgIntensity" stroke="#22c55e" strokeWidth={3} dot={{ r: 4 }} name="Avg intensity" />
                        </LineChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Muscle Volume Distribution" icon={<Dumbbell className="h-5 w-5 text-cyan-400" />}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.muscles} layout="vertical" margin={{ left: 20, right: 12 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                            <XAxis type="number" stroke="#475569" fontSize={12} />
                            <YAxis dataKey="muscleLabel" type="category" stroke="#475569" fontSize={12} width={110} />
                            <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }} />
                            <Bar dataKey="sets" fill="#14b8a6" radius={[0, 6, 6, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
                    <h3 className="mb-4 font-semibold text-white">RL Engine Readout</h3>
                    <div className="mb-4 grid gap-3 md:grid-cols-3">
                        <MiniStat label="Tracked" value={data.metrics.trackedExercises} />
                        <MiniStat label="Verified" value={data.metrics.provenAdaptations} accent="text-emerald-300" />
                        <MiniStat label="Latest Intensity" value={data.metrics.latestIntensity} />
                    </div>
                    <div className="space-y-3">
                        {(data.rl.recentAdaptations || []).length === 0 ? (
                            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-500">
                                No verified RL change yet.
                            </div>
                        ) : (data.rl.recentAdaptations || []).map((entry: any) => (
                            <div key={`${entry.workoutId}-${entry.exerciseId}-${entry.completedAt}`} className="rounded-lg border border-cyan-900/30 bg-cyan-950/10 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <div className="font-medium text-white">{entry.name}</div>
                                        <div className="mt-1 text-xs text-slate-400">{prettyMuscle(entry.primary_muscle)} • {formatShortDate(entry.completedAt)}</div>
                                    </div>
                                    <div className={`rounded-full px-3 py-1 text-sm font-semibold ${entry.delta > 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
                                        {formatSigned(entry.scoreBefore)} to {formatSigned(entry.scoreAfter)} ({formatSigned(entry.delta)})
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <ChartCard title="Fatigue Signal" icon={<Activity className="h-5 w-5 text-orange-400" />}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.fatigueTrend}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis dataKey="label" stroke="#475569" fontSize={12} tickMargin={10} />
                            <YAxis stroke="#475569" fontSize={12} domain={[0, 100]} />
                            <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }} />
                            <Line type="monotone" dataKey="averageFatigue" stroke="#f97316" strokeWidth={3} dot={{ r: 4 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
                <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                        <h3 className="font-semibold text-white">Daily Workout History</h3>
                        <p className="mt-1 text-sm text-slate-400">Database se direct daily sessions: duration, exercise list, sets, reps, weight, RPE, pain, notes aur RL delta.</p>
                    </div>
                    <div className="rounded-full border border-cyan-900/30 bg-cyan-950/20 px-3 py-1 text-xs text-cyan-300">
                        {data.history.length} sessions
                    </div>
                </div>

                <div className="space-y-3">
                    {data.history.length === 0 ? (
                        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-500">No logged workout history found yet.</div>
                    ) : data.history.map((session: any) => (
                        <details key={session.workoutId} className="rounded-xl border border-slate-800 bg-slate-950/40">
                            <summary className="cursor-pointer list-none p-4">
                                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                                    <div>
                                        <div className="text-base font-semibold text-white">{session.day || "Workout Day"} • {formatDateTime(session.date)}</div>
                                        <div className="mt-1 text-sm text-slate-400">{session.totals.completedExercises} completed • {session.totals.skippedExercises} skipped • {session.totals.pendingExercises} pending</div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                        <MiniBadge label="Duration" value={formatDuration(session.durationMinutes || 0)} />
                                        <MiniBadge label="Volume" value={`${Math.round(session.totals.totalVolume || 0)} kg`} />
                                        <MiniBadge label="Sets/Reps" value={`${session.totals.totalSets} / ${session.totals.totalReps}`} />
                                        <MiniBadge label="Adherence" value={`${session.adherenceScore || 0}%`} />
                                    </div>
                                </div>
                            </summary>
                            <div className="border-t border-slate-800 p-4 space-y-3">
                                {session.exercises.map((exercise: any) => (
                                    <div key={`${session.workoutId}-${exercise.name}-${exercise.exerciseId || exercise.status}`} className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <div className="font-semibold text-white">{exercise.name}</div>
                                                <div className="mt-1 text-xs text-slate-400">{prettyMuscle(exercise.primary_muscle)} • {exercise.equipment || "bodyweight"}</div>
                                            </div>
                                            <div className={`rounded-full px-3 py-1 text-xs font-semibold ${exercise.status === "completed" ? "bg-emerald-500/15 text-emerald-300" : exercise.status === "skipped" ? "bg-amber-500/15 text-amber-300" : "bg-slate-700 text-slate-300"}`}>
                                                {exercise.status}
                                            </div>
                                        </div>
                                        <div className="mt-3 grid gap-3 md:grid-cols-4">
                                            <MiniBadge label="Sets" value={exercise.actual.sets || 0} />
                                            <MiniBadge label="Peak Weight" value={`${exercise.summary.peakWeight || 0} kg`} />
                                            <MiniBadge label="Volume" value={`${Math.round(exercise.summary.totalVolume || 0)} kg`} />
                                            <MiniBadge label="RL Delta" value={exercise.rl.delta != null ? formatSigned(exercise.rl.delta) : "No change"} />
                                        </div>
                                        <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-300">
                                                <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Planned</div>
                                                <div>Sets: {exercise.target.sets ?? "-"}</div>
                                                <div>Reps: {exercise.target.reps ?? "-"}</div>
                                                <div>Weight: {exercise.target.weight ?? 0} kg</div>
                                                <div>RPE: {exercise.target.rpe ?? "-"}</div>
                                            </div>
                                            <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-300">
                                                <div className="mb-2 text-xs uppercase tracking-wide text-cyan-400">Actual Logged</div>
                                                <div>Reps: {formatSeries(exercise.actual.reps)}</div>
                                                <div>Weight: {formatSeries(exercise.actual.weights, " kg")}</div>
                                                <div>RPE: {formatSeries(exercise.actual.rpe)}</div>
                                                <div>Pain / Difficulty: {exercise.painLevel ?? 0} / {exercise.difficulty ?? "-"}</div>
                                            </div>
                                        </div>
                                        {(exercise.notes || exercise.skipReason) && (
                                            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-300">
                                                {exercise.skipReason || exercise.notes}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </details>
                    ))}
                </div>
            </div>

            {data?.userId && <ExerciseProgressChart userId={data.userId} />}
        </div>
    );
}

function MetricCard({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string | number; sub: string }) {
    return (
        <div className="flex items-start gap-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="rounded-lg bg-slate-800 p-3">{icon}</div>
            <div>
                <div className="text-sm text-slate-400">{label}</div>
                <div className="mt-1 text-xl font-bold tracking-wide text-white">{value}</div>
                <div className="mt-1 text-xs text-slate-500">{sub}</div>
            </div>
        </div>
    );
}

function ExplainCard({ title, text }: { title: string; text: string }) {
    return (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="mb-2 text-sm font-medium text-white">{title}</div>
            <p className="text-sm text-slate-400">{text}</p>
        </div>
    );
}

function ChartCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
    return (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="mb-6 flex items-center gap-2 font-semibold text-white">{icon}{title}</h3>
            <div className="h-72 w-full">{children}</div>
        </div>
    );
}

function MiniStat({ label, value, accent = "text-white" }: { label: string; value: string | number; accent?: string }) {
    return (
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
            <div className={`mt-2 text-xl font-semibold ${accent}`}>{value}</div>
        </div>
    );
}

function MiniBadge({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-1 font-semibold text-white">{value}</div>
        </div>
    );
}

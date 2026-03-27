"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Activity,
    ShieldAlert,
    Cpu,
    TrendingDown,
    AlertTriangle,
    CheckCircle2,
    ChevronRight,
    Dumbbell,
    Clock,
    SkipForward,
    Trophy,
    RefreshCw,
    PlusCircle
} from "lucide-react";
import clsx from "clsx";
import ReplaceExerciseModal from "./ReplaceExerciseModal";
import AddExerciseModal from "./AddExerciseModal";
import { useRouter } from "next/navigation";

const API_URL = "http://localhost:5000";

type SetEntry = {
    reps: number;
    weight: number;
    rpe: number;
};

type ExerciseState = {
    setEntries: SetEntry[];
    painLevel: number;
    difficulty: number;
    notes: string;
    status: "pending" | "completed" | "skipped";
    expanded: boolean;
    skipReason: string;
};

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function toNumberArray(value: unknown, fallbackValue: number, desiredLength: number) {
    let values: number[] = [];

    if (Array.isArray(value)) {
        values = value
            .map((entry) => Number(entry))
            .filter((entry) => Number.isFinite(entry));
    } else if (value != null) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) values = [parsed];
    }

    if (values.length === 0 && desiredLength > 0) {
        values = Array(desiredLength).fill(fallbackValue);
    }

    if (values.length === 1 && desiredLength > 1) {
        values = Array(desiredLength).fill(values[0]);
    }

    if (values.length > desiredLength) {
        values = values.slice(0, desiredLength);
    }

    if (values.length < desiredLength && values.length > 0) {
        values = [...values, ...Array(desiredLength - values.length).fill(values[values.length - 1])];
    }

    return values;
}

function buildDefaultSetEntry(exercise: any, existing?: Partial<SetEntry>): SetEntry {
    return {
        reps: clamp(Number(existing?.reps ?? exercise.reps ?? exercise.target_reps ?? 8) || 8, 1, 100),
        weight: clamp(Number(existing?.weight ?? exercise.target_weight ?? 0) || 0, 0, 500),
        rpe: clamp(Number(existing?.rpe ?? exercise.rpe ?? exercise.target_rpe ?? 7) || 7, 1, 10)
    };
}

function buildSetEntries(exercise: any, logged: any): SetEntry[] {
    const targetSets = Math.max(1, Number(logged?.actual_sets ?? exercise.sets ?? exercise.target_sets ?? 1) || 1);
    const reps = toNumberArray(logged?.actual_reps, Number(exercise.reps ?? exercise.target_reps ?? 8) || 8, targetSets);
    const weights = toNumberArray(logged?.actual_weight, Number(exercise.target_weight ?? 0) || 0, targetSets);
    const rpes = toNumberArray(logged?.actual_rpe, Number(exercise.rpe ?? exercise.target_rpe ?? 7) || 7, targetSets);

    return Array.from({ length: targetSets }, (_, index) => ({
        reps: clamp(Number(reps[index] ?? reps[reps.length - 1] ?? 8) || 8, 1, 100),
        weight: clamp(Number(weights[index] ?? weights[weights.length - 1] ?? 0) || 0, 0, 500),
        rpe: clamp(Number(rpes[index] ?? rpes[rpes.length - 1] ?? 7) || 7, 1, 10)
    }));
}

function getAverage(values: number[]) {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getTotalVolume(entries: SetEntry[]) {
    return entries.reduce((sum, entry) => sum + entry.reps * entry.weight, 0);
}

function formatFlag(flag: any) {
    const label = typeof flag === "string" ? flag : flag?.muscle || "unknown";
    return String(label).replace(/_/g, " ");
}

function formatSlopeValue(value: any) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : "N/A";
}

export default function UserDashboard() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [exerciseStates, setExerciseStates] = useState<ExerciseState[]>([]);
    const [submitting, setSubmitting] = useState<number | null>(null);
    const [replaceModalOpen, setReplaceModalOpen] = useState(false);
    const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
    const [addModalOpen, setAddModalOpen] = useState(false);

    const fetchUserData = useCallback(async () => {
        setLoading(true);

        try {
            const userId = localStorage.getItem("fitness_ai_userId");
            if (!userId) {
                router.push("/onboarding");
                return;
            }

            const [userRes, expRes, workRes] = await Promise.all([
                fetch(`${API_URL}/users/${userId}`),
                fetch(`${API_URL}/program/explain/${userId}`),
                fetch(`${API_URL}/workouts/today/${userId}`)
            ]);

            const [userData, expData, workData] = await Promise.all([
                userRes.json(),
                expRes.json(),
                workRes.json()
            ]);

            localStorage.setItem("fitness_ai_profile", JSON.stringify(userData.user || {}));

            const plannedExercises = Array.isArray(workData.data?.plannedExercises) && workData.data.plannedExercises.length > 0
                ? workData.data.plannedExercises
                : Array.isArray(workData.data?.exercises)
                    ? workData.data.exercises.map((exercise: any) => ({
                        _id: exercise.exerciseId,
                        name: exercise.name,
                        primary_muscle: exercise.primary_muscle,
                        movement_pattern: exercise.movement_pattern,
                        equipment: exercise.equipment,
                        sets: exercise.target_sets,
                        reps: exercise.target_reps,
                        rpe: exercise.target_rpe,
                        target_weight: exercise.target_weight,
                        notes: exercise.notes
                    }))
                    : [];

            const loggedExercises = Array.isArray(workData.data?.exercises) ? workData.data.exercises : [];

            const exercises = plannedExercises.map((exercise: any, index: number) => {
                const exerciseId = String(exercise._id || exercise.exerciseId || "");
                return {
                    ...exercise,
                    _id: exerciseId,
                    target_weight: exercise.target_weight ?? loggedExercises[index]?.target_weight ?? null,
                    notes: exercise.notes || loggedExercises[index]?.notes || "",
                    rl_score: workData.data?.rlScores?.[exerciseId] ?? 0
                };
            });

            const injuryFlags = Array.isArray(userData.user?.injury_flags) ? userData.user.injury_flags : [];
            const equipment = Array.isArray(userData.user?.equipment) ? userData.user.equipment : [];

            const analysis = expData.analysis || {};

            setData({
                userId,
                name: userData.user?.name || "Athlete",
                goal: userData.user?.goal || "hybrid",
                experience: userData.user?.experience || "beginner",
                gender: userData.user?.gender || "other",
                recovery_profile: userData.user?.recovery_profile || "moderate",
                training_days: userData.user?.training_days_per_week || 3,
                equipment,
                injury_flags: injuryFlags,
                auto_deload_flag: Boolean(analysis?.plateau?.active),
                injury_analysis: analysis?.injury || null,
                plateau_metrics: {
                    muscle: analysis?.plateau?.focusMuscle || "abhi tracking chal rahi hai",
                    volSlope: analysis?.plateau?.volSlope,
                    perfSlope: analysis?.plateau?.perfSlope,
                    fatSlope: analysis?.plateau?.fatSlope,
                    risk: analysis?.plateau?.active ? "High" : "Low",
                    status: analysis?.plateau?.active
                        ? "Triggered (Pre-Deload active)"
                        : "Monitoring"
                },
                plateau_analysis: analysis?.plateau || null,
                mesocycle_analysis: analysis?.mesocycle || null,
                fatigue_analysis: analysis?.fatigue || null,
                explainability: expData.report || {
                    summary: "Baseline",
                    predicted_effect: "None",
                    confidence_score: 100,
                    ranked_reasons: []
                },
                workout: {
                    workoutId: workData.data?.workoutId,
                    day: workData.data?.day || "Rest",
                    dayIndex: workData.data?.dayIndex ?? 0,
                    totalDays: workData.data?.totalDays ?? 1,
                    exercises,
                    loggedExercises,
                    errorMessage: workData.error || null,
                    needsGeneration: Boolean(workData.needsGeneration)
                }
            });

            const states = exercises.map((exercise: any, index: number) => {
                const logged = loggedExercises[index];
                const status = logged?.status || "pending";
                return {
                    setEntries: buildSetEntries(exercise, logged),
                    painLevel: clamp(Number(logged?.pain_level ?? 0) || 0, 0, 10),
                    difficulty: clamp(Number(logged?.difficulty ?? exercise.rpe ?? 7) || 7, 1, 10),
                    notes: logged?.notes || exercise.notes || "",
                    status,
                    expanded: false,
                    skipReason: typeof logged?.notes === "string" && status === "skipped" ? logged.notes : "User skipped"
                } as ExerciseState;
            });

            setExerciseStates(states);
        } catch (error) {
            console.error("Dashboard fetch error:", error);
            setData({
                workout: {
                    exercises: [],
                    errorMessage: "Could not load dashboard data."
                }
            });
            setExerciseStates([]);
        } finally {
            setLoading(false);
        }
    }, [router]);

    useEffect(() => {
        fetchUserData();
    }, [fetchUserData]);

    const toggleExpand = (exerciseIndex: number) => {
        setExerciseStates((prev) => prev.map((state, index) =>
            index === exerciseIndex ? { ...state, expanded: !state.expanded } : state
        ));
    };

    const setExerciseMeta = (exerciseIndex: number, patch: Partial<ExerciseState>) => {
        setExerciseStates((prev) => prev.map((state, index) =>
            index === exerciseIndex ? { ...state, ...patch } : state
        ));
    };

    const setEntryValue = (exerciseIndex: number, setIndex: number, field: keyof SetEntry, value: number) => {
        setExerciseStates((prev) => prev.map((state, index) => {
            if (index !== exerciseIndex) return state;

            return {
                ...state,
                setEntries: state.setEntries.map((entry, entryIndex) => (
                    entryIndex === setIndex
                        ? {
                            ...entry,
                            [field]: field === "weight"
                                ? clamp(value, 0, 500)
                                : field === "rpe"
                                    ? clamp(value, 1, 10)
                                    : clamp(value, 1, 100)
                        }
                        : entry
                ))
            };
        }));
    };

    const resizeSetEntries = (exerciseIndex: number, nextCount: number) => {
        setExerciseStates((prev) => prev.map((state, index) => {
            if (index !== exerciseIndex) return state;

            const safeCount = Math.max(1, Math.min(12, nextCount));
            const exercise = data?.workout?.exercises?.[exerciseIndex];
            const lastEntry = state.setEntries[state.setEntries.length - 1] || buildDefaultSetEntry(exercise || {});

            if (safeCount <= state.setEntries.length) {
                return { ...state, setEntries: state.setEntries.slice(0, safeCount) };
            }

            return {
                ...state,
                setEntries: [
                    ...state.setEntries,
                    ...Array.from({ length: safeCount - state.setEntries.length }, () => buildDefaultSetEntry(exercise || {}, lastEntry))
                ]
            };
        }));
    };

    const applySetOneToAll = (exerciseIndex: number) => {
        setExerciseStates((prev) => prev.map((state, index) => {
            if (index !== exerciseIndex || state.setEntries.length === 0) return state;
            const baseEntry = state.setEntries[0];
            return {
                ...state,
                setEntries: state.setEntries.map(() => ({ ...baseEntry }))
            };
        }));
    };

    const nudgeAllSetValues = (exerciseIndex: number, field: keyof SetEntry, delta: number) => {
        setExerciseStates((prev) => prev.map((state, index) => {
            if (index !== exerciseIndex) return state;

            return {
                ...state,
                setEntries: state.setEntries.map((entry) => ({
                    ...entry,
                    [field]: field === "weight"
                        ? clamp(Number(entry[field]) + delta, 0, 500)
                        : field === "rpe"
                            ? clamp(Number(entry[field]) + delta, 1, 10)
                            : clamp(Number(entry[field]) + delta, 1, 100)
                }))
            };
        }));
    };

    const buildExercisePayload = (state: ExerciseState) => ({
        actual_sets: state.setEntries.length,
        actual_reps: state.setEntries.map((entry) => entry.reps),
        actual_weight: state.setEntries.map((entry) => entry.weight),
        actual_rpe: state.setEntries.map((entry) => entry.rpe),
        pain_level: state.painLevel,
        difficulty: state.difficulty,
        notes: state.notes
    });

    const markExerciseDone = async (exerciseIndex: number) => {
        if (!data?.workout?.workoutId) return;

        setSubmitting(exerciseIndex);
        try {
            const response = await fetch(`${API_URL}/workouts/${data.workout.workoutId}/exercise/${exerciseIndex}/done`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(buildExercisePayload(exerciseStates[exerciseIndex]))
            });

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || "Could not log exercise");
            }

            setExerciseStates((prev) => prev.map((state, index) =>
                index === exerciseIndex ? { ...state, status: "completed", expanded: false } : state
            ));
        } catch (error) {
            console.error("Error logging exercise:", error);
        } finally {
            setSubmitting(null);
        }
    };

    const skipExercise = async (exerciseIndex: number) => {
        if (!data?.workout?.workoutId) return;

        setSubmitting(exerciseIndex);
        try {
            const reason = exerciseStates[exerciseIndex]?.skipReason || "User skipped";
            const response = await fetch(`${API_URL}/workouts/${data.workout.workoutId}/exercise/${exerciseIndex}/skip`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason })
            });

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || "Could not skip exercise");
            }

            setExerciseStates((prev) => prev.map((state, index) =>
                index === exerciseIndex ? { ...state, status: "skipped", expanded: false } : state
            ));
        } catch (error) {
            console.error("Error skipping exercise:", error);
        } finally {
            setSubmitting(null);
        }
    };

    const finishWorkout = async () => {
        if (!data?.workout?.workoutId) return;

        try {
            const response = await fetch(`${API_URL}/workouts/complete`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: data.userId,
                    workoutId: data.workout.workoutId,
                    exercises: exerciseStates.map((state) => (
                        state.status === "skipped"
                            ? { status: "skipped", reason: state.skipReason }
                            : { status: "completed", ...buildExercisePayload(state) }
                    ))
                })
            });

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || "Could not finish workout");
            }

            window.location.reload();
        } catch (error) {
            console.error("Error finishing workout:", error);
        }
    };

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="h-24 animate-pulse rounded-xl border border-slate-800 bg-slate-900" />
                <div className="h-96 animate-pulse rounded-xl border border-slate-800 bg-slate-900" />
            </div>
        );
    }

    const resolvedCount = exerciseStates.filter((state) => state.status !== "pending").length;
    const completedCount = exerciseStates.filter((state) => state.status === "completed").length;
    const workoutFinished = exerciseStates.length > 0 && resolvedCount === exerciseStates.length;
    const progress = exerciseStates.length > 0 ? (resolvedCount / exerciseStates.length) * 100 : 0;

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/40 px-5 py-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.35em] text-emerald-400/70">Active Athlete</p>
                        <h2 className="mt-2 text-3xl font-bold text-white">{data?.name || "Athlete"}</h2>
                        <p className="mt-2 max-w-2xl text-sm text-slate-400">
                            Current profile locked for {data?.goal} with {data?.training_days} training days per week.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {(data?.equipment || []).map((item: string) => (
                                <span
                                    key={item}
                                    className="rounded-full border border-emerald-900/40 bg-emerald-950/20 px-3 py-1 text-xs capitalize text-emerald-300"
                                >
                                    {item.replace(/_/g, " ")}
                                </span>
                            ))}
                            {(data?.injury_flags || []).map((flag: any, index: number) => (
                                <span
                                    key={`${formatFlag(flag)}-${index}`}
                                    className="rounded-full border border-rose-900/40 bg-rose-950/20 px-3 py-1 text-xs capitalize text-rose-300"
                                >
                                    Protect {formatFlag(flag)}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
                        <div className="text-slate-500">Recovery Profile</div>
                        <div className="mt-1 font-semibold capitalize text-white">{data?.recovery_profile}</div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                    <div className="mb-1 text-xs text-slate-500">Goal</div>
                    <div className="text-lg font-bold capitalize text-white">{data?.goal}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                    <div className="mb-1 text-xs text-slate-500">Level</div>
                    <div className="text-lg font-bold capitalize text-white">{data?.experience}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                    <div className="mb-1 text-xs text-slate-500">Gender</div>
                    <div className="text-lg font-bold capitalize text-white">{data?.gender}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                    <div className="mb-1 text-xs text-slate-500">Days/Week</div>
                    <div className="text-lg font-bold text-white">{data?.training_days}</div>
                </div>
                <div className={clsx(
                    "rounded-xl border p-3",
                    data?.auto_deload_flag ? "border-rose-900/50 bg-rose-950/30" : "border-slate-800 bg-slate-900"
                )}>
                    <div className="mb-1 text-xs text-slate-500">Status</div>
                    <div className={clsx(
                        "text-lg font-bold",
                        data?.auto_deload_flag ? "text-rose-400" : "text-emerald-400"
                    )}>
                        {data?.auto_deload_flag ? "Deload" : "Optimal"}
                    </div>
                </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
                <div className="border-b border-slate-700/50 bg-gradient-to-r from-blue-950/80 to-indigo-950/80 px-5 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="rounded-xl bg-blue-500/20 p-2.5">
                                <Dumbbell className="h-6 w-6 text-blue-400" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold capitalize text-white">
                                    {data?.workout?.day} Day
                                </h2>
                                <p className="text-sm text-slate-400">
                                    Day {(data?.workout?.dayIndex ?? 0) + 1} of {data?.workout?.totalDays ?? 1}
                                </p>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-sm text-slate-400">{resolvedCount}/{exerciseStates.length} logged</div>
                            <div className="text-xs text-slate-500">{completedCount} completed</div>
                        </div>
                    </div>

                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-700/50">
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>

                <div className="space-y-3 p-4">
                    {data?.workout?.exercises?.length === 0 ? (
                        <div className="py-12 text-center text-slate-500">
                            {data?.workout?.errorMessage ? (
                                <>
                                    <AlertTriangle className="mx-auto mb-3 h-12 w-12 text-amber-400 opacity-60" />
                                    <p className="text-lg font-medium text-slate-300">No Active Workout</p>
                                    <p className="mt-1 text-sm">{data.workout.errorMessage}</p>
                                    {data?.workout?.needsGeneration && (
                                        <button
                                            onClick={() => router.push("/onboarding")}
                                            className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                                        >
                                            Rebuild Profile
                                        </button>
                                    )}
                                </>
                            ) : (
                                <>
                                    <Clock className="mx-auto mb-3 h-12 w-12 opacity-50" />
                                    <p className="text-lg font-medium">Rest Day</p>
                                    <p className="mt-1 text-sm">Take it easy. Your muscles are recovering.</p>
                                </>
                            )}
                        </div>
                    ) : (
                        data.workout.exercises.map((exercise: any, exerciseIndex: number) => {
                            const state = exerciseStates[exerciseIndex];
                            if (!state) return null;

                            const isDone = state.status === "completed";
                            const isSkipped = state.status === "skipped";
                            const isExpanded = state.expanded;
                            const isActive = !isDone && !isSkipped;
                            const averageReps = Math.round(getAverage(state.setEntries.map((entry) => entry.reps)) * 10) / 10;
                            const averageRpe = Math.round(getAverage(state.setEntries.map((entry) => entry.rpe)) * 10) / 10;
                            const sessionVolume = Math.round(getTotalVolume(state.setEntries));
                            const protectiveMode = Number(exercise.target_weight) === 0 ||
                                String(exercise.notes || "").toLowerCase().includes("protective");

                            return (
                                <div
                                    key={`${exercise._id}-${exerciseIndex}`}
                                    className={clsx(
                                        "rounded-xl border transition-all duration-300",
                                        isDone && "border-emerald-900/40 bg-emerald-950/20",
                                        isSkipped && "border-slate-700/50 bg-slate-800/30 opacity-60",
                                        isActive && !isExpanded && "cursor-pointer border-slate-700/50 bg-slate-800/40 hover:border-blue-800/60",
                                        isActive && isExpanded && "border-blue-700/50 bg-slate-800/60 shadow-lg shadow-blue-500/5"
                                    )}
                                >
                                    <div
                                        className="flex items-center gap-4 px-4 py-3.5"
                                        onClick={() => isActive && toggleExpand(exerciseIndex)}
                                    >
                                        <div className={clsx(
                                            "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold",
                                            isDone && "bg-emerald-500/20 text-emerald-400",
                                            isSkipped && "bg-slate-700/50 text-slate-500",
                                            isActive && "bg-slate-700/50 text-slate-400"
                                        )}>
                                            {isDone ? <CheckCircle2 className="h-5 w-5" /> :
                                                isSkipped ? <SkipForward className="h-4 w-4" /> :
                                                    exerciseIndex + 1}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className={clsx(
                                                "truncate font-semibold",
                                                isDone ? "text-emerald-300" : "text-white"
                                            )}>
                                                {exercise.name}
                                            </div>
                                            <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                                                <span className="capitalize text-slate-500">{exercise.primary_muscle}</span>
                                                {exercise.equipment && (
                                                    <span className="rounded-full border border-slate-700 px-2 py-0.5 capitalize text-slate-400">
                                                        {String(exercise.equipment).replace(/_/g, " ")}
                                                    </span>
                                                )}
                                                {protectiveMode && (
                                                    <span className="rounded-full border border-amber-900/50 bg-amber-950/20 px-2 py-0.5 text-amber-300">
                                                        Injury-safe load
                                                    </span>
                                                )}
                                                {exercise.rl_score < 0 && (
                                                    <span className="rounded-full border border-rose-900/50 bg-rose-950/20 px-2 py-0.5 text-rose-300">
                                                        RL: low preference
                                                    </span>
                                                )}
                                                {exercise.rl_score > 0 && (
                                                    <span className="rounded-full border border-emerald-900/50 bg-emerald-950/20 px-2 py-0.5 text-emerald-300">
                                                        RL: preferred
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex-shrink-0 text-right">
                                            <div className={clsx(
                                                "text-sm font-bold",
                                                isDone ? "text-emerald-400" : "text-blue-400"
                                            )}>
                                                {state.setEntries.length} x {averageReps || exercise.reps || exercise.target_reps}
                                            </div>
                                            <div className="text-xs text-slate-500">
                                                Avg RPE {averageRpe || exercise.rpe || exercise.target_rpe}
                                            </div>
                                        </div>

                                        {isActive && (
                                            <ChevronRight className={clsx(
                                                "h-5 w-5 text-slate-500 transition-transform duration-200",
                                                isExpanded && "rotate-90"
                                            )} />
                                        )}
                                    </div>

                                    {isExpanded && isActive && (
                                        <div className="space-y-4 border-t border-slate-700/30 px-4 pb-4 pt-4">
                                            <div className="grid gap-3 md:grid-cols-4">
                                                <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                                                    <div className="text-xs uppercase tracking-wide text-slate-500">Target</div>
                                                    <div className="mt-2 text-lg font-semibold text-white">
                                                        {exercise.sets || exercise.target_sets} x {exercise.reps || exercise.target_reps}
                                                    </div>
                                                    <div className="mt-1 text-xs text-slate-400">
                                                        Target RPE {exercise.rpe || exercise.target_rpe || "-"}
                                                    </div>
                                                </div>
                                                <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                                                    <div className="text-xs uppercase tracking-wide text-slate-500">Target Load</div>
                                                    <div className="mt-2 text-lg font-semibold text-white">
                                                        {Number.isFinite(Number(exercise.target_weight))
                                                            ? `${exercise.target_weight} kg`
                                                            : protectiveMode
                                                                ? "Very light"
                                                                : "Auto"}
                                                    </div>
                                                    <div className="mt-1 text-xs text-slate-400">
                                                        {protectiveMode ? "Protective prescription active" : "Set-by-set weight logging"}
                                                    </div>
                                                </div>
                                                <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                                                    <div className="text-xs uppercase tracking-wide text-slate-500">Current Volume</div>
                                                    <div className="mt-2 text-lg font-semibold text-white">{sessionVolume} kg</div>
                                                    <div className="mt-1 text-xs text-slate-400">Based on logged reps x weight</div>
                                                </div>
                                                <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                                                    <div className="text-xs uppercase tracking-wide text-slate-500">Sets Logged</div>
                                                    <div className="mt-2 flex items-center gap-2">
                                                        <button
                                                            className="h-8 w-8 rounded-lg bg-slate-700 text-lg font-bold text-white hover:bg-slate-600"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                resizeSetEntries(exerciseIndex, state.setEntries.length - 1);
                                                            }}
                                                        >
                                                            -
                                                        </button>
                                                        <div className="flex h-8 w-12 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 font-bold text-white">
                                                            {state.setEntries.length}
                                                        </div>
                                                        <button
                                                            className="h-8 w-8 rounded-lg bg-slate-700 text-lg font-bold text-white hover:bg-slate-600"
                                                            onClick={(event) => {
                                                                event.stopPropagation();
                                                                resizeSetEntries(exerciseIndex, state.setEntries.length + 1);
                                                            }}
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {(exercise.notes || protectiveMode) && (
                                                <div className={clsx(
                                                    "rounded-xl border p-3 text-sm",
                                                    protectiveMode
                                                        ? "border-amber-900/40 bg-amber-950/20 text-amber-200"
                                                        : "border-slate-700 bg-slate-900/60 text-slate-300"
                                                )}>
                                                    {exercise.notes || "Keep load light and pain-free for this slot."}
                                                </div>
                                            )}

                                            <div className="flex flex-wrap gap-2 rounded-xl border border-slate-700 bg-slate-900/60 p-3">
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        applySetOneToAll(exerciseIndex);
                                                    }}
                                                    className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-emerald-500 hover:text-emerald-300"
                                                >
                                                    Copy set 1 to all
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        nudgeAllSetValues(exerciseIndex, "weight", 2.5);
                                                    }}
                                                    className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-500 hover:text-blue-300"
                                                >
                                                    +2.5 kg all
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        nudgeAllSetValues(exerciseIndex, "reps", 1);
                                                    }}
                                                    className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-blue-500 hover:text-blue-300"
                                                >
                                                    +1 rep all
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        nudgeAllSetValues(exerciseIndex, "rpe", 0.5);
                                                    }}
                                                    className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-amber-500 hover:text-amber-300"
                                                >
                                                    +0.5 RPE all
                                                </button>
                                            </div>

                                            <div className="overflow-hidden rounded-xl border border-slate-700">
                                                <div className="hidden gap-3 border-b border-slate-700 bg-slate-900/90 px-3 py-2 text-xs uppercase tracking-wide text-slate-500 md:grid md:grid-cols-[80px,1fr,1fr,1fr]">
                                                    <div>Set</div>
                                                    <div>Reps</div>
                                                    <div>Weight (kg)</div>
                                                    <div>RPE</div>
                                                </div>
                                                <div className="space-y-2 bg-slate-950/30 p-3">
                                                    {state.setEntries.map((entry, setIndex) => (
                                                        <div
                                                            key={`set-${exerciseIndex}-${setIndex}`}
                                                            className="grid gap-3 md:grid-cols-[80px,1fr,1fr,1fr]"
                                                        >
                                                            <div className="flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
                                                                Set {setIndex + 1}
                                                            </div>
                                                            <input
                                                                type="number"
                                                                min={1}
                                                                max={100}
                                                                value={entry.reps}
                                                                onClick={(event) => event.stopPropagation()}
                                                                onChange={(event) => setEntryValue(exerciseIndex, setIndex, "reps", Number(event.target.value))}
                                                                className="h-11 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-white outline-none focus:border-emerald-500"
                                                                placeholder="Reps"
                                                            />
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                max={500}
                                                                step="0.5"
                                                                value={entry.weight}
                                                                onClick={(event) => event.stopPropagation()}
                                                                onChange={(event) => setEntryValue(exerciseIndex, setIndex, "weight", Number(event.target.value))}
                                                                className="h-11 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-white outline-none focus:border-emerald-500"
                                                                placeholder="Weight"
                                                            />
                                                            <input
                                                                type="number"
                                                                min={1}
                                                                max={10}
                                                                step="0.5"
                                                                value={entry.rpe}
                                                                onClick={(event) => event.stopPropagation()}
                                                                onChange={(event) => setEntryValue(exerciseIndex, setIndex, "rpe", Number(event.target.value))}
                                                                className="h-11 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-white outline-none focus:border-emerald-500"
                                                                placeholder="RPE"
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="grid gap-3 md:grid-cols-2">
                                                <div>
                                                    <div className="mb-1.5 flex items-center justify-between">
                                                        <label className="text-xs text-slate-500">Difficulty</label>
                                                        <span className="text-xs font-semibold text-slate-300">{state.difficulty}/10</span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="1"
                                                        max="10"
                                                        value={state.difficulty}
                                                        onClick={(event) => event.stopPropagation()}
                                                        onChange={(event) => setExerciseMeta(exerciseIndex, { difficulty: Number(event.target.value) })}
                                                        className="h-2 w-full cursor-pointer appearance-none rounded-full accent-blue-500"
                                                    />
                                                </div>
                                                <div>
                                                    <div className="mb-1.5 flex items-center justify-between">
                                                        <label className="text-xs text-slate-500">Pain Level</label>
                                                        <span className={clsx(
                                                            "rounded px-2 py-0.5 text-xs font-bold",
                                                            state.painLevel === 0 && "bg-emerald-950/30 text-emerald-400",
                                                            state.painLevel > 0 && state.painLevel <= 3 && "bg-amber-950/30 text-amber-400",
                                                            state.painLevel > 3 && state.painLevel <= 6 && "bg-orange-950/30 text-orange-400",
                                                            state.painLevel > 6 && "bg-rose-950/30 text-rose-400"
                                                        )}>
                                                            {state.painLevel}/10
                                                        </span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="10"
                                                        value={state.painLevel}
                                                        onClick={(event) => event.stopPropagation()}
                                                        onChange={(event) => setExerciseMeta(exerciseIndex, { painLevel: Number(event.target.value) })}
                                                        className="h-2 w-full cursor-pointer appearance-none rounded-full accent-rose-500"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid gap-3 md:grid-cols-2">
                                                <div>
                                                    <label className="mb-1.5 block text-xs text-slate-500">Exercise Notes</label>
                                                    <textarea
                                                        value={state.notes}
                                                        onClick={(event) => event.stopPropagation()}
                                                        onChange={(event) => setExerciseMeta(exerciseIndex, { notes: event.target.value })}
                                                        rows={3}
                                                        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                                                        placeholder="How did this feel? Any joint stress or tempo notes?"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="mb-1.5 block text-xs text-slate-500">Skip Reason</label>
                                                    <textarea
                                                        value={state.skipReason}
                                                        onClick={(event) => event.stopPropagation()}
                                                        onChange={(event) => setExerciseMeta(exerciseIndex, { skipReason: event.target.value })}
                                                        rows={3}
                                                        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
                                                        placeholder="If you skip, this gets stored for later review."
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex gap-2">
                                                <button
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        markExerciseDone(exerciseIndex);
                                                    }}
                                                    disabled={submitting === exerciseIndex}
                                                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition-all hover:bg-emerald-500 disabled:opacity-50"
                                                >
                                                    {submitting === exerciseIndex ? (
                                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                                    ) : (
                                                        <>
                                                            <CheckCircle2 className="h-4 w-4" />
                                                            Log Exercise
                                                        </>
                                                    )}
                                                </button>
                                                <button
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        skipExercise(exerciseIndex);
                                                    }}
                                                    disabled={submitting === exerciseIndex}
                                                    className="flex items-center gap-1.5 rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition-all hover:bg-slate-600 disabled:opacity-50"
                                                >
                                                    <SkipForward className="h-4 w-4" />
                                                    Skip
                                                </button>
                                                <button
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        setReplaceIndex(exerciseIndex);
                                                        setReplaceModalOpen(true);
                                                    }}
                                                    disabled={submitting === exerciseIndex}
                                                    className="flex items-center gap-1.5 rounded-xl bg-violet-600/20 px-4 py-2.5 text-sm font-medium text-violet-400 transition-all hover:bg-violet-600/40 disabled:opacity-50"
                                                >
                                                    <RefreshCw className="h-4 w-4" />
                                                    Replace
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {workoutFinished && data?.workout?.exercises?.length > 0 && (
                    <div className="px-4 pb-4">
                        <button
                            onClick={finishWorkout}
                            className="flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-emerald-600 to-blue-600 py-4 text-lg font-bold text-white shadow-lg shadow-emerald-500/20 transition-all hover:from-emerald-500 hover:to-blue-500"
                        >
                            <Trophy className="h-6 w-6" />
                            Finish Workout and Generate Next Day
                        </button>
                    </div>
                )}

                {!workoutFinished && data?.workout && (
                    <div className="px-4 pb-4">
                        <button
                            onClick={() => setAddModalOpen(true)}
                            className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 py-3 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:bg-slate-700"
                        >
                            <PlusCircle className="h-5 w-5 text-emerald-400" />
                            Add Custom Exercise
                        </button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="overflow-hidden rounded-xl border border-violet-900/50 bg-slate-900 shadow-[0_0_15px_rgba(139,92,246,0.1)] lg:col-span-2">
                    <div className="flex items-center justify-between border-b border-violet-900/30 bg-slate-800/80 px-4 py-3">
                        <div className="flex items-center gap-2">
                            <Cpu className="h-5 w-5 text-violet-400" />
                            <h3 className="font-semibold text-white">AI Engine Insights</h3>
                        </div>
                        <div className="rounded-full border border-violet-500/30 bg-violet-500/20 px-2 py-1 text-xs text-violet-300">
                            {data?.explainability?.confidence_score}% confident
                        </div>
                    </div>
                    <div className="space-y-3 p-4">
                        <p className="text-slate-300">{data?.explainability?.summary}</p>
                        {(data?.explainability?.ranked_reasons || []).map((reason: any, index: number) => (
                            <div key={`${reason.type}-${index}`} className="flex gap-3 rounded-lg border border-slate-700/50 bg-slate-800/40 p-3">
                                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-xs font-bold text-slate-400">
                                    {reason.priority}
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-violet-300">{reason.type}</p>
                                    <p className="text-sm text-slate-400">{reason.reason}</p>
                                </div>
                            </div>
                        ))}
                        <div className="rounded-lg border border-emerald-900/30 bg-emerald-950/20 p-3">
                            <h4 className="mb-1 text-xs uppercase tracking-wider text-emerald-500/70">Predicted Effect</h4>
                            <p className="text-sm text-emerald-400/90">{data?.explainability?.predicted_effect}</p>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                        <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-800/50 px-4 py-3">
                            <ShieldAlert className="h-5 w-5 text-rose-400" />
                            <h3 className="font-semibold text-white">Injury Monitor</h3>
                        </div>
                        <div className="space-y-3 p-4">
                            <p className="text-sm text-slate-400">
                                {data?.injury_analysis?.summary || "Abhi system ko koi naya injury protection trigger nahi mila."}
                            </p>
                            {(!data?.injury_flags || data.injury_flags.length === 0) ? (
                                <p className="py-4 text-center text-sm text-slate-500">Koi active injury flag nahi hai</p>
                            ) : (
                                data.injury_flags.map((flag: any, index: number) => (
                                    <div key={`${formatFlag(flag)}-${index}`} className="rounded-lg border border-rose-900/40 bg-rose-950/20 p-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium capitalize text-rose-300">{formatFlag(flag)}</span>
                                            <span className="text-xs font-bold text-rose-400">
                                                {flag?.pain != null ? `Pain: ${flag.pain}/10` : "Protect mode"}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                        <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-800/50 px-4 py-3">
                            <TrendingDown className="h-5 w-5 text-amber-400" />
                            <h3 className="font-semibold text-white">Plateau Predictor</h3>
                        </div>
                        <div className="p-4">
                            <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-3">
                                <div className="mb-3 flex items-center justify-between">
                                    <span className="text-sm font-medium text-amber-300">{data?.plateau_metrics?.muscle}</span>
                                    <span className="rounded bg-amber-950/50 px-2 py-1 text-xs text-amber-400/70">
                                        {data?.plateau_metrics?.risk} Risk
                                    </span>
                                </div>
                                <p className="mb-3 text-sm text-slate-400">
                                    {data?.plateau_analysis?.summary || "Plateau detector abhi data observe kar raha hai."}
                                </p>
                                <div className="space-y-1.5 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Vol. Slope</span>
                                        <span className="text-emerald-400">{formatSlopeValue(data?.plateau_metrics?.volSlope)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Perf. Slope</span>
                                        <span className="text-rose-400">{formatSlopeValue(data?.plateau_metrics?.perfSlope)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Fatigue Slope</span>
                                        <span className="text-amber-400">{formatSlopeValue(data?.plateau_metrics?.fatSlope)}</span>
                                    </div>
                                </div>
                                <div className="mt-3 rounded bg-amber-950/30 p-2 font-mono text-xs text-amber-400/80">
                                    STATUS: {data?.plateau_metrics?.status}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                        <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-800/50 px-4 py-3">
                            <Activity className="h-5 w-5 text-cyan-400" />
                            <h3 className="font-semibold text-white">Mesocycle and Fatigue</h3>
                        </div>
                        <div className="space-y-3 p-4">
                            <div className="rounded-lg border border-cyan-900/30 bg-cyan-950/20 p-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium capitalize text-cyan-300">
                                        {data?.mesocycle_analysis?.phase || "accumulation"}
                                    </span>
                                    <span className="text-xs text-cyan-200">
                                        Week {data?.mesocycle_analysis?.week || 1}/{data?.mesocycle_analysis?.totalWeeks || 4}
                                    </span>
                                </div>
                                <p className="mt-2 text-sm text-slate-300">
                                    {data?.mesocycle_analysis?.summary || "Mesocycle engine abhi base block chala raha hai."}
                                </p>
                            </div>

                            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="text-sm font-medium text-white">Fatigue Engine</span>
                                    <span className="text-xs text-slate-400">
                                        Readiness {data?.fatigue_analysis?.readiness ?? 100}%
                                    </span>
                                </div>
                                <p className="text-sm text-slate-400">
                                    {data?.fatigue_analysis?.summary || "Fatigue engine recovery aur workload ko track karta hai."}
                                </p>
                                {(data?.fatigue_analysis?.topMuscles || []).length > 0 && (
                                    <div className="mt-3 space-y-2">
                                        {data.fatigue_analysis.topMuscles.map((item: any) => (
                                            <div key={item.muscle} className="flex items-center justify-between rounded bg-slate-900/70 px-3 py-2 text-sm">
                                                <span className="capitalize text-slate-300">{String(item.muscle).replace(/_/g, " ")}</span>
                                                <span className="font-semibold text-amber-300">{item.level}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <ReplaceExerciseModal
                isOpen={replaceModalOpen}
                onClose={() => {
                    setReplaceModalOpen(false);
                    setReplaceIndex(null);
                }}
                workoutId={data?.workout?.workoutId}
                exerciseIndex={replaceIndex}
                onReplaced={fetchUserData}
            />
            <AddExerciseModal
                isOpen={addModalOpen}
                onClose={() => setAddModalOpen(false)}
                workoutId={data?.workout?.workoutId}
                onAdded={fetchUserData}
            />
        </div>
    );
}


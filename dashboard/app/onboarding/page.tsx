"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Dumbbell, Activity, ShieldPlus } from "lucide-react";
import clsx from "clsx";

const API_URL = "http://localhost:5000";
const EQUIPMENT_OPTIONS = ["barbell", "dumbbell", "machine", "cable", "bodyweight", "bands"];
const INJURY_OPTIONS = ["shoulders", "knees", "lower_back", "elbows"];

type InjuryFlag = {
  muscle: string;
  active: boolean;
  pain: number;
  timestamp: string;
};

export default function Onboarding() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    gender: "male",
    age: 24,
    weight: 72,
    height: 172,
    goal: "hypertrophy",
    experience: "beginner",
    training_days_per_week: 4,
    equipment: ["bodyweight"],
    injury_flags: [] as InjuryFlag[]
  });

  const setField = (field: string, value: string | number | string[] | InjuryFlag[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleEquipment = (item: string) => {
    setFormData((prev) => ({
      ...prev,
      equipment: prev.equipment.includes(item)
        ? prev.equipment.filter((value) => value !== item)
        : [...prev.equipment, item]
    }));
  };

  const toggleInjury = (joint: string) => {
    const exists = formData.injury_flags.some((flag) => flag.muscle === joint);
    setFormData((prev) => ({
      ...prev,
      injury_flags: exists
        ? prev.injury_flags.filter((flag) => flag.muscle !== joint)
        : [
            ...prev.injury_flags,
            { muscle: joint, active: true, pain: 5, timestamp: new Date().toISOString() }
          ]
    }));
  };

  const goNext = () => {
    if (step === 1 && !formData.name.trim()) {
      setError("User name mandatory hai. Pehle athlete ka naam dalo.");
      return;
    }

    setError("");
    setStep((prev) => Math.min(3, prev + 1));
  };

  const goBack = () => {
    setError("");
    setStep((prev) => Math.max(1, prev - 1));
  };

  const generateProgram = async () => {
    if (!formData.name.trim()) {
      setError("User name mandatory hai.");
      setStep(1);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const existingUserId = localStorage.getItem("fitness_ai_userId");
      const res = await fetch(`${API_URL}/users/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: existingUserId,
          ...formData,
          name: formData.name.trim(),
          email: formData.email.trim()
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Onboarding failed");
      }

      const profile = {
        id: data.user.id || data.user._id,
        name: data.user.name,
        email: data.user.email,
        gender: data.user.gender,
        age: data.user.age,
        weight: data.user.weight,
        height: data.user.height,
        goal: data.user.goal,
        experience: data.user.experience,
        training_days_per_week: data.user.training_days_per_week,
        equipment: data.user.equipment || [],
        injury_flags: data.user.injury_flags || []
      };

      localStorage.setItem("fitness_ai_userId", profile.id);
      localStorage.setItem("fitness_ai_profile", JSON.stringify(profile));
      localStorage.setItem("fitness_ai_program", JSON.stringify(data.program || []));

      router.push("/dashboard");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not initialize program");
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl py-10">
      <div className="mb-10 text-center">
        <Dumbbell className="mx-auto mb-4 h-12 w-12 text-emerald-400" />
        <h1 className="mb-2 text-4xl font-bold text-white">Build Your Athlete Profile</h1>
        <p className="text-slate-400">
          Naam se start karo, baseline set karo, aur phir dashboard pe real workout load karo.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <div className="mb-8 flex items-center gap-3">
          {[1, 2, 3].map((current) => (
            <div key={current} className="flex flex-1 items-center gap-3">
              <div
                className={clsx(
                  "flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold",
                  current <= step
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                    : "border-slate-700 bg-slate-800 text-slate-500"
                )}
              >
                {current}
              </div>
              {current < 3 && (
                <div
                  className={clsx(
                    "h-1 flex-1 rounded-full",
                    current < step ? "bg-emerald-500/70" : "bg-slate-800"
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="border-b border-slate-800 pb-2 text-xl font-semibold text-white">
                Athlete Identity
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Yeh step product ka real start hai. Naam aur physical baseline yahin se store hoga.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-400">User Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setField("name", e.target.value)}
                  placeholder="Raunak"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none transition focus:border-emerald-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-400">
                  Email (optional, for persistent identity)
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setField("email", e.target.value)}
                  placeholder="raunak@example.com"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none transition focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-400">Gender</label>
                <select
                  value={formData.gender}
                  onChange={(e) => setField("gender", e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none transition focus:border-emerald-500"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-400">Age</label>
                <input
                  type="number"
                  min={13}
                  value={formData.age}
                  onChange={(e) => setField("age", Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none transition focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-400">Weight (kg)</label>
                <input
                  type="number"
                  min={30}
                  value={formData.weight}
                  onChange={(e) => setField("weight", Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none transition focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-400">Height (cm)</label>
                <input
                  type="number"
                  min={120}
                  value={formData.height}
                  onChange={(e) => setField("height", Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none transition focus:border-emerald-500"
                />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="border-b border-slate-800 pb-2 text-xl font-semibold text-white">
                Training Architecture
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Goal, level aur weekly split decide karte hi engine actual plan build karega.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-400">Primary Goal</label>
              <div className="grid grid-cols-2 gap-3">
                {["strength", "hypertrophy", "fatloss", "hybrid"].map((goal) => (
                  <button
                    key={goal}
                    onClick={() => setField("goal", goal)}
                    className={clsx(
                      "rounded-xl border p-3 text-left capitalize transition-all",
                      formData.goal === goal
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                        : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600"
                    )}
                  >
                    {goal}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-400">Experience</label>
              <div className="grid grid-cols-3 gap-3">
                {["beginner", "intermediate", "advanced"].map((exp) => (
                  <button
                    key={exp}
                    onClick={() => setField("experience", exp)}
                    className={clsx(
                      "rounded-xl border p-3 text-center capitalize transition-all",
                      formData.experience === exp
                        ? "border-cyan-500 bg-cyan-500/15 text-cyan-300"
                        : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600"
                    )}
                  >
                    {exp}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-400">Training Days Per Week</label>
              <div className="grid grid-cols-4 gap-3">
                {[3, 4, 5, 6].map((days) => (
                  <button
                    key={days}
                    onClick={() => setField("training_days_per_week", days)}
                    className={clsx(
                      "rounded-xl border p-3 text-center transition-all",
                      formData.training_days_per_week === days
                        ? "border-violet-500 bg-violet-500/15 text-violet-300"
                        : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600"
                    )}
                  >
                    <div className="text-xl font-bold">{days}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {days === 3 ? "Full Body" : days === 4 ? "Upper / Lower" : days === 5 ? "PPL +" : "PPL x2"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="flex items-center gap-2 border-b border-slate-800 pb-2 text-xl font-semibold text-white">
                <ShieldPlus className="h-5 w-5 text-rose-400" />
                Readiness and Constraints
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Equipment aur injury flags bhi store honge taaki dashboard actual usable ho.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-400">Available Equipment</label>
              <div className="flex flex-wrap gap-2">
                {EQUIPMENT_OPTIONS.map((item) => (
                  <button
                    key={item}
                    onClick={() => toggleEquipment(item)}
                    className={clsx(
                      "rounded-full border px-4 py-2 text-sm capitalize transition-all",
                      formData.equipment.includes(item)
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                        : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
              <label className="mb-2 block text-sm font-medium text-rose-300">
                Active joint / injury flags
              </label>
              <div className="flex flex-wrap gap-2">
                {INJURY_OPTIONS.map((joint) => {
                  const active = formData.injury_flags.some((flag) => flag.muscle === joint);
                  return (
                    <button
                      key={joint}
                      onClick={() => toggleInjury(joint)}
                      className={clsx(
                        "rounded-full border px-4 py-2 text-sm capitalize transition-all",
                        active
                          ? "border-rose-500 bg-rose-500/15 text-rose-300"
                          : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600"
                      )}
                    >
                      {joint.replace("_", " ")}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-xl border border-rose-900/50 bg-rose-950/20 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          <button
            onClick={goBack}
            disabled={step === 1 || loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          {step < 3 ? (
            <button
              onClick={goNext}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
            >
              Continue
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={generateProgram}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Generating final dashboard..." : "Save Profile & Launch"}
              <Activity className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

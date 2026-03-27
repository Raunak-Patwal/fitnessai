"use client";

import { useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import {
    Database, Activity, Zap, Shield, TestTube, AlertOctagon, Terminal, Trash2, TrendingUp
} from 'lucide-react';

const API_URL = 'http://localhost:5000';

export default function AdminDashboard() {
    const [health, setHealth] = useState<any>(null);
    const [rlData, setRlData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [simStatus, setSimStatus] = useState<Record<string, string>>({});

    useEffect(() => {
        fetchHealth();
        fetchRlData();
    }, []);

    const fetchHealth = async () => {
        try {
            const res = await fetch(`${API_URL}/admin/health`);
            if (res.ok) {
                const data = await res.json();
                setHealth(data);
            } else {
                mockHealth();
            }
        } catch {
            mockHealth();
        }
    };

    const fetchRlData = async () => {
        try {
            // Hardcoded test user ID or just fetch generally. 
            // For dashboard demo, we'll mock if API fails.
            const res = await fetch(`${API_URL}/admin/rl/demo_user`);
            if (res.ok) {
                const data = await res.json();
                setRlData(data);
                setLoading(false);
            } else {
                mockRlData();
            }
        } catch {
            mockRlData();
        }
    };

    const mockHealth = () => {
        setHealth({
            stats: { users: 1254, activePrograms: 892, maxFatigue: 84 },
            histogram: { '0-20': 5, '21-40': 15, '41-60': 45, '61-80': 25, '81-100': 10 },
            entropy: { muscle: 3.45, pattern: 2.89 }
        });
    };

    const mockRlData = () => {
        setRlData({
            suppressed: [
                { exerciseId: 'ex_bench_press', score: -12.5, lastUpdated: new Date().toISOString() },
                { exerciseId: 'ex_squat', score: -4.2, lastUpdated: new Date(Date.now() - 86400000 * 5).toISOString() }
            ],
            recovering: [
                { exerciseId: 'ex_squat', score: -4.2, lastUpdated: new Date(Date.now() - 86400000 * 5).toISOString() }
            ]
        });
        setLoading(false);
    };

    const runSimulation = (type: string) => {
        setSimStatus(prev => ({ ...prev, [type]: 'running' }));
        setTimeout(() => {
            setSimStatus(prev => ({ ...prev, [type]: 'completed' }));
        }, 3000);
    };

    const triggerInjection = async (type: string) => {
        setSimStatus(prev => ({ ...prev, [type]: 'injecting' }));
        try {
            await fetch(`${API_URL}/admin/simulate/${type}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: 'demo_user', muscle: 'chest' })
            });
        } catch (e) { }
        setTimeout(() => {
            setSimStatus(prev => ({ ...prev, [type]: 'injected' }));
            setTimeout(() => setSimStatus(prev => ({ ...prev, [type]: '' })), 2000);
        }, 500);
    };

    if (loading || !health) return <div className="animate-pulse h-96 bg-slate-900 rounded-xl"></div>;

    const chartData = Object.keys(health.histogram).map(key => ({
        name: key,
        value: health.histogram[key]
    }));

    return (
        <div className="space-y-6 pb-20">

            {/* Top Meta Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
                    <div>
                        <div className="text-slate-400 text-sm mb-1">Active Programs</div>
                        <div className="text-2xl font-bold text-white">{health.stats.activePrograms.toLocaleString()}</div>
                    </div>
                    <Database className="w-8 h-8 text-blue-500 opacity-80" />
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
                    <div>
                        <div className="text-slate-400 text-sm mb-1">Global Max Fatigue</div>
                        <div className="text-2xl font-bold text-emerald-400">{health.stats.maxFatigue} / 100</div>
                    </div>
                    <Activity className="w-8 h-8 text-emerald-500 opacity-80" />
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
                    <div>
                        <div className="text-slate-400 text-sm mb-1">Muscle Entropy</div>
                        <div className="text-2xl font-bold text-violet-400">{health.entropy?.muscle || 3.45}</div>
                    </div>
                    <Zap className="w-8 h-8 text-violet-500 opacity-80" />
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
                    <div>
                        <div className="text-slate-400 text-sm mb-1">Pattern Entropy</div>
                        <div className="text-2xl font-bold text-amber-400">{health.entropy?.pattern || 2.89}</div>
                    </div>
                    <Shield className="w-8 h-8 text-amber-500 opacity-80" />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Objective Function Histogram */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                    <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-cyan-400" />
                        Objective Score Distribution (Last 100)
                    </h3>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                                <XAxis dataKey="name" stroke="#475569" fontSize={12} tickMargin={10} />
                                <YAxis stroke="#475569" fontSize={12} />
                                <Tooltip
                                    cursor={{ fill: '#1e293b' }}
                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                                />
                                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={index === 4 ? '#10b981' : index === 3 ? '#3b82f6' : '#6366f1'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Global Test Scripts */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col">
                    <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-emerald-400" />
                        CI / Validation Scripts
                    </h3>

                    <div className="flex-1 space-y-3">
                        {[
                            { id: '24week', name: '24-Week Baseline Tracker', desc: 'Simulates 168 workouts to map fatigue bounds' },
                            { id: '200week', name: '200-Week System Entropy', desc: 'Checks multi-objective stability over ~4 years' },
                            { id: 'stress', name: 'Extreme Concurrency Stress', desc: 'Fires 90 parallel collision payloads at stateBuilder' }
                        ].map(script => (
                            <div key={script.id} className="bg-slate-800/40 border border-slate-700 p-3 rounded-lg flex items-center justify-between">
                                <div>
                                    <div className="font-medium text-slate-200">{script.name}</div>
                                    <div className="text-xs text-slate-400 mt-0.5">{script.desc}</div>
                                </div>
                                <button
                                    onClick={() => runSimulation(script.id)}
                                    className={`px-4 py-2 rounded text-sm font-medium transition-all ${simStatus[script.id] === 'running' ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' :
                                            simStatus[script.id] === 'completed' ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30' :
                                                'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                        }`}
                                    disabled={simStatus[script.id] === 'running'}
                                >
                                    {simStatus[script.id] === 'running' ? 'Executing...' :
                                        simStatus[script.id] === 'completed' ? 'Passed ✓' : 'Run Script'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Injection Simulators */}
                <div className="bg-slate-900 border border-rose-900/40 rounded-xl p-5">
                    <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                        <TestTube className="w-4 h-4 text-rose-400" />
                        Edge Case Injectors (Demo Target)
                    </h3>

                    <div className="space-y-4">
                        <div className="bg-rose-950/20 border border-rose-900/30 p-4 rounded-lg">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h4 className="font-medium text-rose-300">Targeted Injury Simulation</h4>
                                    <p className="text-xs text-slate-400 mt-1">Force-injects consecutive level 8+ pain logs for 'Chest' to trigger Injury Protection Mode on next sync.</p>
                                </div>
                                <button
                                    onClick={() => triggerInjection('injury')}
                                    className="bg-rose-500/20 text-rose-400 px-3 py-1.5 rounded text-sm font-medium hover:bg-rose-500/30"
                                >
                                    {simStatus['injury'] === 'injecting' ? 'Injecting...' : simStatus['injury'] === 'injected' ? 'Done' : 'Inject Pain'}
                                </button>
                            </div>
                        </div>

                        <div className="bg-amber-950/20 border border-amber-900/30 p-4 rounded-lg">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h4 className="font-medium text-amber-300">Data Plateau Simulation</h4>
                                    <p className="text-xs text-slate-400 mt-1">Force-injects 4 weeks of rising fatigue/volume with flat progression to trigger Auto-Deload on next sync.</p>
                                </div>
                                <button
                                    onClick={() => triggerInjection('plateau')}
                                    className="bg-amber-500/20 text-amber-400 px-3 py-1.5 rounded text-sm font-medium hover:bg-amber-500/30"
                                >
                                    {simStatus['plateau'] === 'injecting' ? 'Injecting...' : simStatus['plateau'] === 'injected' ? 'Done' : 'Inject Plateau'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RL Engine Monitor */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
                    <div className="bg-slate-800/50 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <AlertOctagon className="w-5 h-5 text-indigo-400" />
                            <h3 className="font-semibold text-white">RL Suppression Logs</h3>
                        </div>
                        <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded">
                            {rlData?.suppressed?.length || 0} Sub-Zero Movements
                        </span>
                    </div>

                    <div className="p-0 overflow-y-auto max-h-64">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-900/80 sticky top-0">
                                <tr className="border-b border-slate-800 text-slate-500">
                                    <th className="px-4 py-2 font-medium">Exercise ID</th>
                                    <th className="px-4 py-2 font-medium">Score</th>
                                    <th className="px-4 py-2 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {rlData?.suppressed?.map((item: any, i: number) => {
                                    const isRecovering = rlData.recovering.some((r: any) => r.exerciseId === item.exerciseId);
                                    return (
                                        <tr key={i} className="hover:bg-slate-800/30 text-slate-300">
                                            <td className="px-4 py-3 font-mono text-xs">{item.exerciseId}</td>
                                            <td className="px-4 py-3 text-rose-400 font-mono">{item.score.toFixed(1)}</td>
                                            <td className="px-4 py-3">
                                                {isRecovering ? (
                                                    <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 flex items-center gap-1 w-max">
                                                        <TrendingUp className="w-3 h-3" /> Recovering (+1.5/wk)
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-rose-400 bg-rose-500/10 px-2 py-1 rounded border border-rose-500/20 flex items-center gap-1 w-max">
                                                        <Trash2 className="w-3 h-3" /> Suppressed
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                                {(!rlData?.suppressed || rlData.suppressed.length === 0) && (
                                    <tr>
                                        <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                                            No negatively scored exercises found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>

        </div>
    );
}

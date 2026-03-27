import UserDashboard from '@/components/UserDashboard';

export default function DashboardPage() {
    return (
        <div className="w-full">
            <header className="mb-8">
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
                    Athlete Intelligence
                </h1>
                <p className="text-slate-400 mt-2">Real-time Predictive Modeling & Safety Engine</p>
            </header>

            <UserDashboard />
        </div>
    );
}

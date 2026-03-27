import AdminDashboard from '@/components/AdminDashboard';

export default function AdminPage() {
    return (
        <div className="w-full">
            <header className="mb-8">
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-rose-400 to-orange-400">
                    Global Operations
                </h1>
                <p className="text-slate-400 mt-2">Systemic Audits, Simulators, and Engine Health</p>
            </header>

            <AdminDashboard />
        </div>
    );
}

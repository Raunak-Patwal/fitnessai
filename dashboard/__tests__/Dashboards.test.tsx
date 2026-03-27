import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import UserDashboard from '../components/UserDashboard';
import AdminDashboard from '../components/AdminDashboard';

// Mock recharts to avoid rendering issues in JSDOM
jest.mock('recharts', () => {
    const OriginalModule = jest.requireActual('recharts');
    return {
        ...OriginalModule,
        ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
        BarChart: () => <div data-testid="barchart" />,
    };
});

// Mock fetch
global.fetch = jest.fn(() =>
    Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
            stats: { users: 1, activePrograms: 1, maxFatigue: 1 },
            histogram: { '0-20': 1 },
            entropy: { muscle: 1, pattern: 1 },
            suppressed: [],
            recovering: []
        })
    })
) as jest.Mock;

describe('Fitness AI Next.js Dashboards', () => {

    describe('User Dashboard', () => {
        it('renders loader initially', () => {
            const { container } = render(<UserDashboard />);
            expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
        });

        it('Scenario 1: Plateau UI renders correctly with triggers', async () => {
            render(<UserDashboard />);
            await waitFor(() => {
                expect(screen.getByText('Plateau Predictor')).toBeInTheDocument();
                expect(screen.getByText('chest')).toBeInTheDocument();
                expect(screen.getByText('High Risk')).toBeInTheDocument();
                expect(screen.getByText('Triggered (Pre-Deload active)')).toBeInTheDocument();
            }, { timeout: 3000 });
        });

        it('Scenario 2: Injury Mode Snapshot renders flagged pain items', async () => {
            const { container } = render(<UserDashboard />);
            await waitFor(() => {
                expect(screen.getByText('Injury Monitor')).toBeInTheDocument();
                expect(screen.getByText('8/10')).toBeInTheDocument();
            }, { timeout: 3000 });
            // DOM Snapshot test for Injury scenario
            expect(container.innerHTML).toContain('VOL_REDUCTION_APPLIED');
        });

        it('Explainability priority testing rendering', async () => {
            render(<UserDashboard />);
            await waitFor(() => {
                // Checking if priority reasons loaded correctly
                expect(screen.getByText('Explainability Engine Output')).toBeInTheDocument();
                const reason = screen.getByText(/Emergency safety volume reduction/);
                expect(reason).toBeInTheDocument();
            }, { timeout: 3000 });
        });

        it('Mobile Responsive Checks', async () => {
            const { container } = render(<UserDashboard />);
            await waitFor(() => {
                // Assert grid column behaviors (Tailwind's grid-cols-1 md:grid-cols-4)
                expect(container.innerHTML).toContain('grid-cols-1 md:grid-cols-4');
                expect(container.innerHTML).toContain('grid-cols-1 lg:grid-cols-3');
            }, { timeout: 3000 });
        });
    });

    describe('Admin Dashboard', () => {
        it('Stress re-renders gracefully', async () => {
            const { rerender, container } = render(<AdminDashboard />);
            // Force extreme re-renders
            for (let i = 0; i < 50; i++) {
                rerender(<AdminDashboard />);
            }
            // Assuming it shouldn't crash
            expect(container).toBeInTheDocument();
        });

        it('renders simulation controls', async () => {
            render(<AdminDashboard />);
            await waitFor(() => {
                expect(screen.getByText('CI / Validation Scripts')).toBeInTheDocument();
                expect(screen.getByText('Targeted Injury Simulation')).toBeInTheDocument();
                expect(screen.getByText('Data Plateau Simulation')).toBeInTheDocument();
            }, { timeout: 3000 });
        });
    });

});

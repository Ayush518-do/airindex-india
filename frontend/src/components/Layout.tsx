import { NavLink, Outlet } from 'react-router-dom';
import Aurora from './reactbits/Aurora';
import ShinyText from './reactbits/ShinyText';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/index-trend', label: 'Airfare Index' },
  { to: '/routes', label: 'Route Analytics' },
  { to: '/airlines', label: 'Airline Analytics' },
  { to: '/map', label: 'Network Map' },
  { to: '/booking-window', label: 'Booking Window' },
  { to: '/anomalies', label: 'Anomalies' },
  { to: '/data-quality', label: 'Data Quality' },
  { to: '/methodology', label: 'Methodology' },
];

export default function Layout() {
  return (
    <div className="relative min-h-screen">
      <div className="fixed inset-0 -z-10 opacity-55 pointer-events-none">
        <Aurora colorStops={['#5227FF', '#22d3ee', '#7c5cff']} amplitude={0.9} blend={0.6} speed={0.5} />
      </div>
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-[#07070c]/30 via-[#07070c]/75 to-[#07070c] pointer-events-none" />

      <div className="flex min-h-screen">
        <aside className="w-[232px] shrink-0 border-r border-white/[0.07] bg-[rgba(10,10,18,0.72)] backdrop-blur-xl hidden md:flex md:flex-col">
          <div className="px-5 py-6 border-b border-white/[0.07]">
            <ShinyText
              text="AIRINDEX INDIA"
              className="text-[17px] font-bold tracking-tight"
              color="#c9c6f0"
              shineColor="#ffffff"
              speed={4}
            />
            <p className="text-[11px] text-white/35 mt-1 leading-snug">
              Airfare Price Intelligence
            </p>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
            {NAV.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-[13.5px] transition-colors ${
                    isActive
                      ? 'bg-[#7c5cff]/18 text-white font-medium border border-[#7c5cff]/30'
                      : 'text-white/55 hover:text-white hover:bg-white/[0.05] border border-transparent'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="px-4 py-4 border-t border-white/[0.07]">
            <span className="inline-block text-[10px] font-semibold tracking-wide px-2 py-1 rounded bg-amber-400/15 text-amber-300 border border-amber-400/25">
              DEMONSTRATION DATA
            </span>
            <p className="text-[10.5px] text-white/30 mt-2 leading-relaxed">
              Prototype index — not official MoSPI CPI.
            </p>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <nav className="md:hidden flex gap-1 overflow-x-auto px-4 py-3 border-b border-white/[0.07] bg-[rgba(10,10,18,0.8)] backdrop-blur-xl">
            {NAV.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] ${
                    isActive ? 'bg-[#7c5cff]/20 text-white' : 'text-white/55'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="px-5 md:px-8 py-6 md:py-8 max-w-[1400px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

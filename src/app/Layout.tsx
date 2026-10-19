import { NavLink, Outlet } from 'react-router-dom';
import { HomeIcon, LibraryIcon, SearchIcon } from '@/components/Icons';
import { MiniPlayer } from '@/features/player/MiniPlayer';

const tabs = [
  { to: '/', label: 'Trang chủ', icon: HomeIcon, end: true },
  { to: '/search', label: 'Tìm kiếm', icon: SearchIcon, end: false },
  { to: '/library', label: 'Thư viện', icon: LibraryIcon, end: false },
];

export function Layout() {
  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-y-auto pb-[calc(140px+env(safe-area-inset-bottom))] pt-safe-t">
        <Outlet />
      </main>
      <MiniPlayer />
      <nav
        aria-label="Điều hướng chính"
        className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black via-black/95 to-black/70 pb-safe-b"
      >
        <ul className="mx-auto flex max-w-xl justify-around">
          {tabs.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex min-h-[56px] min-w-[72px] flex-col items-center justify-center gap-1 text-[11px] ${
                    isActive ? 'text-white' : 'text-muted'
                  }`
                }
              >
                <Icon size={24} />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

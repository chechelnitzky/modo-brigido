import { Activity, BarChart3, BookOpen, CalendarDays, ChevronRight, CloudOff, CloudUpload, Dumbbell, Home, LogOut, MoreHorizontal, UtensilsCrossed, X } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSelectedDate } from '../context/SelectedDateContext';
import { useOfflineStatus } from '../hooks/useOfflineStatus';
import { prettyDate } from '../lib/date';
import '../navigation-enhancements.css';

const links = [
  { to: '/', label: 'Hoy', icon: Home },
  { to: '/entreno', label: 'Entreno', icon: Dumbbell },
  { to: '/nutricion', label: 'Nutrición', icon: UtensilsCrossed },
  { to: '/progreso', label: 'Progreso', icon: BarChart3 },
  { to: '/ajustes', label: 'Más', icon: MoreHorizontal }
];

export function Layout() {
  const { profile, signOut } = useAuth();
  const { selectedDate, isToday, resetToToday } = useSelectedDate();
  const location = useLocation();
  const sync = useOfflineStatus();
  const SyncIcon = !sync.online ? CloudOff : sync.syncing || sync.pending > 0 ? CloudUpload : Activity;
  const syncText = !sync.online
    ? `Sin conexión${sync.pending ? ` · ${sync.pending} pendiente${sync.pending === 1 ? '' : 's'}` : ''}`
    : sync.syncing
      ? `Sincronizando${sync.pending ? ` ${sync.pending}` : ''}…`
      : sync.pending > 0
        ? `${sync.pending} cambio${sync.pending === 1 ? '' : 's'} pendiente${sync.pending === 1 ? '' : 's'}`
        : 'Datos sincronizados';

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">MB</div>
          <div><strong>Modo Brígido</strong><span>{profile?.display_name || 'Tu plan diario'}</span></div>
        </div>
        {!isToday && <button type="button" className="global-date-chip" onClick={resetToToday} title="Volver a hoy"><CalendarDays size={15} /><span>{prettyDate(selectedDate)}</span><X size={14} /></button>}
        <button className="icon-button desktop-signout" onClick={signOut} title="Cerrar sesión"><LogOut size={20} /></button>
      </header>

      <main className="content">
        {location.pathname === '/entreno' && <Link className="training-library-shortcut" to="/biblioteca">
          <div className="shortcut-copy"><div className="shortcut-icon"><BookOpen size={20} /></div><div><strong>Biblioteca de ejercicios</strong><span>Explora ejercicios, músculos, equipos y GIFs de ejecución.</span></div></div>
          <ChevronRight className="shortcut-arrow" size={19} />
        </Link>}
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="Navegación principal">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive || (to === '/entreno' && location.pathname === '/biblioteca') ? 'nav-item active' : 'nav-item'}>
            <Icon size={21} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className={!sync.online ? 'offline-badge warning' : sync.pending ? 'offline-badge pending' : 'offline-badge'} title={sync.lastError ?? undefined}>
        <SyncIcon size={15} /> {syncText}
      </div>
    </div>
  );
}

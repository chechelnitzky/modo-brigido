import { Activity, BarChart3, Dumbbell, Home, LogOut, MoreHorizontal, Salad } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const links = [
  { to: '/', label: 'Hoy', icon: Home },
  { to: '/entreno', label: 'Entreno', icon: Dumbbell },
  { to: '/nutricion', label: 'Nutri', icon: Salad },
  { to: '/progreso', label: 'Progreso', icon: BarChart3 },
  { to: '/ajustes', label: 'Más', icon: MoreHorizontal }
];

export function Layout() {
  const { profile, signOut } = useAuth();
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">MB</div>
          <div><strong>Modo Brígido</strong><span>{profile?.display_name || 'Tu plan diario'}</span></div>
        </div>
        <button className="icon-button desktop-signout" onClick={signOut} title="Cerrar sesión"><LogOut size={20} /></button>
      </header>

      <main className="content"><Outlet /></main>

      <nav className="bottom-nav" aria-label="Navegación principal">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <Icon size={21} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="offline-badge"><Activity size={15} /> PWA · datos sincronizados</div>
    </div>
  );
}

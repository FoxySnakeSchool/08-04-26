import React from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import MarchesList     from './pages/MarchesList';
import Dashboard       from './pages/Dashboard';
import Logs            from './pages/Logs';
import Administration  from './pages/Administration';

function Layout({ children }) {
  return (
    <div style={styles.app}>
      <nav style={styles.nav}>
        <span style={styles.logo}>unitee <span style={styles.logoSub}>veille marchés</span></span>
        <div style={styles.navLinks}>
          <NavLink to="/"          style={navStyle} end>Marchés</NavLink>
          <NavLink to="/dashboard" style={navStyle}>Dashboard</NavLink>
          <NavLink to="/logs"      style={navStyle}>Journaux</NavLink>
          <NavLink to="/admin" style={navStyle}>Administration</NavLink>
        </div>
      </nav>
      <main style={styles.main}>{children}</main>
    </div>
  );
}

function MarchesRouter() {
  return (
    <Layout>
      <MarchesList />
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"          element={<MarchesRouter />} />
        <Route path="/dashboard" element={<Layout><Dashboard /></Layout>} />
        <Route path="/logs"      element={<Layout><Logs /></Layout>} />
        <Route path="/admin" element={<Layout><Administration /></Layout>} />
      </Routes>
    </BrowserRouter>
  );
}

const navStyle = ({ isActive }) => ({
  padding: '0.4rem 0.9rem',
  borderRadius: 6,
  textDecoration: 'none',
  fontSize: '0.9rem',
  fontWeight: isActive ? 600 : 400,
  color: isActive ? '#fff' : 'rgba(255,255,255,0.7)',
  background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
});

const styles = {
  app:      { minHeight: '100vh', background: '#f9fafb', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  nav:      { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.5rem', height: 52, background: '#1e3a5f' },
  logo:     { color: '#fff', fontWeight: 700, fontSize: '1rem' },
  logoSub:  { fontWeight: 300, opacity: 0.7, marginLeft: '0.4rem', fontSize: '0.85rem' },
  navLinks: { display: 'flex', gap: '0.25rem' },
  main:     { maxWidth: 1400, margin: '0 auto' },
};

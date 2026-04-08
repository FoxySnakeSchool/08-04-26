import React, { useState, useEffect } from 'react';
import { fetchJson } from '../api';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  Treemap, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

// ─── Palette ─────────────────────────────────────────────────────────────────
const COLORS = ['#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1'];
const PRIO_COLORS = { 'Élevée': '#ef4444', 'Moyenne': '#f59e0b', 'Faible': '#9ca3af' };
const ETAT_COLORS = { 'INITIAL': '#10b981', 'MODIFICATION': '#f59e0b', 'RECTIFICATIF': '#f97316', 'ANNULATION': '#ef4444', 'Non renseigné': '#d1d5db' };

// ─── KPI Card ────────────────────────────────────────────────────────────────
function Kpi({ label, value, sub, accent = '#111827' }) {
  return (
    <div style={s.kpi}>
      <div style={s.kpiLabel}>{label}</div>
      <div style={{ fontSize: '2rem', fontWeight: 800, color: accent, lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={s.kpiSub}>{sub}</div>}
    </div>
  );
}

// ─── Bloc wrapper ────────────────────────────────────────────────────────────
function Bloc({ titre, children, span }) {
  return (
    <div style={{ ...s.bloc, gridColumn: span ? `span ${span}` : undefined }}>
      <div style={s.blocTitre}>{titre}</div>
      {children}
    </div>
  );
}

// ─── Custom tooltip ─────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={s.tooltip}>
      {label && <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || p.fill }}>
          {p.name}: <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
}

// ─── Treemap custom content ─────────────────────────────────────────────────
function TreemapContent({ x, y, width, height, name, nb_marches, poids }) {
  if (width < 40 || height < 30) return null;
  const bg = poids >= 4 ? '#ef4444' : poids >= 3 ? '#f59e0b' : '#2563eb';
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={4}
        style={{ fill: bg, opacity: 0.85, stroke: '#fff', strokeWidth: 2 }} />
      <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle"
        style={{ fill: '#fff', fontSize: Math.min(12, width / 6), fontWeight: 700 }}>
        {name}
      </text>
      <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle"
        style={{ fill: 'rgba(255,255,255,0.7)', fontSize: Math.min(10, width / 8) }}>
        {nb_marches} marchés
      </text>
    </g>
  );
}

// ─── Dashboard ──────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    fetchJson('/dashboard/stats')
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={s.page}><div style={{ padding: '2rem', color: '#6b7280' }}>Chargement du dashboard…</div></div>;
  if (error)   return <div style={s.page}><div style={{ padding: '1rem', background: '#fee2e2', color: '#991b1b', borderRadius: 6 }}>{error}</div></div>;
  if (!data)   return null;

  const { counts: c, parType, parEtat, parDept, distScores, evolution, topMotsCles, topAcheteurs, systeme } = data;

  // Données transformées
  const prioData = [
    { name: 'Élevée',  value: Number(c.priorite_eleve)  },
    { name: 'Moyenne', value: Number(c.priorite_moyen)  },
    { name: 'Faible',  value: Number(c.priorite_faible) },
  ];
  const scoreData = distScores.map(d => ({ tranche: d.tranche, marchés: d.value }));

  // Remplir les 30 jours (même ceux sans import → 0)
  const evoMap = {};
  evolution.forEach(d => { evoMap[d.jour] = d.nb; });
  const evoData = [];
  for (let i = 29; i >= 0; i--) {
    const dt = new Date(); dt.setDate(dt.getDate() - i);
    const key = dt.toISOString().slice(0, 10);
    const label = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
    evoData.push({ jour: label, marchés: evoMap[key] || 0 });
  }

  const deptData  = parDept.map(d => ({ name: d.label, marchés: d.value }));
  const achetData = topAcheteurs.map(d => ({ name: d.label.length > 30 ? d.label.slice(0, 30) + '…' : d.label, marchés: d.value, fullName: d.label }));
  const mcData    = topMotsCles.map(mk => ({ name: mk.terme, nb_marches: mk.nb_marches, poids: mk.poids, occ: mk.total_occurrences }));

  return (
    <div style={s.page}>
      <h2 style={s.h2}>Dashboard <span style={{ fontWeight: 400, fontSize: '0.85rem', color: '#9ca3af' }}>— Vue d'ensemble</span></h2>

      {/* ─── KPIs ──────────────────────────────────────────────────────────── */}
      <div style={s.kpiRow}>
        <Kpi label="Total marchés"        value={c.total} />
        <Kpi label="Priorité élevée"      value={c.priorite_eleve}      accent="#ef4444" sub={`${c.total ? Math.round(c.priorite_eleve / c.total * 100) : 0}% du total`} />
        <Kpi label="Urgents (< 7j)"       value={c.urgents_7j}          accent="#f97316" />
        <Kpi label="Expirés"              value={c.expires}             accent="#6b7280" />
        <Kpi label="Score moyen"          value={c.score_moyen}         accent="#2563eb" sub="/ 100" />
        <Kpi label="Importés aujourd'hui" value={c.importes_aujourdhui} accent="#10b981" sub={`${c.importes_semaine} cette semaine`} />
      </div>

      <div style={s.grid}>

        {/* ─── Évolution imports 30j — Area Chart ─────────────────────────── */}
        <Bloc titre="Imports — 30 derniers jours" span={2}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={evoData}>
              <defs>
                <linearGradient id="colorImports" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="jour" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={4} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} width={35} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="marchés" stroke="#2563eb" strokeWidth={2} fill="url(#colorImports)" />
            </AreaChart>
          </ResponsiveContainer>
        </Bloc>

        {/* ─── Répartition priorité — Donut ───────────────────────────────── */}
        <Bloc titre="Répartition par priorité">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={prioData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} style={{ fontSize: 11 }}>
                {prioData.map(d => <Cell key={d.name} fill={PRIO_COLORS[d.name]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </Bloc>

        {/* ─── Distribution scores — Histogramme ──────────────────────────── */}
        <Bloc titre="Distribution des scores" span={2}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={scoreData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="tranche" tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} width={35} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="marchés" radius={[4, 4, 0, 0]}>
                {scoreData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Bloc>

        {/* ─── Par type — Pie ─────────────────────────────────────────────── */}
        <Bloc titre="Par type de marché">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={parType.map(d => ({ name: d.label, value: d.value }))} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} style={{ fontSize: 11 }}>
                {parType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </Bloc>

        {/* ─── Par état — Pie ─────────────────────────────────────────────── */}
        <Bloc titre="Par état">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={parEtat.map(d => ({ name: d.label, value: d.value }))} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} style={{ fontSize: 11 }}>
                {parEtat.map((d, i) => <Cell key={i} fill={ETAT_COLORS[d.label] || COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </Bloc>

        {/* ─── Top départements — Bar horizontal ──────────────────────────── */}
        <Bloc titre="Top 10 départements" span={2}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={deptData} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: '#374151' }} width={50} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="marchés" fill="#f59e0b" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Bloc>

        {/* ─── Mots-clés — Treemap ────────────────────────────────────────── */}
        <Bloc titre={`Mots-clés détectés (${mcData.length})`} span={3}>
          {mcData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <Treemap data={mcData} dataKey="nb_marches" aspectRatio={4 / 3}
                content={<TreemapContent />} />
            </ResponsiveContainer>
          ) : (
            <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Aucun mot-clé associé</div>
          )}
        </Bloc>

        {/* ─── Top acheteurs — Bar horizontal ─────────────────────────────── */}
        <Bloc titre="Top 10 acheteurs" span={2}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={achetData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#374151' }} width={200} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                return <div style={s.tooltip}><strong>{payload[0]?.payload?.fullName}</strong><div>{payload[0]?.value} marchés</div></div>;
              }} />
              <Bar dataKey="marchés" fill="#1e3a5f" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Bloc>

        {/* ─── Système ────────────────────────────────────────────────────── */}
        <Bloc titre="Système">
          <div style={{ fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={s.sysLabel}>Dernier import</div>
              {systeme.dernier_import
                ? <div>{systeme.dernier_import.message} <span style={{ color: '#9ca3af' }}>— {new Date(systeme.dernier_import.cree_le).toLocaleString('fr-FR')}</span></div>
                : <div style={{ color: '#9ca3af' }}>Aucun</div>}
            </div>
            <div>
              <div style={s.sysLabel}>Dernière erreur</div>
              {systeme.derniere_erreur
                ? <div style={{ color: '#ef4444' }}>{systeme.derniere_erreur.message} <span style={{ color: '#9ca3af' }}>— {new Date(systeme.derniere_erreur.cree_le).toLocaleString('fr-FR')}</span></div>
                : <div style={{ color: '#10b981' }}>Aucune erreur ✓</div>}
            </div>
          </div>
        </Bloc>

      </div>
    </div>
  );
}

const s = {
  page:      { padding: '1.5rem' },
  h2:        { fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.25rem' },
  kpiRow:    { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' },
  kpi:       { background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '1rem 1.25rem' },
  kpiLabel:  { fontSize: '0.72rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 },
  kpiSub:    { fontSize: '0.75rem', color: '#9ca3af', marginTop: 4 },
  grid:      { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' },
  bloc:      { background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '1rem 1.25rem' },
  blocTitre: { fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f3f4f6' },
  tooltip:   { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 12px', fontSize: '0.8rem', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' },
  sysLabel:  { fontSize: '0.72rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 },
};

import React, { useState, useEffect, useCallback } from 'react';
import { fetchJson } from '../api';
import MarcheDetail from './MarcheDetail';

const COLONNES = [
  { key: 'titre',            label: 'Titre' },
  { key: 'acheteur',         label: 'Acheteur' },
  { key: 'departement',      label: 'Dép.' },
  { key: 'score_pertinence', label: 'Score' },
  { key: 'niveau_priorite',  label: 'Priorité' },
  { key: 'date_limite',      label: 'Date limite' },
];

const PRIORITE_BADGE = {
  eleve:  { background: '#fde8e8', color: '#c81e1e', label: 'Élevé'  },
  moyen:  { background: '#fef3c7', color: '#92400e', label: 'Moyen'  },
  faible: { background: '#e5e7eb', color: '#374151', label: 'Faible' },
};

export default function MarchesList() {
  const [marches, setMarches]     = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [sortKey, setSortKey]     = useState(null);
  const [sortDir, setSortDir]     = useState('desc');
  const [filters, setFilters] = useState({
    priorite: '',
    departement: '',
    dateLimiteMin: new Date().toISOString().split('T')[0],
    masquerSansDate: true,
  });
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId]   = useState(null);
  const LIMIT = 30;

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page, limit: LIMIT,
        ...(filters.priorite      && { priorite:      filters.priorite }),
        ...(filters.departement   && { departement:   filters.departement }),
        ...(filters.dateLimiteMin && { dateLimiteMin: filters.dateLimiteMin }),
        ...(filters.masquerSansDate && { masquerSansDate: '1' }),
        ...(sortKey && { sort: sortKey, dir: sortDir }),
      });
      const data = await fetchJson(`/marches?${params}`);
      setMarches(data.data);
      setTotal(data.total);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, sortKey, sortDir, filters]);

  useEffect(() => { charger(); }, [charger]);

  function toggleSort(key) {
    if (sortKey !== key) { setSortKey(key); setSortDir('desc'); }        // 1er clic : tri desc
    else if (sortDir === 'desc') { setSortDir('asc'); }                  // 2e clic : tri asc
    else { setSortKey(null); setSortDir('desc'); }                       // 3e clic : pas de tri
  }

  function setFilter(k, v) {
    setFilters(f => ({ ...f, [k]: v }));
    setPage(1);
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={styles.container}>
      <h2 style={styles.titre}>Marchés publics <span style={styles.badge}>{total}</span></h2>

      {/* Filtres */}
      <div style={styles.filtres}>
        <select value={filters.priorite} onChange={e => setFilter('priorite', e.target.value)} style={styles.select}>
          <option value="">Toutes priorités</option>
          <option value="eleve">Élevé</option>
          <option value="moyen">Moyen</option>
          <option value="faible">Faible</option>
        </select>
        <input
          placeholder="Département (ex: 35)..."
          value={filters.departement}
          onChange={e => setFilter('departement', e.target.value)}
          style={{ ...styles.input, width: 160 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <label style={{ fontSize: '0.8rem', color: '#6b7280', whiteSpace: 'nowrap' }}>Date limite min</label>
          <input
            type="date"
            value={filters.dateLimiteMin}
            onChange={e => setFilter('dateLimiteMin', e.target.value)}
            style={styles.input}
          />
          <button
            onClick={() => setFilter('dateLimiteMin', '')}
            title="Effacer le filtre date"
            style={{ ...styles.btn, background: '#6b7280', padding: '0.4rem 0.5rem' }}
          >✕</button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: '#374151', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={filters.masquerSansDate}
            onChange={e => setFilter('masquerSansDate', e.target.checked)}
          />
          Masquer sans date
        </label>
        <button onClick={charger} style={styles.btn}>↺ Rafraîchir</button>
      </div>

      {error && <div style={styles.erreur}>{error}</div>}
      {loading && <div style={styles.loading}>Chargement...</div>}

      {/* Table */}
      <div style={styles.tableWrapper}>
        <table style={styles.table}>
          <thead>
            <tr>
              {COLONNES.map(col => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  style={{ ...styles.th, cursor: 'pointer' }}
                >
                  {col.label}
                  {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {marches.map((m, i) => (
              <tr
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                onMouseEnter={() => setHoveredId(m.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  ...styles.tr,
                  background: selectedId === m.id ? '#eff6ff' : hoveredId === m.id ? '#f0f9ff' : (i % 2 === 0 ? '#fff' : '#f9fafb'),
                  borderLeft: selectedId === m.id ? '3px solid #2563eb' : hoveredId === m.id ? '3px solid #93c5fd' : '3px solid transparent',
                }}
              >
                <td style={{ ...styles.td, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={styles.lien}>{m.titre}</span>
                </td>
                <td style={{ ...styles.td, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.acheteur || '—'}</td>
                <td style={styles.td}>{m.departement || '—'}</td>
                <td style={{ ...styles.td, textAlign: 'center', fontWeight: 600 }}>{m.score_pertinence}</td>
                <td style={styles.td}>
                  {m.niveau_priorite && (
                    <span style={{ ...styles.chip, ...PRIORITE_BADGE[m.niveau_priorite] }}>
                      {PRIORITE_BADGE[m.niveau_priorite]?.label}
                    </span>
                  )}
                </td>
                <td style={{ ...styles.td, color: m.date_limite && new Date(m.date_limite) < new Date() ? '#c81e1e' : 'inherit' }}>
                  {m.date_limite?.slice(0, 10) || '—'}
                </td>
              </tr>
            ))}
            {!loading && marches.length === 0 && (
              <tr><td colSpan={COLONNES.length} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>Aucun marché trouvé</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={styles.pagination}>
        <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1} style={styles.btnPage}>‹ Préc.</button>
        <span style={{ margin: '0 1rem' }}>Page {page} / {totalPages || 1}</span>
        <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page >= totalPages} style={styles.btnPage}>Suiv. ›</button>
      </div>

      {selectedId && (
        <>
          <div style={styles.overlay} onClick={() => setSelectedId(null)} />
          <div style={styles.drawer}>
            <MarcheDetail id={selectedId} onRetour={() => setSelectedId(null)} />
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  container:    { padding: '1.5rem', position: 'relative' },
  titre:        { fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' },
  badge:        { background: '#2563eb', color: '#fff', borderRadius: '9999px', padding: '0.1rem 0.6rem', fontSize: '0.85rem' },
  filtres:      { display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' },
  select:       { padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.875rem' },
  input:        { padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.875rem', width: 140 },
  btn:          { padding: '0.4rem 0.9rem', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: '0.875rem' },
  erreur:       { background: '#fee2e2', color: '#991b1b', padding: '0.75rem', borderRadius: 6, marginBottom: '0.75rem' },
  loading:      { color: '#6b7280', marginBottom: '0.5rem' },
  tableWrapper: { overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' },
  table:        { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
  th:           { padding: '0.6rem 0.8rem', background: '#f3f4f6', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', userSelect: 'none' },
  tr:           { cursor: 'pointer', transition: 'background 0.15s' },
  td:           { padding: '0.55rem 0.8rem', borderBottom: '1px solid #f3f4f6' },
  chip:         { display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: 9999, fontSize: '0.78rem', fontWeight: 600 },
  lien:         { color: '#2563eb', textDecoration: 'underline' },
  overlay:      { position: 'fixed', inset: 0, top: 52, background: 'rgba(0,0,0,0.2)', zIndex: 99 },
  drawer:       { position: 'fixed', top: 52, right: 0, bottom: 0, width: 680, background: '#f9fafb', boxShadow: '-4px 0 32px rgba(0,0,0,0.15)', overflowY: 'auto', zIndex: 100 },
  pagination:   { display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '1rem' },
  btnPage:      { padding: '0.4rem 0.9rem', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: '0.875rem' },
};

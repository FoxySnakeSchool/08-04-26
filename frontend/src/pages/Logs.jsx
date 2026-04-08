import React, { useState, useEffect, useCallback } from 'react';
import { fetchJson } from '../api';

const NIVEAU_COLOR = {
  INFO:     { background: '#dbeafe', color: '#1e40af' },
  WARNING:  { background: '#fef3c7', color: '#92400e' },
  ERROR:    { background: '#fee2e2', color: '#991b1b' },
  CRITICAL: { background: '#fce7f3', color: '#9d174d' },
};

export default function Logs() {
  const [onglet, setOnglet]       = useState('technique');
  const [rows, setRows]           = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [niveau, setNiveau]       = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const LIMIT = 100;

  function toggleExpand(id) {
    setExpandedId(prev => prev === id ? null : id);
  }

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url;
      if (onglet === 'technique') {
        const p = new URLSearchParams({ page, limit: LIMIT, ...(niveau && { niveau }) });
        url = `/logs/technique?${p}`;
      } else if (onglet === 'metier') {
        url = `/logs/metier?page=${page}&limit=${LIMIT}`;
      } else {
        url = '/logs/sauvegardes';
      }
      const data = await fetchJson(url);
      if (Array.isArray(data)) {
        setRows(data);
        setTotal(data.length);
      } else {
        setRows(data.data);
        setTotal(data.total);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [onglet, page, niveau]);

  useEffect(() => { charger(); }, [charger]);
  useEffect(() => { setPage(1); setExpandedId(null); }, [onglet, niveau]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={styles.container}>
      <h2 style={styles.titre}>Journaux <span style={styles.badge}>{total}</span></h2>

      {/* Onglets */}
      <div style={styles.onglets}>
        {['technique', 'metier', 'sauvegardes'].map(o => (
          <button
            key={o}
            onClick={() => setOnglet(o)}
            style={{ ...styles.onglet, ...(onglet === o ? styles.ongletActif : {}) }}
          >
            {o === 'technique' ? 'Technique' : o === 'metier' ? 'Métier' : 'Sauvegardes'}
          </button>
        ))}
      </div>

      {/* Filtres */}
      {onglet === 'technique' && (
        <div style={styles.filtres}>
          <select value={niveau} onChange={e => setNiveau(e.target.value)} style={styles.select}>
            <option value="">Tous niveaux</option>
            {['INFO','WARNING','ERROR','CRITICAL'].map(n =>
              <option key={n} value={n}>{n}</option>
            )}
          </select>
          <button onClick={charger} style={styles.btn}>↺ Rafraîchir</button>
        </div>
      )}

      {error && <div style={styles.erreur}>{error}</div>}
      {loading && <div style={styles.loading}>Chargement...</div>}

      {/* Table technique */}
      {onglet === 'technique' && (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Niveau</th>
                <th style={styles.th}>Source</th>
                <th style={styles.th}>Message</th>
                <th style={{ ...styles.th, width: 90, textAlign: 'center' }}>Détail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const expanded = expandedId === r.id;
                let detailParsed = null;
                if (r.detail) {
                  try { detailParsed = JSON.parse(r.detail); } catch { detailParsed = r.detail; }
                }
                return (
                  <React.Fragment key={r.id}>
                    <tr
                      onClick={() => toggleExpand(r.id)}
                      style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb', cursor: 'pointer' }}
                    >
                      <td style={{ ...styles.td, whiteSpace: 'nowrap', color: '#6b7280' }}>
                        {r.detail
                          ? <span style={{ marginRight: '0.4rem', color: '#9ca3af', fontSize: '0.7rem' }}>{expanded ? '▼' : '▶'}</span>
                          : <span style={{ marginRight: '0.4rem', display: 'inline-block', width: '0.9rem' }} />
                        }
                        {r.cree_le?.slice(0, 19)}
                      </td>
                      <td style={styles.td}>
                        <span style={{ ...styles.chip, ...(NIVEAU_COLOR[r.niveau] || {}) }}>{r.niveau}</span>
                      </td>
                      <td style={{ ...styles.td, color: '#6b7280', fontSize: '0.8rem' }}>{r.source}</td>
                      <td style={styles.td}>{r.message}</td>
                      <td style={{ ...styles.td, textAlign: 'center' }}>
                        {r.detail
                          ? <span style={styles.detailBadge}>{expanded ? '▼ JSON' : '{ } JSON'}</span>
                          : <span style={{ color: '#d1d5db', fontSize: '0.75rem' }}>—</span>
                        }
                      </td>
                    </tr>
                    {expanded && r.detail && (
                      <tr style={{ background: '#f8fafc' }}>
                        <td colSpan={5} style={styles.expandPanel}>
                          <div style={styles.expandLabel}>Détail JSON</div>
                          <pre style={styles.expandPre}>
                            {typeof detailParsed === 'object'
                              ? JSON.stringify(detailParsed, null, 2)
                              : r.detail}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {!loading && rows.length === 0 && <tr><td colSpan={5} style={styles.vide}>Aucune entrée</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Table métier */}
      {onglet === 'metier' && (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Marché</th>
                <th style={styles.th}>Action</th>
                <th style={styles.th}>Avant</th>
                <th style={styles.th}>Après</th>
                <th style={styles.th}>Opérateur</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const expanded = expandedId === r.id;
                return (
                  <React.Fragment key={r.id}>
                    <tr
                      onClick={() => toggleExpand(r.id)}
                      style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb', cursor: 'pointer' }}
                    >
                      <td style={{ ...styles.td, whiteSpace: 'nowrap', color: '#6b7280' }}>
                        <span style={{ marginRight: '0.4rem', color: '#9ca3af', fontSize: '0.7rem' }}>{expanded ? '▼' : '▶'}</span>
                        {r.cree_le?.slice(0, 19)}
                      </td>
                      <td style={{ ...styles.td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ color: '#2563eb', fontSize: '0.8rem' }}>#{r.id_marche}</span>
                        {r.titre && <span style={{ marginLeft: '0.4rem', color: '#374151' }}>{r.titre}</span>}
                      </td>
                      <td style={styles.td}><span style={styles.actionChip}>{r.action}</span></td>
                      <td style={{ ...styles.td, color: '#9ca3af', fontSize: '0.85rem' }}>{r.ancienne_valeur || '—'}</td>
                      <td style={{ ...styles.td, fontWeight: 500, fontSize: '0.85rem' }}>{r.nouvelle_valeur || '—'}</td>
                      <td style={{ ...styles.td, color: '#6b7280', fontSize: '0.78rem' }}>{r.operateur}</td>
                    </tr>
                    {expanded && (
                      <tr style={{ background: '#f8fafc' }}>
                        <td colSpan={6} style={styles.expandPanel}>
                          <div style={styles.expandGrid}>
                            <div><span style={styles.expandLabel}>Marché #</span><br />{r.id_marche}</div>
                            <div><span style={styles.expandLabel}>Action</span><br />{r.action}</div>
                            <div><span style={styles.expandLabel}>Opérateur</span><br />{r.operateur}</div>
                            <div><span style={styles.expandLabel}>Avant</span><br />{r.ancienne_valeur || '—'}</div>
                            <div><span style={styles.expandLabel}>Après</span><br />{r.nouvelle_valeur || '—'}</div>
                          </div>
                          {r.titre && <div style={{ marginTop: '0.5rem', fontSize: '0.82rem' }}><span style={styles.expandLabel}>Titre marché :</span> {r.titre}</div>}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {!loading && rows.length === 0 && <tr><td colSpan={6} style={styles.vide}>Aucune entrée</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Table sauvegardes */}
      {onglet === 'sauvegardes' && (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Statut</th>
                <th style={styles.th}>Fichier</th>
                <th style={styles.th}>Taille</th>
                <th style={styles.th}>Durée</th>
                <th style={styles.th}>Erreur</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const expanded = expandedId === r.id;
                return (
                  <React.Fragment key={r.id}>
                    <tr
                      onClick={() => toggleExpand(r.id)}
                      style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb', cursor: 'pointer' }}
                    >
                      <td style={{ ...styles.td, whiteSpace: 'nowrap', color: '#6b7280' }}>
                        <span style={{ marginRight: '0.4rem', color: '#9ca3af', fontSize: '0.7rem' }}>{expanded ? '▼' : '▶'}</span>
                        {r.cree_le?.slice(0, 19)}
                      </td>
                      <td style={styles.td}>{r.type}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.chip, ...(r.statut === 'SUCCES' ? { background: '#d1fae5', color: '#065f46' } : { background: '#fee2e2', color: '#991b1b' }) }}>
                          {r.statut}
                        </span>
                      </td>
                      <td style={{ ...styles.td, fontSize: '0.78rem', color: '#6b7280' }}>{r.chemin_fichier?.split(/[\\/]/).pop() || '—'}</td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{r.taille_octets ? `${(r.taille_octets / 1024 / 1024).toFixed(1)} Mo` : '—'}</td>
                      <td style={styles.td}>{r.duree_secondes != null ? `${r.duree_secondes}s` : '—'}</td>
                      <td style={{ ...styles.td, color: '#c81e1e', fontSize: '0.8rem' }}>{r.message_erreur || '—'}</td>
                    </tr>
                    {expanded && (
                      <tr style={{ background: '#f8fafc' }}>
                        <td colSpan={7} style={styles.expandPanel}>
                          <div style={styles.expandGrid}>
                            <div><span style={styles.expandLabel}>Type</span><br />{r.type}</div>
                            <div><span style={styles.expandLabel}>Statut</span><br />{r.statut}</div>
                            <div><span style={styles.expandLabel}>Durée</span><br />{r.duree_secondes != null ? `${r.duree_secondes}s` : '—'}</div>
                            <div><span style={styles.expandLabel}>Taille</span><br />{r.taille_octets ? `${(r.taille_octets / 1024 / 1024).toFixed(2)} Mo` : '—'}</div>
                          </div>
                          {r.chemin_fichier && <div style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}><span style={styles.expandLabel}>Chemin :</span> {r.chemin_fichier}</div>}
                          {r.message_erreur && <div style={{ marginTop: '0.5rem', color: '#c81e1e', fontSize: '0.82rem' }}><span style={styles.expandLabel}>Erreur :</span> {r.message_erreur}</div>}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {!loading && rows.length === 0 && <tr><td colSpan={7} style={styles.vide}>Aucune entrée</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination (technique + metier) */}
      {onglet !== 'sauvegardes' && totalPages > 1 && (
        <div style={styles.pagination}>
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1} style={styles.btnPage}>‹ Préc.</button>
          <span style={{ margin: '0 1rem' }}>Page {page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page >= totalPages} style={styles.btnPage}>Suiv. ›</button>
        </div>
      )}
    </div>
  );
}

const styles = {
  container:    { padding: '1.5rem' },
  titre:        { fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' },
  badge:        { background: '#6b7280', color: '#fff', borderRadius: '9999px', padding: '0.1rem 0.6rem', fontSize: '0.85rem' },
  onglets:      { display: 'flex', gap: '0.25rem', marginBottom: '1rem', borderBottom: '2px solid #e5e7eb' },
  onglet:       { padding: '0.5rem 1rem', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.9rem', color: '#6b7280', borderBottom: '2px solid transparent', marginBottom: -2 },
  ongletActif:  { color: '#2563eb', borderBottom: '2px solid #2563eb', fontWeight: 600 },
  filtres:      { display: 'flex', gap: '0.75rem', marginBottom: '1rem' },
  select:       { padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.875rem' },
  btn:          { padding: '0.4rem 0.9rem', borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer', fontSize: '0.875rem' },
  erreur:       { background: '#fee2e2', color: '#991b1b', padding: '0.75rem', borderRadius: 6, marginBottom: '0.75rem' },
  loading:      { color: '#6b7280', marginBottom: '0.5rem' },
  tableWrapper: { overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' },
  table:        { width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' },
  th:           { padding: '0.6rem 0.8rem', background: '#f3f4f6', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' },
  td:           { padding: '0.5rem 0.8rem', borderBottom: '1px solid #f3f4f6' },
  chip:         { display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: 9999, fontSize: '0.78rem', fontWeight: 600 },
  actionChip:   { display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: 4, fontSize: '0.78rem', fontWeight: 600, background: '#f3f4f6', color: '#374151', fontFamily: 'monospace' },
  expandPanel:  { padding: '0.75rem 1.25rem', borderBottom: '2px solid #e5e7eb' },
  expandGrid:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.5rem 1.5rem', fontSize: '0.82rem', marginBottom: '0.25rem' },
  expandLabel:  { fontWeight: 600, color: '#6b7280', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' },
  expandPre:    { margin: '0.4rem 0 0', fontSize: '0.78rem', background: '#1e293b', color: '#e2e8f0', padding: '0.75rem', borderRadius: 6, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' },
  detailBadge:  { display: 'inline-block', padding: '0.1rem 0.45rem', borderRadius: 4, fontSize: '0.72rem', fontWeight: 700, background: '#f1f5f9', color: '#475569', fontFamily: 'monospace', border: '1px solid #e2e8f0', cursor: 'pointer' },
  vide:         { textAlign: 'center', padding: '2rem', color: '#9ca3af' },
  pagination:   { display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '1rem' },
  btnPage:      { padding: '0.4rem 0.9rem', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: '0.875rem' },
};

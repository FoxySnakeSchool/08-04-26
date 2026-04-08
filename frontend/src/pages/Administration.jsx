import React, { useEffect, useState, useCallback } from 'react';
import { fetchJson } from '../api';

const POIDS_LABELS = { 1: 'Faible', 2: 'Léger', 3: 'Moyen', 4: 'Fort', 5: 'Critique' };
const POIDS_COLORS = { 1: '#9ca3af', 2: '#6b7280', 3: '#3b82f6', 4: '#f59e0b', 5: '#ef4444' };

async function deleteJson(path) {
  const res = await fetch(`/api${path}`, { method: 'DELETE' });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
  return res.json();
}

async function postJson(path, body) {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
  return res.json();
}

async function patchJson(path, body) {
  const res = await fetch(`/api${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
  return res.json();
}

export default function Administration() {
  const [motsCles, setMotsCles]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [erreur, setErreur]           = useState(null);

  // Ajout
  const [newTerme, setNewTerme]       = useState('');
  const [newPoids, setNewPoids]       = useState(3);
  const [addError, setAddError]       = useState(null);

  // Edition
  const [editId, setEditId]           = useState(null);
  const [editTerme, setEditTerme]     = useState('');
  const [editPoids, setEditPoids]     = useState(3);

  // Import
  const [importing, setImporting]     = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Import historique
  const [histDepuis, setHistDepuis]   = useState('');
  const [histJusqu, setHistJusqu]     = useState('');
  const [importingHist, setImportingHist] = useState(false);
  const [histResult, setHistResult]   = useState(null);

  const charger = useCallback(async () => {
    setLoading(true);
    setErreur(null);
    try {
      const data = await fetchJson('/admin/mots-cles');
      setMotsCles(data);
    } catch (e) {
      setErreur(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  async function ajouterMotCle(e) {
    e.preventDefault();
    setAddError(null);
    try {
      const mc = await postJson('/admin/mots-cles', { terme: newTerme, poids: newPoids });
      setMotsCles(prev => [...prev, mc].sort((a, b) => b.poids - a.poids || a.terme.localeCompare(b.terme)));
      setNewTerme('');
      setNewPoids(3);
    } catch (err) {
      setAddError(err.message);
    }
  }

  async function supprimerMotCle(id) {
    if (!window.confirm('Supprimer ce mot-clé ?')) return;
    try {
      await deleteJson(`/admin/mots-cles/${id}`);
      setMotsCles(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      alert(err.message);
    }
  }

  function demarrerEdit(mc) {
    setEditId(mc.id);
    setEditTerme(mc.terme);
    setEditPoids(mc.poids);
  }

  async function sauvegarderEdit(id) {
    try {
      const updated = await patchJson(`/admin/mots-cles/${id}`, { terme: editTerme, poids: editPoids });
      setMotsCles(prev => prev.map(m => m.id === id ? updated : m).sort((a, b) => b.poids - a.poids || a.terme.localeCompare(b.terme)));
      setEditId(null);
    } catch (err) {
      alert(err.message);
    }
  }

  async function lancerImport() {
    setImporting(true);
    setImportResult(null);
    try {
      const res = await postJson('/admin/import', {});
      setImportResult(res);
    } catch (err) {
      setImportResult({ error: err.message });
    } finally {
      setImporting(false);
    }
  }

  async function lancerImportHistorique(e) {
    e.preventDefault();
    setImportingHist(true);
    setHistResult(null);
    try {
      const res = await postJson('/admin/import/historique', {
        depuis: histDepuis,
        jusqu:  histJusqu || undefined,
      });
      setHistResult(res);
    } catch (err) {
      setHistResult({ error: err.message });
    } finally {
      setImportingHist(false);
    }
  }

  return (
    <div style={s.page}>
      <h2 style={s.title}>Administration</h2>

      {/* ── Import manuel ─────────────────────────────────────────── */}
      <section style={s.card}>
        <h3 style={s.sectionTitle}>Forcer l'import des données</h3>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button style={s.btnPrimary} onClick={() => lancerImport()} disabled={importing}>
            {importing ? 'Import en cours…' : '⟳ Lancer l’import BOAMP'}
          </button>
        </div>
        {importResult && (
          <div style={{ marginTop: '0.75rem' }}>
            {importResult.error
              ? <span style={s.badge('error')}>Erreur : {importResult.error}</span>
              : <span style={s.badge('ok')}>✓ Import terminé</span>
            }
          </div>
        )}
      </section>

      {/* ── Import historique ─────────────────────────────────────── */}
      <section style={s.card}>
        <h3 style={s.sectionTitle}>Import historique</h3>
        <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.75rem' }}>
          Récupère les avis de marché BOAMP sur une période passée. Utile pour peupler la base
          la première fois. L'import pagine automatiquement (100 annonces par appel).
        </p>
        <form onSubmit={lancerImportHistorique} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
            Depuis&nbsp;
            <input
              type="date"
              value={histDepuis}
              onChange={e => setHistDepuis(e.target.value)}
              required
              style={s.input}
            />
          </label>
          <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>
            Jusqu'au (optionnel)&nbsp;
            <input
              type="date"
              value={histJusqu}
              onChange={e => setHistJusqu(e.target.value)}
              style={s.input}
            />
          </label>
          <button type="submit" style={s.btnPrimary} disabled={importingHist}>
            {importingHist ? 'Import en cours…' : "⟳ Lancer l'import historique"}
          </button>
        </form>
        {histResult && (
          <div style={{ marginTop: '0.75rem' }}>
            {histResult.error
              ? <span style={s.badge('error')}>Erreur : {histResult.error}</span>
              : <span style={s.badge('ok')}>✓ Import historique terminé</span>
            }
          </div>
        )}
      </section>

      {/* ── Mots-clés ──────────────────────────────────────────────── */}
      <section style={s.card}>
        <h3 style={s.sectionTitle}>Mots-clés de veille</h3>

        {/* Formulaire d'ajout */}
        <form onSubmit={ajouterMotCle} style={s.form}>
          <input
            style={s.input}
            placeholder="Nouveau mot-clé"
            value={newTerme}
            onChange={e => setNewTerme(e.target.value)}
            required
          />
          <select style={s.select} value={newPoids} onChange={e => setNewPoids(Number(e.target.value))}>
            {[1,2,3,4,5].map(p => <option key={p} value={p}>{p} — {POIDS_LABELS[p]}</option>)}
          </select>
          <button type="submit" style={s.btnPrimary}>+ Ajouter</button>
          {addError && <span style={s.badge('error')}>{addError}</span>}
        </form>

        {/* Liste */}
        {loading ? (
          <p style={{ color: '#6b7280' }}>Chargement…</p>
        ) : erreur ? (
          <p style={s.badge('error')}>{erreur}</p>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Terme</th>
                <th style={s.th}>Poids</th>
                <th style={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {motsCles.map(mc => (
                <tr key={mc.id} style={s.tr}>
                  {editId === mc.id ? (
                    <>
                      <td style={s.td}>
                        <input style={{ ...s.input, marginBottom: 0 }} value={editTerme}
                          onChange={e => setEditTerme(e.target.value)} />
                      </td>
                      <td style={s.td}>
                        <select style={s.select} value={editPoids} onChange={e => setEditPoids(Number(e.target.value))}>
                          {[1,2,3,4,5].map(p => <option key={p} value={p}>{p} — {POIDS_LABELS[p]}</option>)}
                        </select>
                      </td>
                      <td style={{ ...s.td, textAlign: 'right' }}>
                        <button style={s.btnSmallPrimary} onClick={() => sauvegarderEdit(mc.id)}>✓</button>
                        <button style={{ ...s.btnSmall, marginLeft: 4 }} onClick={() => setEditId(null)}>✕</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={s.td}>{mc.terme}</td>
                      <td style={s.td}>
                        <span style={{ ...s.poidsBadge, background: POIDS_COLORS[mc.poids] }}>
                          {mc.poids} — {POIDS_LABELS[mc.poids]}
                        </span>
                      </td>
                      <td style={{ ...s.td, textAlign: 'right' }}>
                        <button style={s.btnSmall} onClick={() => demarrerEdit(mc)}>Modifier</button>
                        <button style={{ ...s.btnSmall, ...s.btnDanger, marginLeft: 4 }} onClick={() => supprimerMotCle(mc.id)}>Supprimer</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

const s = {
  page:        { padding: '1.5rem' },
  title:       { fontSize: '1.4rem', fontWeight: 700, color: '#1e3a5f', marginBottom: '1.25rem' },
  card:        { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '1.25rem', marginBottom: '1.25rem' },
  sectionTitle:{ fontSize: '1rem', fontWeight: 600, color: '#374151', marginBottom: '1rem', marginTop: 0 },
  form:        { display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' },
  input:       { padding: '0.4rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem', width: 200 },
  select:      { padding: '0.4rem 0.5rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem' },
  table:       { width: '100%', borderCollapse: 'collapse' },
  th:          { textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#6b7280', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase' },
  tr:          { borderBottom: '1px solid #f3f4f6' },
  td:          { padding: '0.5rem 0.75rem', fontSize: '0.9rem' },
  poidsBadge:  { display: 'inline-block', padding: '0.15rem 0.6rem', borderRadius: 12, fontSize: '0.75rem', color: '#fff', fontWeight: 600 },
  btnPrimary:  { padding: '0.4rem 0.9rem', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.875rem' },
  btnSecondary:{ padding: '0.4rem 0.9rem', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.875rem' },
  btnSmall:    { padding: '0.2rem 0.6rem', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 5, cursor: 'pointer', fontSize: '0.8rem' },
  btnSmallPrimary: { padding: '0.2rem 0.6rem', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '0.8rem' },
  btnDanger:   { background: '#fee2e2', color: '#dc2626', borderColor: '#fca5a5' },
  badge:       (type) => ({ display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: 5, fontSize: '0.8rem', background: type === 'ok' ? '#d1fae5' : '#fee2e2', color: type === 'ok' ? '#065f46' : '#dc2626' }),
};

import React, { useState, useEffect } from 'react';
import { fetchJson } from '../api';

const PRIORITE = {
  eleve:  { bg: '#fef2f2', color: '#b91c1c', border: '#fca5a5', label: 'Priorité élevée' },
  moyen:  { bg: '#fffbeb', color: '#92400e', border: '#fcd34d', label: 'Priorité moyenne' },
  faible: { bg: '#f9fafb', color: '#374151', border: '#d1d5db', label: 'Priorité faible'  },
};

const ETAT_STYLE = {
  ANNULATION:   { bg: '#fee2e2', color: '#b91c1c' },
  MODIFICATION: { bg: '#fef9c3', color: '#854d0e' },
  RECTIFICATIF: { bg: '#ffedd5', color: '#c2410c' },
  INITIAL:      { bg: '#f0fdf4', color: '#15803d' },
};

function daysDiff(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}

export default function MarcheDetail({ id, onRetour }) {
  const [marche, setMarche] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchJson(`/marches/${id}`)
      .then(setMarche)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={s.page}><div style={s.loading}>Chargement…</div></div>;
  if (error)   return <div style={s.page}><div style={s.erreur}>{error}</div></div>;
  if (!marche) return null;

  const prio     = PRIORITE[marche.niveau_priorite] || PRIORITE.faible;
  const jours    = daysDiff(marche.date_limite);
  const depasse  = jours !== null && jours < 0;
  const urgent   = jours !== null && jours >= 0 && jours <= 7;
  const etatStyle = marche.etat ? (ETAT_STYLE[marche.etat] || { bg: '#f3f4f6', color: '#374151' }) : null;

  const cpvCodes = (() => {
    if (!marche.descripteur_code) return [];
    try {
      const arr = typeof marche.descripteur_code === 'string'
        ? JSON.parse(marche.descripteur_code) : marche.descripteur_code;
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  })();

  return (
    <div style={s.page}>

      {/* Barre de navigation */}
      <div style={s.navbar}>
        <button onClick={onRetour} style={s.retour}>← Retour à la liste</button>
        {marche.lien_source && (
          <a href={marche.lien_source} target="_blank" rel="noreferrer" style={s.btnExternal}>
            Voir l'annonce officielle ↗
          </a>
        )}
      </div>

      {/* En-tête : titre + score */}
      <div style={{ ...s.header, borderLeftColor: prio.border, borderLeftWidth: 5, borderLeftStyle: 'solid' }}>
        <div style={{ flex: 1 }}>
          {/* Badges */}
          <div style={s.badgeRow}>
            {marche.etat && etatStyle && (
              <span style={{ ...s.badge, background: etatStyle.bg, color: etatStyle.color }}>
                {marche.etat}
              </span>
            )}
            {marche.nature_libelle && (
              <span style={{ ...s.badge, background: '#f3f4f6', color: '#374151' }}>
                {marche.nature_libelle}
              </span>
            )}
            {marche.type_marche && (
              <span style={{ ...s.badge, background: '#eff6ff', color: '#1d4ed8' }}>
                {marche.type_marche}
              </span>
            )}
          </div>

          <h1 style={s.titre}>{marche.titre}</h1>

          <div style={s.acheteurLine}>
            {marche.acheteur && <strong>{marche.acheteur}</strong>}
            {(marche.ville || marche.departement) && (
              <span style={{ color: '#6b7280' }}>
                {marche.ville}{marche.ville && marche.departement ? ' ' : ''}{marche.departement ? `(${marche.departement})` : ''}
              </span>
            )}
            {marche.contact_email && (
              <a href={`mailto:${marche.contact_email}`} style={{ color: '#2563eb', fontSize: '0.85rem' }}>
                ✉ {marche.contact_email}
              </a>
            )}
          </div>
        </div>

        {/* Score */}
        <div style={{ ...s.scoreBox, background: prio.bg, borderColor: prio.border }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 800, color: prio.color, lineHeight: 1 }}>
            {marche.score_pertinence}
          </div>
          <div style={{ fontSize: '0.7rem', color: prio.color, opacity: 0.8 }}>/100</div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: prio.color, marginTop: 4 }}>
            {prio.label}
          </div>
        </div>
      </div>

      {/* Corps : 2 colonnes */}
      <div style={s.body}>

        {/* Colonne gauche */}
        <div style={s.col}>

          {/* Bloc dates */}
          <div style={s.bloc}>
            <div style={s.blocTitre}>Calendrier</div>
            <div style={s.row2}>
              <div>
                <div style={s.label}>Publié le</div>
                <div style={s.val}>{marche.date_publication?.slice(0, 10) || '—'}</div>
              </div>
              <div>
                <div style={s.label}>Date limite</div>
                <div style={{ ...s.val, color: depasse ? '#b91c1c' : urgent ? '#c2410c' : 'inherit', fontWeight: (depasse || urgent) ? 700 : 500 }}>
                  {marche.date_limite?.slice(0, 10) || '—'}
                </div>
                {jours !== null && (
                  <div style={{ fontSize: '0.78rem', color: depasse ? '#b91c1c' : urgent ? '#c2410c' : '#6b7280', marginTop: 2 }}>
                    {depasse ? `Dépassée (${Math.abs(jours)}j)` : jours === 0 ? "Aujourd'hui !" : `J-${jours}`}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bloc procédure */}
          <div style={s.bloc}>
            <div style={s.blocTitre}>Marché</div>
            <Field label="Procédure"          value={marche.procedure_libelle} />
            <Field label="Procédure normalisée" value={marche.procedure_categorise} />
          </div>

          {/* CPV */}
          {cpvCodes.length > 0 && (
            <div style={s.bloc}>
              <div style={s.blocTitre}>Codes CPV</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {cpvCodes.map((c, i) => (
                  <span key={i} style={{ padding: '2px 10px', borderRadius: 12, fontSize: 12, background: '#e0e7ff', color: '#3730a3', fontWeight: 600 }}>{c}</span>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Colonne droite */}
        <div style={s.col}>

          {/* Mots-clés */}
          {marche.mots_cles?.length > 0 && (
            <div style={s.bloc}>
              <div style={s.blocTitre}>Mots-clés détectés ({marche.mots_cles.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {marche.mots_cles.sort((a, b) => b.poids - a.poids || b.nb_occurrences - a.nb_occurrences).map(mk => (
                  <span key={mk.terme} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '3px 10px', borderRadius: 12, fontSize: 12,
                    background: mk.poids >= 4 ? '#fef2f2' : mk.poids >= 3 ? '#fffbeb' : '#f0f9ff',
                    color:      mk.poids >= 4 ? '#b91c1c' : mk.poids >= 3 ? '#92400e' : '#0369a1',
                    fontWeight: 600,
                    border: `1px solid ${mk.poids >= 4 ? '#fca5a5' : mk.poids >= 3 ? '#fcd34d' : '#bae6fd'}`,
                  }}>
                    {mk.terme}
                    <span style={{ opacity: 0.6, fontWeight: 400 }}>×{mk.nb_occurrences}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {(marche.description || marche.resume) && (
            <div style={s.bloc}>
              <div style={s.blocTitre}>Objet du marché</div>
              <p style={s.description}>{marche.description || marche.resume}</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: '0.6rem' }}>
      <div style={{ fontSize: '0.72rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: '0.9rem', fontWeight: 500, color: '#111827' }}>{value}</div>
    </div>
  );
}

const s = {
  page:         { padding: '1.5rem', maxWidth: 1100, margin: '0 auto' },
  loading:      { color: '#6b7280', padding: '2rem' },
  erreur:       { background: '#fee2e2', color: '#991b1b', padding: '0.75rem', borderRadius: 6 },
  navbar:       { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  retour:       { background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.9rem', padding: 0 },
  btnExternal:  { padding: '0.4rem 0.9rem', borderRadius: 6, background: '#2563eb', color: '#fff', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600 },
  header:       { background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', padding: '1.25rem 1.5rem', marginBottom: '1rem', display: 'flex', gap: '1.25rem', alignItems: 'flex-start' },
  badgeRow:     { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '0.6rem' },
  badge:        { padding: '2px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' },
  titre:        { fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.5rem', lineHeight: 1.4, color: '#111827' },
  acheteurLine: { display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', fontSize: '0.875rem' },
  scoreBox:     { textAlign: 'center', minWidth: 90, padding: '0.75rem', borderRadius: 10, border: '1px solid', flexShrink: 0 },
  body:         { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' },
  col:          { display: 'flex', flexDirection: 'column', gap: '1rem' },
  bloc:         { background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', padding: '1rem 1.25rem' },
  blocTitre:    { fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f3f4f6' },
  row2:         { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' },
  label:        { fontSize: '0.72rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 },
  val:          { fontSize: '0.9rem', fontWeight: 500, color: '#111827' },
  description:  { fontSize: '0.875rem', color: '#374151', lineHeight: 1.65, whiteSpace: 'pre-wrap', maxHeight: 320, overflowY: 'auto', margin: 0 },
};


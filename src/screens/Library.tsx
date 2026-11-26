import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../db.ts'
import { isDue, normalize } from '../logic.ts'
import type { Profile, Revision } from '../types.ts'
import { formatDate } from '../ui.tsx'

type Filtre = 'toutes' | 'recentes' | 'arevoir' | 'favoris'
const FILTRES: [Filtre, string][] = [['toutes', 'Toutes'], ['recentes', 'Récentes'], ['arevoir', 'À revoir'], ['favoris', 'Favoris']]

const activity = (r: Revision) => Math.max(r.createdAt, r.lastSession ?? 0)
export const aRevoir = (r: Revision) => r.cartes.some((c) => isDue(c)) || (r.questions.length > 0 && (r.bestScore ?? 0) < 70)

export function Library({ profile }: { profile: Profile }) {
  const revisions = useLiveQuery(() => db.revisions.toArray())
  const [q, setQ] = useState('')
  const [matiere, setMatiere] = useState('')
  const [filtre, setFiltre] = useState<Filtre>('toutes')

  const list = (revisions ?? [])
    .filter((r) => !matiere || r.matiere === matiere)
    .filter((r) => !q || normalize(`${r.theme} ${r.fiche.titre} ${r.matiere}`).includes(normalize(q)))
    .filter((r) =>
      filtre === 'favoris' ? r.favori : filtre === 'arevoir' ? aRevoir(r) : filtre === 'recentes' ? Date.now() - activity(r) < 14 * 86_400_000 : true,
    )
    .sort((a, b) => activity(b) - activity(a))
  const groups = [...new Set(list.map((r) => r.matiere))].sort()
  const matieres = [...new Set([...profile.matieres, ...(revisions ?? []).map((r) => r.matiere)])]

  return (
    <main className="page">
      <header className="top">
        <h1>{profile.prenom ? `Bonjour ${profile.prenom} 👋` : 'Mes révisions'}</h1>
      </header>
      <a className="btn primary big" href="#/creer">
        + Nouvelle révision
      </a>
      {revisions && revisions.length > 0 && (
        <div className="stack tight">
          <input type="search" aria-label="Rechercher" placeholder="🔎 Rechercher un thème…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label="Filtrer par matière" value={matiere} onChange={(e) => setMatiere(e.target.value)}>
            <option value="">Toutes les matières</option>
            {matieres.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <div className="chips" role="group" aria-label="Filtres">
            {FILTRES.map(([f, label]) => (
              <button key={f} className="chip" aria-pressed={filtre === f} onClick={() => setFiltre(f)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {revisions?.length === 0 && (
        <div className="empty">
          <p className="hero-emoji" aria-hidden="true">🌱</p>
          <p>Ta bibliothèque est vide pour l'instant.</p>
          <p className="muted">Crée ta première révision : un thème suffit, et tu peux ajouter tes cours en PDF ou en photo.</p>
        </div>
      )}
      {revisions && revisions.length > 0 && list.length === 0 && <p className="muted center">Aucune révision ne correspond.</p>}
      {groups.map((g) => (
        <section key={g}>
          <h2 className="group-title">{g}</h2>
          <ul className="list">
            {list.filter((r) => r.matiere === g).map((r) => (
              <RevisionItem key={r.id} r={r} />
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}

function RevisionItem({ r }: { r: Revision }) {
  const due = r.cartes.filter((c) => isDue(c)).length
  return (
    <li className="card item">
      <a href={`#/r/${r.id}${r.brouillon ? '/modifier' : ''}`} className="item-link">
        <strong>{r.fiche.titre || r.theme}</strong>
        <span className="meta">
          {r.brouillon && <span className="badge warn">Brouillon</span>}
          {r.bestScore !== undefined && <span className="badge">Meilleur score {r.bestScore} %</span>}
          {due > 0 && <span className="badge accent">{due} carte{due > 1 ? 's' : ''} à revoir</span>}
          <span>{r.lastSession ? `Dernière session : ${formatDate(r.lastSession)}` : `Créée le ${formatDate(r.createdAt)}`}</span>
        </span>
      </a>
      <button className="btn icon ghost star" aria-pressed={r.favori} aria-label={r.favori ? 'Retirer des favoris' : 'Ajouter aux favoris'} onClick={() => db.revisions.update(r.id!, { favori: !r.favori })}>
        {r.favori ? '★' : '☆'}
      </button>
    </li>
  )
}

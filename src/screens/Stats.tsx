import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db.ts'
import { weekStart } from '../logic.ts'
import type { Profile } from '../types.ts'
import { formatDate, Header } from '../ui.tsx'

const WEEK = 7 * 86_400_000

export function Stats({ profile }: { profile: Profile }) {
  const data = useLiveQuery(async () => ({ revisions: await db.revisions.toArray(), sessions: await db.sessions.toArray() }))
  if (!data) return null
  const { revisions, sessions } = data

  const days = profile.examDate ? Math.ceil((new Date(profile.examDate + 'T00:00').getTime() - Date.now()) / 86_400_000) : null
  const matieres = [...new Set(revisions.map((r) => r.matiere))].sort().map((m) => {
    const rs = revisions.filter((r) => r.matiere === m)
    const scored = rs.filter((r) => r.bestScore !== undefined)
    const cartes = rs.flatMap((r) => r.cartes)
    return {
      m,
      count: rs.length,
      score: scored.length ? Math.round(scored.reduce((s, r) => s + r.bestScore!, 0) / scored.length) : null,
      maitrise: cartes.length ? Math.round((100 * cartes.filter((c) => c.boite >= 4).length) / cartes.length) : null,
    }
  })
  const now = weekStart(Date.now())
  const weeks = Array.from({ length: 8 }, (_, i) => now - (7 - i) * WEEK).map((w) => ({ w, n: sessions.filter((s) => s.date >= w && s.date < w + WEEK).length }))
  const max = Math.max(1, ...weeks.map((w) => w.n))

  return (
    <main className="page">
      <Header title="Statistiques" />
      {days !== null && (
        <section className="card center">
          <p className="score">{days > 0 ? `J-${days}` : days === 0 ? 'Jour J !' : 'Examens passés'}</p>
          <p>{days > 0 ? `avant tes examens (${new Date(profile.examDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })})` : days === 0 ? 'Tu vas tout déchirer 💪' : 'Bravo pour tout ce travail !'}</p>
        </section>
      )}
      <section className="card">
        <h2>Sessions par semaine</h2>
        <div className="bars" role="list">
          {weeks.map(({ w, n }) => (
            <div key={w} className="bar" role="listitem" aria-label={`Semaine du ${formatDate(w)} : ${n} session${n > 1 ? 's' : ''}`}>
              <span className="bar-n">{n || ''}</span>
              <div style={{ height: `${(100 * n) / max}%` }} />
              <span className="bar-l">{formatDate(w)}</span>
            </div>
          ))}
        </div>
        <p className="muted">Total : {sessions.length} session{sessions.length > 1 ? 's' : ''}</p>
      </section>
      <section className="card">
        <h2>Progression par matière</h2>
        {matieres.length === 0 && <p className="muted">Crée ta première révision pour voir ta progression ici.</p>}
        <ul className="stack tight plain">
          {matieres.map((x) => (
            <li key={x.m}>
              <strong>{x.m}</strong> <span className="muted">· {x.count} révision{x.count > 1 ? 's' : ''}</span>
              <Meter label="Quiz (moyenne des meilleurs scores)" value={x.score} />
              <Meter label="Cartes maîtrisées (boîte 4 ou 5)" value={x.maitrise} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

function Meter({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null
  return (
    <div className="meter">
      <span className="muted">{label} : {value} %</span>
      <div className="progress" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

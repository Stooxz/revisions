import { useRef, useState } from 'react'
import { db, saveSession } from '../db.ts'
import { isDue, review, shuffle } from '../logic.ts'
import type { Revision } from '../types.ts'
import { Header } from '../ui.tsx'

export function Cards({ r }: { r: Revision }) {
  const dueIdx = () => shuffle(r.cartes.map((_, i) => i).filter((i) => isDue(r.cartes[i])))
  const [queue, setQueue] = useState<number[]>(dueIdx)
  const [flipped, setFlipped] = useState(false)
  const firstTry = useRef(new Map<number, boolean>())
  const start = useRef(Date.now())
  const [finished, setFinished] = useState(false)

  const startAll = () => {
    setQueue(shuffle(r.cartes.map((_, i) => i)))
    firstTry.current.clear()
    start.current = Date.now()
    setFinished(false)
  }

  const answer = async (savais: boolean) => {
    const i = queue[0]
    const cartes = (await db.revisions.get(r.id!))!.cartes
    cartes[i] = review(cartes[i], savais)
    await db.revisions.update(r.id!, { cartes })
    if (!firstTry.current.has(i)) firstTry.current.set(i, savais)
    const rest = savais ? queue.slice(1) : [...queue.slice(1), i] // « À revoir » : elle revient en fin de paquet
    setFlipped(false)
    setQueue(rest)
    if (!rest.length) {
      const res = [...firstTry.current.values()]
      await saveSession({ revisionId: r.id!, matiere: r.matiere, date: Date.now(), kind: 'cartes', score: res.filter(Boolean).length, total: res.length, durationMs: Date.now() - start.current })
      setFinished(true)
    }
  }

  if (!queue.length) {
    const res = [...firstTry.current.values()]
    return (
      <main className="page">
        <Header title="Cartes" back={`r/${r.id}`} />
        <section className="card center pop">
          <p className="hero-emoji" aria-hidden="true">{finished ? '🎉' : '😌'}</p>
          {finished ? (
            <p>Paquet terminé ! {res.filter(Boolean).length} / {res.length} sues du premier coup.</p>
          ) : (
            <p>Rien à revoir aujourd'hui, tes cartes sont à jour.</p>
          )}
        </section>
        <div className="actions">
          <button className="btn" onClick={startAll}>Réviser toutes les cartes</button>
          <a className="btn ghost" href={`#/r/${r.id}`}>Retour à la fiche</a>
        </div>
      </main>
    )
  }

  const c = r.cartes[queue[0]]
  return (
    <main className="page">
      <Header title={`Cartes · ${queue.length} restante${queue.length > 1 ? 's' : ''}`} back={`r/${r.id}`} />
      <p className="muted center">Boîte {c.boite} / 5</p>
      <button className={`flashcard ${flipped ? 'flipped' : ''}`} onClick={() => setFlipped(!flipped)} aria-label={flipped ? `Verso : ${c.verso}. Toucher pour revoir le recto` : `Recto : ${c.recto}. Toucher pour retourner`}>
        <span className="face front">{c.recto}</span>
        <span className="face back">{c.verso}</span>
      </button>
      {flipped ? (
        <div className="row2">
          <button className="btn bad big" onClick={() => answer(false)}>À revoir</button>
          <button className="btn good big" onClick={() => answer(true)}>Je savais</button>
        </div>
      ) : (
        <p className="muted center">Touche la carte pour la retourner</p>
      )}
    </main>
  )
}

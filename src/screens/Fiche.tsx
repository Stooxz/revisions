import { useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import { isDue } from '../logic.ts'
import type { Revision } from '../types.ts'
import { Header } from '../ui.tsx'

export function FicheView({ r }: { r: Revision }) {
  const [lecture, setLecture] = useState(false)
  useEffect(() => {
    document.body.classList.toggle('lecture', lecture)
    return () => document.body.classList.remove('lecture')
  }, [lecture])
  const f = r.fiche
  const due = r.cartes.filter((c) => isDue(c)).length

  return (
    <main className="page fiche">
      <Header title={r.matiere} back="">
        <button className="btn icon ghost no-print" aria-pressed={lecture} aria-label="Mode lecture" title="Mode lecture" onClick={() => setLecture(!lecture)}>
          📖
        </button>
      </Header>
      <div className="actions no-print">
        <a className={`btn primary ${r.questions.length ? '' : 'disabled'}`} href={r.questions.length ? `#/r/${r.id}/quiz` : undefined} aria-disabled={!r.questions.length}>
          ▶ Lancer le quiz
        </a>
        <a className={`btn ${r.cartes.length ? '' : 'disabled'}`} href={r.cartes.length ? `#/r/${r.id}/cartes` : undefined} aria-disabled={!r.cartes.length}>
          🃏 Réviser les cartes{due ? ` (${due})` : ''}
        </a>
      </div>
      <article className="card prose">
        <h1>{f.titre}</h1>
        {f.resume && <div className="resume"><h2>Résumé</h2><p>{f.resume}</p></div>}
        {f.sections.map((s, i) => (
          <section key={i}>
            <h2>{s.titre}</h2>
            <Markdown>{s.contenu}</Markdown>
          </section>
        ))}
        {f.definitions.length > 0 && (
          <section>
            <h2>Définitions clés</h2>
            <dl>
              {f.definitions.map((d, i) => (
                <div key={i}>
                  <dt>{d.terme}</dt>
                  <dd>{d.definition}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        {f.astuces.length > 0 && (
          <section className="tip">
            <h2>💡 Astuces pour retenir</h2>
            <ul>{f.astuces.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </section>
        )}
        {f.erreurs.length > 0 && (
          <section className="warn-box">
            <h2>⚠️ Erreurs fréquentes</h2>
            <ul>{f.erreurs.map((a, i) => <li key={i}>{a}</li>)}</ul>
          </section>
        )}
      </article>
      <div className="actions no-print">
        <button className="btn" onClick={() => window.print()}>🖨️ Exporter en PDF</button>
        <a className="btn ghost" href={`#/r/${r.id}/modifier`}>✏️ Modifier</a>
      </div>
    </main>
  )
}

import { useMemo, useRef, useState } from 'react'
import { saveSession } from '../db.ts'
import { BLANK, grade, normalize, shuffle } from '../logic.ts'
import type { Question, Revision } from '../types.ts'
import { Header } from '../ui.tsx'

const expected = (q: Question) =>
  q.type === 'association' ? q.paires.map((p) => `${p.gauche} → ${p.droite}`).join(' ; ') : q.reponses.map((r) => r.split('|')[0]).join(q.type === 'trous' ? ', ' : ' / ')

interface Result { q: Question; ok: boolean; given: string }

export function Quiz({ r }: { r: Revision }) {
  const [run, setRun] = useState({ questions: shuffle(r.questions), full: true, n: 0 })
  const [idx, setIdx] = useState(0)
  const [results, setResults] = useState<Result[]>([])
  const start = useRef(Date.now())
  const [duration, setDuration] = useState(0)
  const done = idx >= run.questions.length

  const restart = (questions: Question[], full: boolean) => {
    setRun({ questions: shuffle(questions), full, n: run.n + 1 })
    setIdx(0)
    setResults([])
    start.current = Date.now()
  }

  const onAnswer = (res: Result) => {
    const all = [...results, res]
    setResults(all)
    if (all.length === run.questions.length) {
      const d = Date.now() - start.current
      setDuration(d)
      saveSession({ revisionId: r.id!, matiere: r.matiere, date: Date.now(), kind: 'quiz', score: all.filter((x) => x.ok).length, total: all.length, durationMs: d }, run.full)
    }
  }

  if (done) {
    const score = results.filter((x) => x.ok).length
    const errors = results.filter((x) => !x.ok)
    const pct = Math.round((100 * score) / results.length)
    const min = Math.floor(duration / 60000)
    const sec = Math.round((duration % 60000) / 1000)
    return (
      <main className="page">
        <Header title="Résultat" back={`r/${r.id}`} />
        <section className="card center pop">
          <p className="hero-emoji" aria-hidden="true">{pct >= 80 ? '🎉' : pct >= 50 ? '💪' : '🌱'}</p>
          <p className="score">{score} / {results.length}</p>
          <p>{pct >= 80 ? 'Bravo, tu maîtrises !' : pct >= 50 ? 'Bien joué, encore un petit effort !' : 'Chaque erreur te fait progresser. On recommence ?'}</p>
          <p className="muted">Temps : {min ? `${min} min ` : ''}{sec} s</p>
        </section>
        <div className="actions">
          {errors.length > 0 && <button className="btn primary" onClick={() => restart(errors.map((e) => e.q), false)}>🔁 Rejouer seulement mes erreurs</button>}
          <button className="btn" onClick={() => restart(r.questions, true)}>Recommencer tout</button>
          <a className="btn ghost" href={`#/r/${r.id}`}>Retour à la fiche</a>
        </div>
        {errors.length > 0 && <h2 className="group-title">Mes erreurs</h2>}
        {errors.map((e, i) => (
          <section key={i} className="card stack tight">
            <strong>{e.q.enonce}</strong>
            <p className="err-msg">Ta réponse : {e.given || '(vide)'}</p>
            <p className="ok-msg">Bonne réponse : {expected(e.q)}</p>
            {e.q.explication && <p>{e.q.explication}</p>}
          </section>
        ))}
      </main>
    )
  }

  const q = run.questions[idx]
  return (
    <main className="page">
      <Header title={`Question ${idx + 1} / ${run.questions.length}`} back={`r/${r.id}`} />
      <div className="progress" role="progressbar" aria-label="Progression du quiz" aria-valuemin={0} aria-valuemax={run.questions.length} aria-valuenow={idx}>
        <div style={{ width: `${(100 * idx) / run.questions.length}%` }} />
      </div>
      <QuestionCard key={`${run.n}-${idx}`} q={q} onAnswer={onAnswer} onNext={() => setIdx(idx + 1)} last={idx === run.questions.length - 1} />
    </main>
  )
}

function QuestionCard({ q, onAnswer, onNext, last }: { q: Question; onAnswer: (r: Result) => void; onNext: () => void; last: boolean }) {
  const choix = useMemo(() => (q.type === 'vrai_faux' ? q.choix : shuffle(q.choix)), [q])
  const droites = useMemo(() => shuffle(q.paires.map((p) => p.droite)), [q])
  const nbTrous = q.type === 'trous' ? q.reponses.length : q.type === 'association' ? q.paires.length : 1
  const [answer, setAnswer] = useState<string[]>(q.type === 'qcm' || q.type === 'vrai_faux' ? [] : Array(nbTrous).fill(''))
  const [ok, setOk] = useState<boolean | null>(null)
  const multi = q.type === 'qcm' && q.reponses.length > 1
  const setAt = (i: number, v: string) => setAnswer(answer.map((x, j) => (j === i ? v : x)))

  const check = () => {
    const res = grade(q, answer)
    setOk(res)
    onAnswer({ q, ok: res, given: q.type === 'association' ? q.paires.map((p, i) => `${p.gauche} → ${answer[i] || '?'}`).join(' ; ') : answer.filter(Boolean).join(', ') })
  }
  const ready = answer.length > 0 && answer.every((a) => a.trim())

  return (
    <section className={`card stack quiz ${ok === null ? '' : ok ? 'pop' : 'shake'}`}>
      {q.type === 'trous' ? (
        <p className="enonce">
          {q.enonce.split(BLANK).map((part, i, arr) => (
            <span key={i}>
              {part}
              {i < arr.length - 1 && <input className="blank" aria-label={`Trou ${i + 1}`} value={answer[i] ?? ''} disabled={ok !== null} onChange={(e) => setAt(i, e.target.value)} autoCapitalize="off" />}
            </span>
          ))}
        </p>
      ) : (
        <p className="enonce">{q.enonce}</p>
      )}

      {(q.type === 'qcm' || q.type === 'vrai_faux') && (
        <div className="choices" role="group" aria-label={multi ? 'Plusieurs réponses possibles' : 'Choisis une réponse'}>
          {multi && <p className="muted">Plusieurs réponses possibles</p>}
          {choix.map((c) => {
            const sel = answer.includes(c)
            const right = ok !== null && q.reponses.some((x) => normalize(x) === normalize(c))
            return (
              <button key={c} className={`choice ${right ? 'right' : ''} ${ok !== null && sel && !right ? 'wrong' : ''}`} aria-pressed={sel} disabled={ok !== null}
                onClick={() => setAnswer(multi ? (sel ? answer.filter((x) => x !== c) : [...answer, c]) : [c])}>
                {c}
              </button>
            )
          })}
        </div>
      )}
      {q.type === 'courte' && (
        <input aria-label="Ta réponse" placeholder="Ta réponse" value={answer[0]} disabled={ok !== null} onChange={(e) => setAt(0, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (ready && ok === null) check() } }} autoCapitalize="off" />
      )}
      {q.type === 'association' && (
        <div className="stack tight">
          {q.paires.map((p, i) => (
            <label key={i} className="field assoc">
              {p.gauche}
              <select value={answer[i]} disabled={ok !== null} onChange={(e) => setAt(i, e.target.value)}>
                <option value="">— choisir —</option>
                {droites.map((d) => <option key={d}>{d}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}

      {ok === null ? (
        <button className="btn primary big" disabled={!ready} onClick={check}>Valider</button>
      ) : (
        <>
          <div className={`feedback ${ok ? 'good' : 'bad'}`} role="alert">
            <strong>{ok ? '✔ Bonne réponse !' : '✘ Pas tout à fait…'}</strong>
            {!ok && <p>Bonne réponse : {expected(q)}</p>}
            {q.explication && <p>{q.explication}</p>}
          </div>
          <button className="btn primary big" onClick={onNext} autoFocus>{last ? 'Voir mon score' : 'Question suivante →'}</button>
        </>
      )}
    </section>
  )
}

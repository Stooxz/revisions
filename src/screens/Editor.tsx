import { useEffect, useState } from 'react'
import { db } from '../db.ts'
import { AIError, regenerateQuestion } from '../ia.ts'
import { cleanQuestion } from '../logic.ts'
import type { Question, Revision } from '../types.ts'
import { go, Header, toast } from '../ui.tsx'

const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)
const TYPE_LABEL = { qcm: 'QCM', vrai_faux: 'Vrai / faux', courte: 'Réponse courte', trous: 'Texte à trous', association: 'Association' }

/** Relecture et modification d'une révision (après génération ou plus tard). */
export function Editor({ revision }: { revision: Revision }) {
  const [r, setR] = useState(revision)
  useEffect(() => setR(revision), [revision.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const fiche = r.fiche
  const setFiche = (f: Partial<typeof fiche>) => setR({ ...r, fiche: { ...fiche, ...f } })
  const setQ = (i: number, q: Question) => setR({ ...r, questions: r.questions.map((x, j) => (j === i ? q : x)) })
  const [regen, setRegen] = useState<number | null>(null)

  const save = async () => {
    const bad = r.questions.findIndex((q) => !cleanQuestion(q))
    if (bad >= 0) return toast(`La question ${bad + 1} est incomplète (vérifie les réponses et les trous « ___ »).`)
    await db.revisions.put({ ...r, brouillon: false })
    toast('Révision enregistrée ✔')
    go(`/r/${r.id}`)
  }
  const remove = async () => {
    if (!confirm('Supprimer définitivement cette révision ?')) return
    await db.revisions.delete(r.id!)
    go('/')
  }
  const regenerate = async (i: number) => {
    setRegen(i)
    try {
      setQ(i, await regenerateQuestion(r.questions[i], r))
    } catch (e) {
      toast(e instanceof AIError ? e.message : 'Impossible de régénérer cette question.')
    }
    setRegen(null)
  }

  return (
    <main className="page">
      <Header title={r.brouillon ? 'Relis ta révision' : 'Modifier'} back={r.brouillon ? '' : `r/${r.id}`} />
      {r.brouillon && <p className="muted">Relis, corrige ce qui ne va pas, puis enregistre. Ton brouillon est déjà gardé sur ton téléphone.</p>}

      <section className="card stack">
        <h2>Fiche</h2>
        <label className="field">
          Titre
          <input value={fiche.titre} onChange={(e) => setFiche({ titre: e.target.value })} />
        </label>
        <label className="field">
          Résumé
          <textarea rows={3} value={fiche.resume} onChange={(e) => setFiche({ resume: e.target.value })} />
        </label>
        {fiche.sections.map((s, i) => (
          <div key={i} className="sub stack tight">
            <label className="field">
              Section {i + 1}
              <input value={s.titre} onChange={(e) => setFiche({ sections: fiche.sections.map((x, j) => (j === i ? { ...x, titre: e.target.value } : x)) })} />
            </label>
            <textarea aria-label={`Contenu de la section ${i + 1}`} rows={6} value={s.contenu} onChange={(e) => setFiche({ sections: fiche.sections.map((x, j) => (j === i ? { ...x, contenu: e.target.value } : x)) })} />
            <button type="button" className="btn ghost small" onClick={() => setFiche({ sections: fiche.sections.filter((_, j) => j !== i) })}>
              Supprimer la section
            </button>
          </div>
        ))}
        <label className="field">
          Définitions <span className="muted">(une par ligne : terme = définition)</span>
          <textarea rows={5} defaultValue={fiche.definitions.map((d) => `${d.terme} = ${d.definition}`).join('\n')} onBlur={(e) => setFiche({ definitions: lines(e.target.value).map((l) => { const [t, ...d] = l.split('='); return { terme: t.trim(), definition: d.join('=').trim() } }) })} />
        </label>
        <label className="field">
          Astuces <span className="muted">(une par ligne)</span>
          <textarea rows={3} defaultValue={fiche.astuces.join('\n')} onBlur={(e) => setFiche({ astuces: lines(e.target.value) })} />
        </label>
        <label className="field">
          Erreurs fréquentes <span className="muted">(une par ligne)</span>
          <textarea rows={3} defaultValue={fiche.erreurs.join('\n')} onBlur={(e) => setFiche({ erreurs: lines(e.target.value) })} />
        </label>
      </section>

      {r.questions.length > 0 && <h2 className="group-title">Questions ({r.questions.length})</h2>}
      {r.questions.map((q, i) => (
        <section key={i} className="card stack tight" aria-busy={regen === i}>
          <p className="badge">{i + 1}. {TYPE_LABEL[q.type]}</p>
          <label className="field">
            Énoncé{q.type === 'trous' && <span className="muted"> (« ___ » pour chaque trou)</span>}
            <textarea rows={3} value={q.enonce} onChange={(e) => setQ(i, { ...q, enonce: e.target.value })} />
          </label>
          {q.type === 'qcm' && (
            <label className="field">
              Choix <span className="muted">(un par ligne)</span>
              <textarea rows={4} value={q.choix.join('\n')} onChange={(e) => setQ(i, { ...q, choix: e.target.value.split('\n') })} onBlur={() => setQ(i, { ...q, choix: lines(q.choix.join('\n')) })} />
            </label>
          )}
          {q.type === 'association' ? (
            <label className="field">
              Paires <span className="muted">(une par ligne : gauche = droite)</span>
              <textarea key={JSON.stringify(q.paires)} rows={4} defaultValue={q.paires.map((p) => `${p.gauche} = ${p.droite}`).join('\n')} onBlur={(e) => setQ(i, { ...q, paires: lines(e.target.value).map((l) => { const [g, ...d] = l.split('='); return { gauche: g.trim(), droite: d.join('=').trim() } }) })} />
            </label>
          ) : q.type === 'vrai_faux' ? (
            <label className="field">
              Bonne réponse
              <select value={q.reponses[0]} onChange={(e) => setQ(i, { ...q, reponses: [e.target.value] })}>
                <option>Vrai</option>
                <option>Faux</option>
              </select>
            </label>
          ) : (
            <label className="field">
              Bonne(s) réponse(s) <span className="muted">(une par ligne{q.type === 'trous' ? ', dans l’ordre des trous' : ''})</span>
              <textarea rows={2} value={q.reponses.join('\n')} onChange={(e) => setQ(i, { ...q, reponses: e.target.value.split('\n') })} onBlur={() => setQ(i, { ...q, reponses: lines(q.reponses.join('\n')) })} />
            </label>
          )}
          <label className="field">
            Explication
            <textarea rows={2} value={q.explication} onChange={(e) => setQ(i, { ...q, explication: e.target.value })} />
          </label>
          <div className="inline">
            <button type="button" className="btn small" disabled={regen !== null} onClick={() => regenerate(i)}>
              {regen === i ? 'Je réfléchis…' : '🔄 Régénérer'}
            </button>
            <button type="button" className="btn ghost small" onClick={() => setR({ ...r, questions: r.questions.filter((_, j) => j !== i) })}>
              Supprimer
            </button>
          </div>
        </section>
      ))}

      {r.cartes.length > 0 && <h2 className="group-title">Cartes ({r.cartes.length})</h2>}
      {r.cartes.map((c, i) => (
        <section key={i} className="card stack tight">
          <label className="field">
            Recto {i + 1}
            <input value={c.recto} onChange={(e) => setR({ ...r, cartes: r.cartes.map((x, j) => (j === i ? { ...x, recto: e.target.value } : x)) })} />
          </label>
          <label className="field">
            Verso
            <textarea rows={2} value={c.verso} onChange={(e) => setR({ ...r, cartes: r.cartes.map((x, j) => (j === i ? { ...x, verso: e.target.value } : x)) })} />
          </label>
          <button type="button" className="btn ghost small" onClick={() => setR({ ...r, cartes: r.cartes.filter((_, j) => j !== i) })}>
            Supprimer la carte
          </button>
        </section>
      ))}

      <div className="sticky-actions">
        <button className="btn ghost" onClick={remove}>Supprimer</button>
        <button className="btn primary" onClick={save}>Enregistrer</button>
      </div>
    </main>
  )
}

import { useState } from 'react'
import { setSetting } from '../db.ts'
import { GeminiError, testKey } from '../gemini.ts'
import type { Profile } from '../types.ts'

// Blocs de compétences du BTS CI (France compétences, RNCP41759) + enseignements généraux du BTS
export const MATIERES_BTS_CI = [
  'Relation commerciale interculturelle',
  'Opérations internationales',
  'Développement commercial international',
  'Culture économique, juridique et managériale (CEJM)',
  'Culture générale et expression',
  'Langue vivante A (anglais)',
  'Langue vivante B',
]

export const emptyProfile = (): Profile => ({
  prenom: '',
  formation: 'BTS Commerce international',
  etablissement: '',
  annee: '2e année',
  examDate: '',
  matieres: [...MATIERES_BTS_CI],
})

export function ProfileForm({ value, onChange }: { value: Profile; onChange: (p: Profile) => void }) {
  const [extra, setExtra] = useState('')
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => onChange({ ...value, [k]: v })
  const all = [...new Set([...MATIERES_BTS_CI, ...value.matieres])]
  const toggle = (m: string) => set('matieres', value.matieres.includes(m) ? value.matieres.filter((x) => x !== m) : [...value.matieres, m])
  const add = () => {
    const m = extra.trim()
    if (m && !value.matieres.includes(m)) set('matieres', [...value.matieres, m])
    setExtra('')
  }
  return (
    <div className="profile-fields">
      <label className="field">
        Prénom
        <input value={value.prenom} onChange={(e) => set('prenom', e.target.value)} autoComplete="given-name" />
      </label>
      <label className="field">
        Formation
        <input value={value.formation} onChange={(e) => set('formation', e.target.value)} />
      </label>
      <label className="field">
        Établissement
        <input value={value.etablissement} onChange={(e) => set('etablissement', e.target.value)} />
      </label>
      <div className="row2">
        <label className="field">
          Année
          <input value={value.annee} onChange={(e) => set('annee', e.target.value)} />
        </label>
        <label className="field">
          <span>Date des examens <small className="muted">(facultatif)</small></span>
          <input type="date" value={value.examDate} onChange={(e) => set('examDate', e.target.value)} />
        </label>
      </div>
      <fieldset className="field">
        <legend>Mes matières</legend>
        <div className="checks">
          {all.map((m) => (
            <label key={m} className="check">
              <input type="checkbox" checked={value.matieres.includes(m)} onChange={() => toggle(m)} />
              {m}
            </label>
          ))}
        </div>
        <div className="inline">
          <input aria-label="Ajouter une matière" placeholder="Ajouter une matière…" value={extra} onChange={(e) => setExtra(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} />
          <button type="button" className="btn" onClick={add}>Ajouter</button>
        </div>
      </fieldset>
    </div>
  )
}

export function KeyForm({ initial }: { initial?: string }) {
  const [key, setKey] = useState(initial ?? '')
  const [state, setState] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'err'; msg?: string }>({ kind: 'idle' })
  const test = async () => {
    setState({ kind: 'busy' })
    try {
      const model = await testKey(key.trim())
      await setSetting('apiKey', key.trim())
      await setSetting('model', model)
      setState({ kind: 'ok', msg: `Clé valide ✔ Modèle choisi : ${model}` })
    } catch (e) {
      setState({ kind: 'err', msg: e instanceof GeminiError ? e.message : String(e) })
    }
  }
  return (
    <div className="stack">
      <ol className="steps">
        <li>
          Ouvre <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com</a> et connecte-toi avec un compte Google.
        </li>
        <li>Clique sur « Create API key » (c'est gratuit).</li>
        <li>Copie la clé, colle-la ci-dessous puis touche « Tester ma clé ».</li>
      </ol>
      <p className="key-note">Ta clé reste sur ton téléphone : elle n'est envoyée qu'à Google pour créer tes révisions.</p>
      <label className="field">
        Clé API Gemini
        <input value={key} onChange={(e) => setKey(e.target.value)} onBlur={() => key.trim() && setSetting('apiKey', key.trim())} autoComplete="off" spellCheck={false} placeholder="Colle ta clé ici" />
      </label>
      <button type="button" className="btn" onClick={test} disabled={!key.trim() || state.kind === 'busy'}>
        {state.kind === 'busy' ? 'Test en cours…' : 'Tester ma clé'}
      </button>
      {state.msg && (
        <p className={state.kind === 'ok' ? 'ok-msg' : 'err-msg'} role="alert">
          {state.msg}
        </p>
      )}
    </div>
  )
}

import { useState } from 'react'
import { importAll, setSetting } from '../db.ts'
import { toast } from '../ui.tsx'
import { emptyProfile, KeyForm, ProfileForm } from './ProfileForms.tsx'

export function Welcome() {
  const [profile, setProfile] = useState(emptyProfile)
  return (
    <main className="page welcome">
      <div className="hero">
        <div className="hero-emoji" aria-hidden="true">📚✨</div>
        <h1>Ton appli de révisions</h1>
        <p>Des fiches, des quiz et des cartes créés pour toi, à partir de tes cours. Commençons par faire connaissance !</p>
      </div>
      <section className="card">
        <h2>Ton profil</h2>
        <ProfileForm value={profile} onChange={setProfile} />
      </section>
      <section className="card">
        <h2>Ta clé Claude</h2>
        <KeyForm />
        <p className="muted">Tu peux aussi le faire plus tard dans les Réglages.</p>
      </section>
      <button className="btn primary big" onClick={() => setSetting('profile', profile)}>
        C'est parti !
      </button>
      <label className="btn ghost file">
        J'ai déjà une sauvegarde : la restaurer
        <input type="file" accept="application/json,.json" onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          f?.text().then(importAll).catch((err) => toast(err instanceof Error ? err.message : String(err)))
        }} />
      </label>
    </main>
  )
}

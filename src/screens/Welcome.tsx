import { useState } from 'react'
import { importAll, setSetting } from '../db.ts'
import { Masthead, toast } from '../ui.tsx'
import carnet from '../assets/carnet.png'
import { emptyProfile, KeyForm, ProfileForm } from './ProfileForms.tsx'

export function Welcome() {
  const [profile, setProfile] = useState(emptyProfile)
  return (
    <>
      <Masthead>
        <label className="btn file restore">
          Restaurer une sauvegarde
          <input type="file" accept="application/json,.json" onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            f?.text().then(importAll).catch((err) => toast(err instanceof Error ? err.message : String(err)))
          }} />
        </label>
      </Masthead>
      <main className="page welcome">
        <section className="hero paper-grid">
          <div className="hero-copy">
            <h1>Ton appli de <em>révisions</em></h1>
            <p>Des fiches, des quiz et des cartes créés pour toi, à partir de tes cours.</p>
          </div>
          <img className="carnet" src={carnet} alt="" width="1000" height="572" />
        </section>
        <div className="welcome-grid">
          <section className="card">
            <div className="panel-heading">
              <span className="pictogram profile-mark" aria-hidden="true" />
              <h2>Ton profil</h2>
            </div>
            <p className="panel-intro">Commençons par faire connaissance !</p>
            <ProfileForm value={profile} onChange={setProfile} />
          </section>
          <section className="card">
            <div className="panel-heading">
              <span className="pictogram key-mark" aria-hidden="true" />
              <h2>Ta clé Gemini</h2>
              <span className="badge warn">Facultatif</span>
            </div>
            <p className="panel-intro">Tu peux aussi le faire plus tard dans les Réglages.</p>
            <KeyForm />
          </section>
        </div>
        <button className="btn primary big welcome-start" onClick={() => setSetting('profile', profile)}>
          C'est parti !
        </button>
      </main>
    </>
  )
}

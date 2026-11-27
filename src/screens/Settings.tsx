import { useState } from 'react'
import { exportAll, importAll, setSetting, wipeAll, type Settings as S } from '../db.ts'
import { DEFAULT_MODEL, MODELS } from '../ia.ts'
import { downloadBlob, Header, toast } from '../ui.tsx'
import { KeyForm, ProfileForm } from './ProfileForms.tsx'

export function Settings({ settings }: { settings: S }) {
  const [profile, setProfile] = useState(settings.profile!)

  const doExport = async () => downloadBlob(await exportAll(), `revisions-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`)
  const doImport = async (file?: File) => {
    if (!file || !confirm('Importer cette sauvegarde remplace toutes tes données actuelles. Continuer ?')) return
    try {
      await importAll(await file.text())
      toast('Sauvegarde restaurée ✔')
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e))
    }
  }
  const doWipe = async () => {
    if (!confirm('Supprimer TOUTES tes données (profil, clé, révisions, progression) ? Exporte une sauvegarde avant si tu veux les garder.')) return
    if (!confirm('Vraiment tout supprimer ? Impossible de revenir en arrière.')) return
    await wipeAll()
    location.hash = ''
  }

  return (
    <main className="page">
      <Header title="Réglages" />
      <section className="card stack">
        <h2>Mon profil</h2>
        <ProfileForm value={profile} onChange={setProfile} />
        <button className="btn primary" onClick={() => setSetting('profile', profile).then(() => toast('Profil enregistré ✔'))}>
          Enregistrer le profil
        </button>
      </section>

      <section className="card stack">
        <h2>Clé Claude</h2>
        <KeyForm initial={settings.apiKey} />
        <label className="field">
          Modèle
          <select value={MODELS.some(([id]) => id === settings.model) ? settings.model : DEFAULT_MODEL} onChange={(e) => setSetting('model', e.target.value)}>
            {MODELS.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="card stack">
        <h2>Apparence</h2>
        <div className="segmented" role="radiogroup" aria-label="Thème">
          {(['auto', 'clair', 'sombre'] as const).map((t) => (
            <label key={t}>
              <input type="radio" name="theme" checked={(settings.theme ?? 'auto') === t} onChange={() => setSetting('theme', t)} />
              <span>{t === 'auto' ? 'Automatique' : t === 'clair' ? 'Clair' : 'Sombre'}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="card stack">
        <h2>Sauvegarde</h2>
        <p className="muted">Tes données ne sont que sur cet appareil. Exporte une sauvegarde de temps en temps (elle contient aussi ta clé : garde-la pour toi).</p>
        <button className="btn" onClick={doExport}>⬇️ Exporter ma sauvegarde</button>
        <label className="btn file">
          ⬆️ Importer une sauvegarde
          <input type="file" accept="application/json,.json" onChange={(e) => (doImport(e.target.files?.[0]), (e.target.value = ''))} />
        </label>
        <button className="btn danger" onClick={doWipe}>Supprimer toutes mes données</button>
      </section>
    </main>
  )
}

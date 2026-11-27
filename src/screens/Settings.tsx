import { useEffect, useState } from 'react'
import { exportAll, importAll, setSetting, wipeAll, type Settings as S } from '../db.ts'
import { ensureModel, GeminiError, listModels } from '../gemini.ts'
import { downloadBlob, Header, toast } from '../ui.tsx'
import { KeyForm, ProfileForm } from './ProfileForms.tsx'

/** Télécharge la dernière version publiée puis recharge l'appli. */
async function updateApp() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? []
    await Promise.all(regs.map((r) => r.update()))
  } catch {
    /* hors ligne : on recharge quand même */
  }
  location.reload()
}

export function Settings({ settings }: { settings: S }) {
  const [profile, setProfile] = useState(settings.profile!)
  const [models, setModels] = useState<string[]>([])
  const [modelMsg, setModelMsg] = useState('')

  const loadModels = async () => {
    setModelMsg('Chargement…')
    try {
      await ensureModel(settings.apiKey ?? '') // bascule et prévient si le modèle enregistré a disparu
      setModels(await listModels(settings.apiKey ?? ''))
      setModelMsg('')
    } catch (e) {
      setModelMsg(e instanceof GeminiError ? e.message : String(e))
    }
  }
  useEffect(() => {
    if (settings.apiKey) loadModels()
  }, [settings.apiKey]) // eslint-disable-line react-hooks/exhaustive-deps

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
        <h2>Clé Gemini</h2>
        <KeyForm initial={settings.apiKey} />
        <label className="field">
          Modèle
          <select value={settings.model ?? ''} onChange={(e) => setSetting('model', e.target.value)} disabled={!models.length}>
            {!models.length && <option value="">{settings.model || '—'}</option>}
            {models.map((m, i) => (
              <option key={m} value={m}>{m}{i === 0 ? ' (recommandé)' : ''}</option>
            ))}
          </select>
        </label>
        {modelMsg && <p className="muted" role="status">{modelMsg}</p>}
        <button className="btn small ghost" onClick={loadModels} disabled={!settings.apiKey}>Actualiser la liste des modèles</button>
      </section>

      <section className="card stack">
        <h2>Version</h2>
        <p className="muted">Version du {__BUILD__}</p>
        <button className="btn small ghost" onClick={updateApp}>Chercher une mise à jour</button>
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

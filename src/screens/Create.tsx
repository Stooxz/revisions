import { useEffect, useState } from 'react'
import { db } from '../db.ts'
import { GeminiError, generateRevision } from '../gemini.ts'
import type { Attachment, Niveau, Profile, QType } from '../types.ts'
import { go, Header } from '../ui.tsx'

const TYPES: [QType | 'cartes', string][] = [
  ['qcm', 'QCM'], ['vrai_faux', 'Vrai / faux'], ['courte', 'Réponse courte'], ['trous', 'Texte à trous'], ['association', 'Association'], ['cartes', 'Cartes recto-verso'],
]
const NIVEAUX: Niveau[] = ['découverte', 'intermédiaire', 'examen']
const MAX_BYTES = 15 * 1024 * 1024 // limite d'une requête Gemini avec fichiers en base64 (marge sous 20 Mo)
const MESSAGES = ['Je lis tes cours…', 'Je repère les notions clés…', 'Je prépare ta fiche…', 'J’invente des questions pièges (mais gentilles)…', 'Je fabrique tes cartes…', 'Presque fini…']

const readBase64 = (file: Blob) =>
  new Promise<string>((ok, ko) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result).split(',')[1])
    r.onerror = () => ko(r.error)
    r.readAsDataURL(file)
  })

/** Images : largeur max 1600 px, JPEG ~0,8. */
async function toAttachment(file: File): Promise<Attachment> {
  if (!file.type.startsWith('image/')) return { name: file.name, mimeType: file.type || 'application/pdf', data: await readBase64(file) }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const scale = Math.min(1, 1600 / img.naturalWidth)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return { name: file.name.replace(/\.\w+$/, '') + '.jpg', mimeType: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.8).split(',')[1] }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const sizeOf = (a: Attachment) => Math.round((a.data.length * 3) / 4)
const mo = (n: number) => `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`

export function Create({ profile }: { profile: Profile }) {
  const [theme, setTheme] = useState('')
  const [matiere, setMatiere] = useState(profile.matieres[0] ?? '')
  const [niveau, setNiveau] = useState<Niveau>('intermédiaire')
  const [nombre, setNombre] = useState(10)
  const [types, setTypes] = useState<(QType | 'cartes')[]>(['qcm', 'vrai_faux', 'courte', 'cartes'])
  const [files, setFiles] = useState<Attachment[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const total = files.reduce((s, a) => s + sizeOf(a), 0)

  const addFiles = async (list: FileList | null) => {
    if (!list) return
    setError('')
    try {
      const added = await Promise.all([...list].map(toAttachment))
      setFiles((f) => [...f, ...added])
    } catch {
      setError("Je n'arrive pas à lire ce fichier. Essaie une autre photo ou un PDF.")
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const sujet = theme.trim()
    if (!sujet && !files.length) return setError('Indique un thème ou ajoute tes cours (PDF ou photo).')
    if (!matiere.trim()) return setError('Choisis une matière.')
    if (!types.length) return setError('Choisis au moins un type de question.')
    if (total > MAX_BYTES) return setError(`Tes pièces jointes pèsent ${mo(total)}, la limite est de 15 Mo. Retire un fichier ou envoie seulement les pages utiles de ton PDF.`)
    setError('')
    setBusy(true)
    try {
      const out = await generateRevision({ theme: sujet || 'à déduire des pièces jointes', matiere: matiere.trim(), niveau, nombre, types, attachments: files })
      const id = await db.revisions.add({ theme: sujet || out.fiche.titre || 'Révision', matiere: matiere.trim(), niveau, createdAt: Date.now(), brouillon: true, favori: false, attachments: files, ...out })
      go(`/r/${id}/modifier`)
    } catch (err) {
      setError(err instanceof GeminiError ? err.message : `Oups, quelque chose a coincé : ${String(err)}`)
      setBusy(false)
    }
  }

  if (busy) return <Waiting />

  return (
    <main className="page">
      <Header title="Nouvelle révision" />
      <form className="card stack creation-form" onSubmit={submit}>
        <label className="field">
          Thème {files.length > 0 && <span className="muted">(facultatif avec des cours joints)</span>}
          <input value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="ex. Incoterms 2020" />
        </label>
        <label className="field">
          Matière
          {profile.matieres.length ? (
            <select value={matiere} onChange={(e) => setMatiere(e.target.value)}>
              {profile.matieres.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          ) : (
            <input value={matiere} onChange={(e) => setMatiere(e.target.value)} placeholder="ex. Droit" />
          )}
        </label>
        <fieldset className="field">
          <legend>Niveau</legend>
          <div className="segmented">
            {NIVEAUX.map((n) => (
              <label key={n}>
                <input type="radio" name="niveau" checked={niveau === n} onChange={() => setNiveau(n)} />
                <span>{n}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="field">
          <legend>Nombre de questions</legend>
          <div className="segmented">
            {[5, 10, 15, 20].map((n) => (
              <label key={n}>
                <input type="radio" name="nombre" checked={nombre === n} onChange={() => setNombre(n)} />
                <span>{n}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="field">
          <legend>Types de questions</legend>
          <div className="checks">
            {TYPES.map(([t, label]) => (
              <label key={t} className="check">
                <input type="checkbox" checked={types.includes(t)} onChange={() => setTypes((l) => (l.includes(t) ? l.filter((x) => x !== t) : [...l, t]))} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="field">
          <legend>Mes cours <span className="muted">(facultatif)</span></legend>
          <div className="inline">
            <label className="btn file">
              📄 PDF ou image
              <input type="file" accept="application/pdf,image/*" multiple onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))} />
            </label>
            <label className="btn file">
              📷 Prendre une photo
              <input type="file" accept="image/*" capture="environment" onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))} />
            </label>
          </div>
          {files.length > 0 && (
            <ul className="files">
              {files.map((f, i) => (
                <li key={i}>
                  <span>{f.mimeType === 'application/pdf' ? '📄' : '🖼️'} {f.name} <span className="muted">({mo(sizeOf(f))})</span></span>
                  <button type="button" className="btn icon ghost" aria-label={`Retirer ${f.name}`} onClick={() => setFiles((l) => l.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        {error && <p className="err-msg" role="alert">{error}</p>}
        <button type="submit" className="btn primary big">
          ✨ Générer
        </button>
      </form>
    </main>
  )
}

function Waiting() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % MESSAGES.length), 2500)
    return () => clearInterval(t)
  }, [])
  return (
    <main className="page waiting" aria-busy="true">
      <div className="orbit" aria-hidden="true">
        <span>📚</span>
      </div>
      <p className="wait-msg" role="status" aria-live="polite" key={i}>
        {MESSAGES[i]}
      </p>
      <p className="muted">Ça peut prendre jusqu'à une minute.</p>
    </main>
  )
}

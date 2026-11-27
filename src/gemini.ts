import { getSetting, setSetting } from './db.ts'
import { cleanGenerated, cleanQuestion, fallbackOrder, pickModel, thinkingFor } from './logic.ts'
import type { ApiModel, Attachment, Fiche, Niveau, Question, QType } from './types.ts'
import { toast } from './ui.tsx'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

export class GeminiError extends Error {
  kind: 'cle' | 'quota' | 'surcharge' | 'reseau' | 'modele' | 'autre'
  status?: number
  constructor(kind: GeminiError['kind'], message: string, status?: number) {
    super(message)
    this.kind = kind
    this.status = status
  }
}

const OFFLINE = new GeminiError('reseau', "Pas de connexion internet. Tes révisions déjà créées restent disponibles ; reconnecte-toi pour en générer de nouvelles.")

const SURCHARGE = 'Gemini est surchargé en ce moment. Réessaie dans quelques minutes.'

async function call<T>(path: string, key: string, body?: unknown, timeoutMs = 30_000): Promise<T> {
  if (!key) throw new GeminiError('cle', "Ajoute d'abord ta clé Gemini dans les Réglages.")
  if (!navigator.onLine) throw OFFLINE
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(BASE + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'x-goog-api-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
  } catch {
    if (ctrl.signal.aborted) throw new GeminiError('surcharge', 'Gemini met trop de temps à répondre.')
    throw OFFLINE
  } finally {
    clearTimeout(timer)
  }
  if (res.ok) return res.json()
  const err = (await res.json().catch(() => ({}))) as { error?: { message?: string; status?: string } }
  const msg = err.error?.message ?? ''
  if (res.status === 429) throw new GeminiError('quota', "Tu as atteint la limite gratuite pour l'instant, réessaie dans quelques minutes.", 429)
  if (res.status === 401 || res.status === 403 || /api key/i.test(msg))
    throw new GeminiError('cle', 'Ta clé Gemini est refusée. Vérifie-la dans les Réglages (copie-la en entier depuis AI Studio).')
  if (res.status === 404) throw new GeminiError('modele', 'Ce modèle Gemini n’existe plus.', 404)
  if (res.status >= 500) throw new GeminiError('surcharge', SURCHARGE, res.status)
  throw new GeminiError('autre', `Gemini a refusé la demande (${res.status}). ${msg}`, res.status)
}

export async function listModels(key: string): Promise<string[]> {
  const r = await call<{ models?: ApiModel[] }>('/models?pageSize=1000', key)
  const models = (r.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
  const best = pickModel(models)
  const names = models.map((m) => m.name.replace(/^models\//, '')).filter((n) => n.startsWith('gemini'))
  return best ? [best, ...names.filter((n) => n !== best)] : names
}

/** Vérifie la clé et renvoie le modèle par défaut. */
export async function testKey(key: string): Promise<string> {
  const [best] = await listModels(key)
  if (!best) throw new GeminiError('modele', 'Aucun modèle Gemini disponible avec cette clé.')
  return best
}

/** Vérifie que le modèle enregistré existe encore ; sinon bascule sur le meilleur et le signale. */
export async function ensureModel(key: string): Promise<string> {
  const current = await getSetting('model')
  const names = await listModels(key)
  if (current && names.includes(current)) return current
  const next = names[0]
  if (!next) throw new GeminiError('modele', 'Aucun modèle Gemini disponible avec cette clé.')
  await setSetting('model', next)
  if (current) toast(`Le modèle ${current} n'est plus disponible : j'utilise maintenant ${next}.`)
  return next
}

type Part = { text: string } | { inlineData: { mimeType: string; data: string } }

const GEN_TIMEOUT = 120_000 // une génération avec PDF peut prendre ~1 min ; au-delà, on passe à la suite
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function generateJSON(parts: Part[], schema: object, system: string): Promise<unknown> {
  const key = (await getSetting('apiKey')) ?? ''
  const model = (await getSetting('model')) || (await ensureModel(key))
  const body = (m: string, thinking = true) => {
    const thinkingConfig = thinking ? thinkingFor(m) : undefined
    return {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.6, ...(thinkingConfig ? { thinkingConfig } : {}) },
    }
  }
  type Resp = { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } }
  const attempt = async (m: string) => {
    try {
      return await call<Resp>(`/models/${m}:generateContent`, key, body(m), GEN_TIMEOUT)
    } catch (e) {
      // Si ce modèle n'accepte pas le réglage de réflexion, on réessaie sans.
      if (e instanceof GeminiError && e.kind === 'autre' && /thinking/i.test(e.message) && thinkingFor(m))
        return call<Resp>(`/models/${m}:generateContent`, key, body(m, false), GEN_TIMEOUT)
      throw e
    }
  }

  const debut = Date.now()
  const passager = (e: unknown): e is GeminiError => e instanceof GeminiError && ['surcharge', 'quota', 'modele'].includes(e.kind)
  const journal: string[] = []
  let r: Resp | undefined
  let last: GeminiError | undefined
  let others: string[] | undefined
  const candidats = async function* () {
    yield model
    others ??= fallbackOrder(await listModels(key).catch(() => []), model).filter((m) => m !== model)
    yield* others
  }
  // Surcharge (erreur 5xx) : plusieurs essais espacés sur le même modèle, puis les autres modèles de la clé
  // (chacun a sa propre charge et ses propres limites gratuites). Pas plus de ~3 min au total.
  boucle: for await (const m of candidats()) {
    if (m !== model) toast(`Gemini (${model}) est saturé : j'essaie avec ${m}…`)
    const pauses = m === model ? [3000, 7000, 12000] : [5000]
    for (let essai = 0; ; essai++) {
      try {
        r = await attempt(m)
        if (m !== model && last?.kind === 'modele') await setSetting('model', m)
        break boucle
      } catch (e) {
        if (!passager(e)) throw e
        last = e
        journal.push(`${m} : ${e.status ?? e.kind}`)
        if (e.status === undefined || e.status < 500 || essai >= pauses.length || Date.now() - debut + pauses[essai] > 180_000) break
        await sleep(pauses[essai])
      }
    }
    if (Date.now() - debut > 180_000) break
  }
  if (!r) {
    console.warn('Gemini, essais :', journal)
    if (last?.kind === 'quota') throw last
    throw new GeminiError(
      'surcharge',
      `Gemini est saturé en ce moment (${journal.length} essais en ${Math.round((Date.now() - debut) / 1000)} s). Réessaie dans quelques minutes ; il suffit de retoucher « Générer ».`,
    )
  }
  if (r.promptFeedback?.blockReason) throw new GeminiError('autre', 'Gemini a bloqué cette demande. Reformule le thème.')
  const text = r.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  return JSON.parse(text) // une erreur ici déclenche le nouvel essai
}

/** Un nouvel essai si le JSON est invalide. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof GeminiError) throw e
    try {
      return await fn()
    } catch (e2) {
      if (e2 instanceof GeminiError) throw e2
      throw new GeminiError('autre', "Gemini a renvoyé une réponse mal formée deux fois de suite. Réessaie, ou simplifie le thème.")
    }
  }
}

const S = { type: 'STRING' }
const arrOf = (items: object) => ({ type: 'ARRAY', items })
const obj = (properties: Record<string, object>, required = Object.keys(properties)) => ({ type: 'OBJECT', properties, required })

const QUESTION = obj(
  {
    type: { type: 'STRING', enum: ['qcm', 'vrai_faux', 'courte', 'trous', 'association'] },
    enonce: S,
    choix: arrOf(S),
    reponses: arrOf(S),
    paires: arrOf(obj({ gauche: S, droite: S })),
    explication: S,
    difficulte: { type: 'STRING', enum: ['facile', 'moyen', 'difficile'] },
  },
  ['type', 'enonce', 'explication', 'difficulte'],
)

const FULL = obj({
  fiche: obj({
    titre: S,
    resume: S,
    sections: arrOf(obj({ titre: S, contenu: S })),
    definitions: arrOf(obj({ terme: S, definition: S })),
    astuces: arrOf(S),
    erreurs: arrOf(S),
  }),
  questions: arrOf(QUESTION),
  cartes: arrOf(obj({ recto: S, verso: S })),
})

const SYSTEM = `Tu es un professeur bienveillant qui prépare des révisions pour une étudiante.
Règles :
- Base-toi EN PRIORITÉ sur les pièces jointes (cours, photos, PDF). Sans pièce jointe, utilise des connaissances générales fiables du niveau de sa formation.
- Écris en français clair, simple et précis, adapté à son niveau. Les contenus des sections sont en Markdown (listes, gras).
- N'invente jamais de chiffres, de dates, d'articles de loi ou de références réglementaires incertains. Si un point est incertain ou peut avoir changé, écris « (à vérifier) » à côté.
- Questions :
  * qcm : 3 à 5 « choix » ; « reponses » contient le texte exact du ou des bons choix.
  * vrai_faux : « reponses » vaut ["Vrai"] ou ["Faux"].
  * courte : réponse attendue en 1 à 4 mots ; « reponses » liste les formulations acceptées, variantes séparées par « | » possibles.
  * trous : l'énoncé contient un « ___ » par trou ; « reponses » donne le mot de chaque trou dans l'ordre.
  * association : 3 à 5 « paires » gauche/droite.
  * Chaque question a une « explication » courte qui dit pourquoi.
- Cartes : recto = une question ou un terme court, verso = la réponse en une ou deux phrases.`

const LABELS: Record<QType | 'cartes', string> = {
  qcm: 'QCM', vrai_faux: 'vrai/faux', courte: 'réponse courte', trous: 'texte à trous', association: 'association', cartes: 'cartes recto-verso',
}

export interface GenParams {
  theme: string
  matiere: string
  niveau: Niveau
  nombre: number
  types: (QType | 'cartes')[]
  attachments: Attachment[]
}

const fileParts = (atts: Attachment[]): Part[] => atts.map((a) => ({ inlineData: { mimeType: a.mimeType, data: a.data } }))

export async function generateRevision(p: GenParams) {
  const formation = (await getSetting('profile'))?.formation || 'études supérieures'
  const qTypes = p.types.filter((t): t is QType => t !== 'cartes')
  const wantCartes = p.types.includes('cartes')
  const prompt = `Formation : ${formation}
Matière : ${p.matiere}
Thème : ${p.theme}
Niveau : ${p.niveau}${p.niveau === 'examen' ? " (questions du niveau de l'examen final)" : ''}
${p.attachments.length ? `Pièces jointes : ${p.attachments.length} (base-toi dessus en priorité).` : 'Pas de pièce jointe.'}

Produis :
1. « fiche » : un titre, un résumé en 3 lignes, 3 à 6 sections, les définitions clés, des astuces mnémotechniques et les erreurs fréquentes.
2. « questions » : ${qTypes.length ? `exactement ${p.nombre} questions, réparties entre ces types : ${qTypes.map((t) => LABELS[t]).join(', ')}.` : 'aucune (liste vide).'}
3. « cartes » : ${wantCartes ? `${Math.max(p.nombre, 8)} cartes recto-verso.` : 'aucune (liste vide).'}`
  const raw = await withRetry(async () =>
    cleanGenerated(await generateJSON([{ text: prompt }, ...fileParts(p.attachments)], FULL, SYSTEM), qTypes.length > 0, wantCartes),
  )
  if (!qTypes.length) raw.questions = []
  if (!wantCartes) raw.cartes = []
  return raw
}

export async function regenerateQuestion(q: Question, ctx: { theme: string; fiche: Fiche; attachments: Attachment[] }): Promise<Question> {
  const prompt = `Thème : ${ctx.theme}
Fiche : ${ctx.fiche.titre} — ${ctx.fiche.resume}
Voici une question à remplacer (elle ne convient pas) :
${JSON.stringify(q)}
Écris UNE nouvelle question différente, de type « ${q.type} », sur le même thème.`
  return withRetry(async () => {
    const c = cleanQuestion(await generateJSON([{ text: prompt }, ...fileParts(ctx.attachments)], QUESTION, SYSTEM))
    if (!c || c.type !== q.type) throw new Error('question invalide')
    return c
  })
}

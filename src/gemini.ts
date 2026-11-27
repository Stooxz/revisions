import { getSetting, setSetting } from './db.ts'
import { cleanGenerated, cleanQuestion, fallbackOrder, pickModel } from './logic.ts'
import type { ApiModel, Attachment, Fiche, Niveau, Question, QType } from './types.ts'
import { toast } from './ui.tsx'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

export class GeminiError extends Error {
  kind: 'cle' | 'quota' | 'surcharge' | 'reseau' | 'modele' | 'autre'
  constructor(kind: GeminiError['kind'], message: string) {
    super(message)
    this.kind = kind
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
  if (res.status === 429) throw new GeminiError('quota', "Tu as atteint la limite gratuite pour l'instant, réessaie dans quelques minutes.")
  if (res.status === 401 || res.status === 403 || /api key/i.test(msg))
    throw new GeminiError('cle', 'Ta clé Gemini est refusée. Vérifie-la dans les Réglages (copie-la en entier depuis AI Studio).')
  if (res.status === 404) throw new GeminiError('modele', 'Ce modèle Gemini n’existe plus.')
  if (res.status >= 500) throw new GeminiError('surcharge', SURCHARGE)
  throw new GeminiError('autre', `Gemini a refusé la demande (${res.status}). ${msg}`)
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
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.6 },
  }
  type Resp = { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } }
  const attempt = (m: string) => call<Resp>(`/models/${m}:generateContent`, key, body, GEN_TIMEOUT)

  const debut = Date.now()
  let r: Resp | undefined
  let last: GeminiError | undefined
  try {
    r = await attempt(model)
  } catch (e) {
    if (!(e instanceof GeminiError) || !['surcharge', 'quota', 'modele'].includes(e.kind)) throw e
    last = e
    // Surcharge passagère : un deuxième essai sur le même modèle après une courte pause.
    if (e.kind === 'surcharge' && e.message === SURCHARGE) {
      await sleep(4000)
      try {
        r = await attempt(model)
      } catch (e2) {
        if (!(e2 instanceof GeminiError) || !['surcharge', 'quota', 'modele'].includes(e2.kind)) throw e2
        last = e2
      }
    }
    // Puis les autres modèles disponibles avec la clé (chacun a sa propre charge et ses propres limites gratuites).
    if (!r) {
      const others = fallbackOrder(await listModels(key).catch(() => []), model).filter((m) => m !== model)
      for (const m of others) {
        if (Date.now() - debut > 180_000) break // pas plus de ~3 min d'attente au total
        toast(`Gemini (${model}) est saturé : j'essaie avec ${m}…`)
        try {
          r = await attempt(m)
          if (last.kind === 'modele') await setSetting('model', m)
          break
        } catch (e3) {
          if (!(e3 instanceof GeminiError) || !['surcharge', 'quota', 'modele'].includes(e3.kind)) throw e3
          last = e3
        }
      }
    }
    if (!r) {
      if (last.kind === 'quota') throw last
      throw new GeminiError('surcharge', "Tous les modèles Gemini sont saturés en ce moment. Réessaie dans quelques minutes ; ta demande n'est pas perdue, il suffit de retoucher « Générer ».")
    }
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

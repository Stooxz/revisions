import Anthropic from '@anthropic-ai/sdk'
import { getSetting } from './db.ts'
import { cleanGenerated, cleanQuestion } from './logic.ts'
import type { Attachment, Fiche, Niveau, Question, QType } from './types.ts'

/** Modèles proposés dans les Réglages (le premier est celui par défaut). */
export const MODELS: [string, string][] = [
  ['claude-opus-5-5', 'Claude Opus 5.5 (le plus fiable)'],
  ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (plus rapide, moins cher)'],
  ['claude-haiku-5-5', 'Claude Haiku 5.5 (très rapide, très économique)'],
]
export const DEFAULT_MODEL = MODELS[0][0]
const modelOf = (m?: string) => (m && MODELS.some(([id]) => id === m) ? m : DEFAULT_MODEL)

export class AIError extends Error {
  kind: 'cle' | 'quota' | 'surcharge' | 'reseau' | 'autre'
  constructor(kind: AIError['kind'], message: string) {
    super(message)
    this.kind = kind
  }
}

const OFFLINE = new AIError('reseau', "Pas de connexion internet. Tes révisions déjà créées restent disponibles ; reconnecte-toi pour en générer de nouvelles.")

function client(key: string) {
  if (!key) throw new AIError('cle', "Ajoute d'abord ta clé Claude dans les Réglages.")
  if (key.startsWith('AIza')) throw new AIError('cle', "C'est une clé Gemini : il faut maintenant une clé Claude (elle commence par « sk-ant- »). Vois les Réglages.")
  if (!navigator.onLine) throw OFFLINE
  // La clé appartient à l'utilisatrice et ne quitte son appareil que pour api.anthropic.com.
  return new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 3, timeout: 5 * 60_000 })
}

/** Traduit les erreurs du SDK en messages compréhensibles. */
function translate(e: unknown): unknown {
  if (e instanceof AIError) return e
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
    return new AIError('cle', 'Ta clé Claude est refusée. Vérifie-la dans les Réglages (copie-la en entier depuis console.anthropic.com).')
  if (e instanceof Anthropic.RateLimitError)
    return new AIError('quota', 'Trop de demandes d’un coup, ou crédit épuisé. Attends une minute, ou vérifie ton crédit sur console.anthropic.com.')
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new AIError('surcharge', 'Claude met trop de temps à répondre. Réessaie dans un instant.')
  if (e instanceof Anthropic.APIConnectionError) return OFFLINE
  if (e instanceof Anthropic.BadRequestError && /credit|billing/i.test(e.message))
    return new AIError('quota', 'Ton crédit Claude est épuisé. Recharge-le sur console.anthropic.com (Billing).')
  if (e instanceof Anthropic.APIError && (e.status ?? 0) >= 500) return new AIError('surcharge', 'Claude est surchargé en ce moment. Réessaie dans quelques minutes.')
  if (e instanceof Anthropic.APIError) return new AIError('autre', `Claude a refusé la demande (${e.status}). ${e.message}`)
  return e
}

/** Vérifie la clé ; renvoie le nom du modèle utilisé. */
export async function testKey(key: string): Promise<string> {
  const model = modelOf(await getSetting('model'))
  try {
    await client(key).models.retrieve(model)
  } catch (e) {
    throw translate(e)
  }
  return MODELS.find(([id]) => id === model)![1]
}

const fileBlocks = (atts: Attachment[]): Anthropic.Beta.BetaContentBlockParam[] =>
  atts.map((a) =>
    a.mimeType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.data } }
      : { type: 'image', source: { type: 'base64', media_type: a.mimeType as 'image/jpeg', data: a.data } },
  )

async function generateJSON(prompt: string, attachments: Attachment[], schema: Record<string, unknown>): Promise<unknown> {
  const key = (await getSetting('apiKey')) ?? ''
  const model = modelOf(await getSetting('model'))
  let msg: Anthropic.Beta.BetaMessage
  try {
    msg = await client(key)
      .beta.messages.stream({
        model,
        max_tokens: 64000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
        system: SYSTEM,
        messages: [{ role: 'user', content: [...fileBlocks(attachments), { type: 'text', text: prompt }] }],
      })
      .finalMessage()
  } catch (e) {
    throw translate(e)
  }
  if (msg.stop_reason === 'refusal') throw new AIError('autre', 'Claude a refusé cette demande. Reformule le thème.')
  const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  return JSON.parse(text) // une erreur ici déclenche le nouvel essai
}

/** Un nouvel essai si le JSON est invalide. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof AIError) throw e
    try {
      return await fn()
    } catch (e2) {
      if (e2 instanceof AIError) throw e2
      throw new AIError('autre', 'Claude a renvoyé une réponse incomplète deux fois de suite. Réessaie, ou simplifie le thème.')
    }
  }
}

// Schémas JSON (sorties structurées) : chaque objet est fermé (additionalProperties: false).
const S = { type: 'string' }
const arrOf = (items: object) => ({ type: 'array', items })
const obj = (properties: Record<string, object>, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false })

const QUESTION = obj(
  {
    type: { type: 'string', enum: ['qcm', 'vrai_faux', 'courte', 'trous', 'association'] },
    enonce: S,
    choix: arrOf(S),
    reponses: arrOf(S),
    paires: arrOf(obj({ gauche: S, droite: S })),
    explication: S,
    difficulte: { type: 'string', enum: ['facile', 'moyen', 'difficile'] },
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
    cleanGenerated(await generateJSON(prompt, p.attachments, FULL), qTypes.length > 0, wantCartes),
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
    const c = cleanQuestion(await generateJSON(prompt, ctx.attachments, QUESTION))
    if (!c || c.type !== q.type) throw new Error('question invalide')
    return c
  })
}

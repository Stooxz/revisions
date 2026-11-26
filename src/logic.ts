// Logique pure (sans navigateur) : testée par tests/logic.test.ts
import type { ApiModel, Carte, Question, QType } from './types.ts'

/** Minuscules, sans accents, sans espaces ni ponctuation. */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Une réponse attendue peut proposer des variantes séparées par « | ». */
function matches(given: string, expected: string): boolean {
  const g = normalize(given)
  return g !== '' && expected.split('|').some((e) => normalize(e) === g)
}

export const BLANK = /_{3,}/g

/** answer : choix cochés (qcm/vrai_faux), [texte] (courte), un texte par trou, une droite par paire (association). */
export function grade(q: Question, answer: string[]): boolean {
  switch (q.type) {
    case 'qcm':
    case 'vrai_faux': {
      const a = new Set(answer.map(normalize))
      const r = new Set(q.reponses.map(normalize))
      return a.size === r.size && [...r].every((x) => a.has(x))
    }
    case 'courte':
      return q.reponses.some((r) => matches(answer[0] ?? '', r))
    case 'trous':
      return q.reponses.length > 0 && q.reponses.every((r, i) => matches(answer[i] ?? '', r))
    case 'association':
      return q.paires.every((p, i) => normalize(answer[i] ?? '') === normalize(p.droite))
  }
}

// Boîtes de Leitner : délai (jours) avant la prochaine révision, indexé par boîte 1..5
const DELAIS = [0, 0, 1, 3, 7, 14]
const JOUR = 86_400_000

export function review(c: Carte, savais: boolean, now = Date.now()): Carte {
  const boite = savais ? Math.min(c.boite + 1, 5) : 1
  return { ...c, boite, due: now + DELAIS[boite] * JOUR }
}

export const isDue = (c: Carte, now = Date.now()) => c.due <= now

/** Choisit le modèle « Flash » stable le plus récent ; à défaut une préversion, puis n'importe quel Gemini. */
export function pickModel(models: ApiModel[]): string | undefined {
  const ok = models
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => n.startsWith('gemini'))
  const special = /lite|image|tts|audio|live|thinking|exp|embedding|robotics|computer|native/
  const version = (n: string) => parseFloat(n.match(/^gemini-(\d+(?:\.\d+)?)/)?.[1] ?? '0')
  const preview = (n: string) => /preview|latest/.test(n)
  const rank = (list: string[]) =>
    [...list].sort((a, b) => Number(preview(a)) - Number(preview(b)) || version(b) - version(a) || a.length - b.length)[0]
  const flash = ok.filter((n) => n.includes('flash') && !special.test(n))
  return rank(flash) ?? rank(ok.filter((n) => !special.test(n))) ?? ok[0]
}

const TYPES: QType[] = ['qcm', 'vrai_faux', 'courte', 'trous', 'association']
const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '')
const strs = (x: unknown) => (Array.isArray(x) ? x.map(str).filter(Boolean) : [])
const arr = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter((o) => o && typeof o === 'object') : [])

/** Nettoie une question renvoyée par l'IA ; null si inutilisable. */
export function cleanQuestion(raw: unknown): Question | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const type = o.type as QType
  const q: Question = {
    type,
    enonce: str(o.enonce),
    choix: strs(o.choix),
    reponses: strs(o.reponses),
    paires: arr(o.paires).map((p) => ({ gauche: str(p.gauche), droite: str(p.droite) })).filter((p) => p.gauche && p.droite),
    explication: str(o.explication),
    difficulte: str(o.difficulte) || 'moyen',
  }
  if (!TYPES.includes(type) || !q.enonce) return null
  if (type === 'vrai_faux') {
    q.choix = ['Vrai', 'Faux']
    q.reponses = q.reponses.slice(0, 1)
  }
  const n = normalize
  const valid = {
    qcm: q.choix.length >= 2 && q.reponses.length >= 1 && q.reponses.every((r) => q.choix.some((c) => n(c) === n(r))),
    vrai_faux: q.reponses.length === 1 && ['vrai', 'faux'].includes(n(q.reponses[0])),
    courte: q.reponses.length >= 1,
    trous: q.reponses.length >= 1 && (q.enonce.match(BLANK)?.length ?? 0) === q.reponses.length,
    association: q.paires.length >= 2,
  }[type]
  return valid ? q : null
}

/** Valide la réponse complète de l'IA. Lève une erreur si le format est inutilisable. */
export function cleanGenerated(raw: unknown, wantQuestions: boolean, wantCartes: boolean) {
  const o = (raw ?? {}) as Record<string, unknown>
  const f = (o.fiche ?? {}) as Record<string, unknown>
  const fiche = {
    titre: str(f.titre),
    resume: str(f.resume),
    sections: arr(f.sections).map((s) => ({ titre: str(s.titre), contenu: str(s.contenu) })).filter((s) => s.contenu),
    definitions: arr(f.definitions).map((d) => ({ terme: str(d.terme), definition: str(d.definition) })).filter((d) => d.terme),
    astuces: strs(f.astuces),
    erreurs: strs(f.erreurs),
  }
  const questions = arr(o.questions).map(cleanQuestion).filter((q): q is Question => q !== null)
  const cartes: Carte[] = arr(o.cartes)
    .map((c) => ({ recto: str(c.recto), verso: str(c.verso), boite: 1, due: 0 }))
    .filter((c) => c.recto && c.verso)
  if (!fiche.titre || fiche.sections.length === 0) throw new Error('fiche incomplète')
  if (wantQuestions && questions.length === 0) throw new Error('aucune question valide')
  if (wantCartes && cartes.length === 0) throw new Error('aucune carte valide')
  return { fiche, questions, cartes }
}

export function shuffle<T>(a: T[]): T[] {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

/** Lundi (00:00) de la semaine de t, en heure locale. */
export function weekStart(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

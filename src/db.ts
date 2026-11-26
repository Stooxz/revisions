import Dexie, { type Table } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Profile, Revision, Session } from './types.ts'

export interface Settings {
  profile?: Profile
  apiKey?: string
  model?: string
  theme?: 'auto' | 'clair' | 'sombre'
}

class DB extends Dexie {
  revisions!: Table<Revision, number>
  sessions!: Table<Session, number>
  kv!: Table<{ key: string; value: unknown }, string>
  constructor() {
    super('revisions')
    this.version(1).stores({ revisions: '++id, matiere, createdAt', sessions: '++id, revisionId, date', kv: 'key' })
  }
}

export const db = new DB()

export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K]> {
  return (await db.kv.get(key))?.value as Settings[K]
}
export const setSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => db.kv.put({ key, value })

/** Tous les réglages ; undefined pendant le premier chargement. */
export function useSettings(): Settings | undefined {
  return useLiveQuery(async () => Object.fromEntries((await db.kv.toArray()).map((r) => [r.key, r.value])) as Settings)
}

/** full = false pour « rejouer mes erreurs » : ne compte pas dans le meilleur score. */
export async function saveSession(s: Session, full = true) {
  await db.transaction('rw', db.revisions, db.sessions, async () => {
    await db.sessions.add(s)
    const r = await db.revisions.get(s.revisionId)
    if (r && full && s.kind === 'quiz' && s.total > 0) {
      const pct = Math.round((100 * s.score) / s.total)
      await db.revisions.update(s.revisionId, { bestScore: Math.max(pct, r.bestScore ?? 0), lastSession: s.date })
    } else if (r) await db.revisions.update(s.revisionId, { lastSession: s.date })
  })
}

const APP = 'revisions-backup'

export async function exportAll(): Promise<Blob> {
  const data = { app: APP, version: 1, exportedAt: new Date().toISOString(), revisions: await db.revisions.toArray(), sessions: await db.sessions.toArray(), kv: await db.kv.toArray() }
  return new Blob([JSON.stringify(data)], { type: 'application/json' })
}

/** Remplace toutes les données par celles du fichier. */
export async function importAll(text: string) {
  let data: { app?: string; revisions?: Revision[]; sessions?: Session[]; kv?: { key: string; value: unknown }[] }
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error("Ce fichier n'est pas une sauvegarde valide.")
  }
  if (data.app !== APP || !Array.isArray(data.revisions) || !Array.isArray(data.sessions) || !Array.isArray(data.kv))
    throw new Error("Ce fichier n'est pas une sauvegarde de l'appli Révisions.")
  await db.transaction('rw', db.revisions, db.sessions, db.kv, async () => {
    await Promise.all([db.revisions.clear(), db.sessions.clear(), db.kv.clear()])
    await db.revisions.bulkAdd(data.revisions!)
    await db.sessions.bulkAdd(data.sessions!)
    await db.kv.bulkAdd(data.kv!)
  })
}

export async function wipeAll() {
  await db.transaction('rw', db.revisions, db.sessions, db.kv, () => Promise.all([db.revisions.clear(), db.sessions.clear(), db.kv.clear()]))
}

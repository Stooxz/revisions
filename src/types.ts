export type QType = 'qcm' | 'vrai_faux' | 'courte' | 'trous' | 'association'
export type Niveau = 'découverte' | 'intermédiaire' | 'examen'

export interface Paire { gauche: string; droite: string }

export interface Question {
  type: QType
  enonce: string
  choix: string[]
  reponses: string[]
  paires: Paire[]
  explication: string
  difficulte: string
}

export interface Carte { recto: string; verso: string; boite: number; due: number }

export interface Fiche {
  titre: string
  resume: string
  sections: { titre: string; contenu: string }[]
  definitions: { terme: string; definition: string }[]
  astuces: string[]
  erreurs: string[]
}

export interface Attachment { name: string; mimeType: string; data: string /* base64 */ }

export interface Revision {
  id?: number
  theme: string
  matiere: string
  niveau: Niveau
  createdAt: number
  brouillon: boolean
  favori: boolean
  fiche: Fiche
  questions: Question[]
  cartes: Carte[]
  attachments: Attachment[]
  bestScore?: number // pourcentage
  lastSession?: number
}

export interface Session {
  id?: number
  revisionId: number
  matiere: string
  date: number
  kind: 'quiz' | 'cartes'
  score: number
  total: number
  durationMs: number
}

export interface Profile {
  prenom: string
  formation: string
  etablissement: string
  annee: string
  examDate: string // AAAA-MM-JJ ou vide
  matieres: string[]
}

export interface ApiModel { name: string; displayName?: string; supportedGenerationMethods?: string[] }

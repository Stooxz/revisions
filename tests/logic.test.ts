import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanGenerated, cleanQuestion, fallbackOrder, grade, pickModel, review, thinkingFor } from '../src/logic.ts'
import type { Question } from '../src/types.ts'

const q = (o: Partial<Question>): Question => ({
  type: 'courte', enonce: 'x', choix: [], reponses: [], paires: [], explication: '', difficulte: 'moyen', ...o,
})

test('réponse courte tolérante (casse, accents, espaces)', () => {
  const c = q({ reponses: ['Incoterms DDP|Delivered Duty Paid'] })
  assert.ok(grade(c, ['  incoterms  ddp ']))
  assert.ok(grade(c, ['delivered duty paid']))
  assert.ok(grade(q({ reponses: ['Crédit documentaire'] }), ['credit DOCUMENTAIRE']))
  assert.ok(!grade(c, ['']))
  assert.ok(!grade(c, ['FOB']))
})

test('qcm, trous, association', () => {
  assert.ok(grade(q({ type: 'qcm', reponses: ['A', 'C'] }), ['C', 'A']))
  assert.ok(!grade(q({ type: 'qcm', reponses: ['A', 'C'] }), ['A']))
  assert.ok(grade(q({ type: 'trous', enonce: '___ et ___', reponses: ['FOB', 'CIF'] }), ['fob', 'cif']))
  assert.ok(!grade(q({ type: 'trous', reponses: ['FOB', 'CIF'] }), ['fob']))
  const as = q({ type: 'association', paires: [{ gauche: 'a', droite: 'X' }, { gauche: 'b', droite: 'Y' }] })
  assert.ok(grade(as, ['X', 'Y']))
  assert.ok(!grade(as, ['Y', 'X']))
})

test('nettoyage des questions', () => {
  assert.equal(cleanQuestion({ type: 'trous', enonce: 'Le ___ ', reponses: ['a', 'b'] }), null)
  assert.equal(cleanQuestion({ type: 'qcm', enonce: 'x', choix: ['a', 'b'], reponses: ['c'] }), null)
  assert.deepEqual(cleanQuestion({ type: 'vrai_faux', enonce: 'x', reponses: ['vrai'] })?.choix, ['Vrai', 'Faux'])
  assert.throws(() => cleanGenerated({ fiche: { titre: 't', sections: [{ contenu: 'c' }] } }, true, false))
  assert.equal(cleanGenerated({ fiche: { titre: 't', sections: [{ titre: 's', contenu: 'c' }] }, cartes: [{ recto: 'r', verso: 'v' }] }, false, true).cartes.length, 1)
})

test('Leitner', () => {
  const c = { recto: 'r', verso: 'v', boite: 1, due: 0 }
  const up = review(c, true, 0)
  assert.equal(up.boite, 2)
  assert.equal(up.due, 86_400_000)
  assert.equal(review({ ...c, boite: 5 }, true, 0).boite, 5)
  assert.equal(review({ ...c, boite: 4 }, false, 0).boite, 1)
})

test('choix du modèle Flash', () => {
  const m = (name: string, gen = true) => ({ name: `models/${name}`, supportedGenerationMethods: gen ? ['generateContent'] : ['embedContent'] })
  const list = [
    m('gemini-2.0-flash'), m('gemini-2.5-flash'), m('gemini-2.5-flash-lite'), m('gemini-3-flash-preview'),
    m('gemini-2.5-pro'), m('gemini-2.5-flash-image'), m('gemini-flash-latest'), m('text-embedding-004', false),
  ]
  assert.equal(pickModel(list), 'gemini-2.5-flash')
  assert.equal(pickModel([...list, m('gemini-3.5-flash')]), 'gemini-3.5-flash')
  assert.equal(pickModel([m('gemini-3-flash-preview'), m('gemini-2.5-pro-preview')]), 'gemini-3-flash-preview')
  assert.equal(pickModel([m('gemini-2.5-pro')]), 'gemini-2.5-pro')
  assert.equal(pickModel([]), undefined)
})

test('fallbackOrder : préféré, puis Flash, Flash-Lite, autres', () => {
  const names = ['gemini-2.5-pro', 'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash-image', 'gemini-embedding-001', 'gemini-2.0-flash']
  assert.deepEqual(fallbackOrder(names, 'gemini-3-flash-preview'), ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'])
  assert.deepEqual(fallbackOrder([], 'gemini-2.5-flash'), ['gemini-2.5-flash'])
})

test('thinkingFor : réflexion réduite selon le modèle', () => {
  assert.deepEqual(thinkingFor('gemini-2.5-flash'), { thinkingBudget: 0 })
  assert.deepEqual(thinkingFor('gemini-2.5-flash-lite'), { thinkingBudget: 0 })
  assert.deepEqual(thinkingFor('gemini-3-flash-preview'), { thinkingLevel: 'low' })
  assert.equal(thinkingFor('gemini-2.5-pro'), undefined)
  assert.equal(thinkingFor('gemini-2.0-flash'), undefined)
})

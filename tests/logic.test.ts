import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanGenerated, cleanQuestion, grade, review } from '../src/logic.ts'
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

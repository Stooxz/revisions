import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { db, useSettings } from './db.ts'
import { Cards } from './screens/Cards.tsx'
import { Create } from './screens/Create.tsx'
import { Editor } from './screens/Editor.tsx'
import { FicheView } from './screens/Fiche.tsx'
import { Library } from './screens/Library.tsx'
import { Quiz } from './screens/Quiz.tsx'
import { Settings } from './screens/Settings.tsx'
import { Stats } from './screens/Stats.tsx'
import { Welcome } from './screens/Welcome.tsx'
import { Navigation, Toasts, useRoute } from './ui.tsx'

export function App() {
  const settings = useSettings()
  const route = useRoute()
  useEffect(() => {
    const t = settings?.theme
    if (t === 'clair' || t === 'sombre') document.documentElement.dataset.theme = t
    else delete document.documentElement.dataset.theme
  }, [settings?.theme])

  if (!settings) return null
  if (!settings.profile) return (<><Welcome /><Toasts /></>)
  const profile = settings.profile
  const [page = '', id, sub] = route

  return (
    <>
      <Navigation current={page === 'r' ? '' : page} />
      {page === '' && <Library profile={profile} />}
      {page === 'creer' && <Create profile={profile} />}
      {page === 'stats' && <Stats profile={profile} />}
      {page === 'reglages' && <Settings settings={settings} />}
      {page === 'r' && <RevisionRoute id={Number(id)} sub={sub} />}
      <Toasts />
    </>
  )
}

function RevisionRoute({ id, sub }: { id: number; sub?: string }) {
  const r = useLiveQuery(() => db.revisions.get(id).then((x) => x ?? null), [id])
  if (r === undefined) return null
  if (r === null)
    return (
      <main className="page center">
        <p>Cette révision n'existe plus.</p>
        <a className="btn" href="#/">Retour à la bibliothèque</a>
      </main>
    )
  if (sub === 'quiz' && r.questions.length) return <Quiz r={r} />
  if (sub === 'cartes' && r.cartes.length) return <Cards r={r} />
  if (sub === 'modifier') return <Editor revision={r} />
  return <FicheView r={r} />
}

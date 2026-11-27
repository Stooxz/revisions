import { useEffect, useState, type ReactNode } from 'react'

// --- Petites notifications ---
export function toast(message: string) {
  window.dispatchEvent(new CustomEvent('toast', { detail: message }))
}

export function Toasts() {
  const [items, setItems] = useState<{ id: number; text: string }[]>([])
  useEffect(() => {
    const on = (e: Event) => {
      const id = Date.now() + Math.random()
      setItems((l) => [...l, { id, text: (e as CustomEvent<string>).detail }])
      setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 6000)
    }
    window.addEventListener('toast', on)
    return () => window.removeEventListener('toast', on)
  }, [])
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast">{t.text}</div>
      ))}
    </div>
  )
}

// --- Routage par ancre (#/...) : marche sur GitHub Pages sans configuration ---
export function useRoute(): string[] {
  const read = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => {
      setRoute(read())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export const go = (path: string) => {
  location.hash = path
}

const TABS = [
  { path: '', label: 'Bibliothèque', icon: '📚' },
  { path: 'creer', label: 'Créer', icon: '✨' },
  { path: 'stats', label: 'Stats', icon: '📈' },
  { path: 'reglages', label: 'Réglages', icon: '⚙️' },
]

export function Masthead({ children }: { children: ReactNode }) {
  return (
    <header className="masthead">
      <div className="masthead-inner">
        <span className="brand">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width="36" height="36" />
          <span>Mes <em>révisions</em></span>
        </span>
        {children}
      </div>
    </header>
  )
}

export function Navigation({ current }: { current: string }) {
  return (
    <Masthead>
      <nav className="bottom-nav" aria-label="Navigation principale">
        {TABS.map((t) => (
          <a key={t.path} href={`#/${t.path}`} aria-current={current === t.path ? 'page' : undefined}>
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
          </a>
        ))}
      </nav>
    </Masthead>
  )
}

export function Header({ title, back, children }: { title: string; back?: string; children?: ReactNode }) {
  return (
    <header className="top">
      {back !== undefined && (
        <a className="btn icon ghost" href={`#/${back}`} aria-label="Retour">
          ←
        </a>
      )}
      <h1>{title}</h1>
      {children}
    </header>
  )
}

export const formatDate = (t: number) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

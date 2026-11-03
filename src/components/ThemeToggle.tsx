import { useState } from 'react'

type Theme = 'system' | 'light' | 'dark'
const ORDER: Theme[] = ['system', 'light', 'dark']

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) ?? 'system')
  function next() {
    const t = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]
    setTheme(t)
    if (t === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = t
    try {
      if (t === 'system') localStorage.removeItem('evf-theme')
      else localStorage.setItem('evf-theme', t)
    } catch {
      // storage blocked: the choice still applies for this visit
    }
  }
  return (
    <button type="button" onClick={next} aria-label={`Colour theme: ${theme}. Change theme`} style={{ minHeight: 36, padding: '4px 10px', background: 'none', border: '1px solid var(--ink-3)', borderRadius: 2, cursor: 'pointer' }}>
      Theme: {theme}
    </button>
  )
}

import { useState } from 'react'

type Theme = 'system' | 'light' | 'dark'
const LABEL: Record<Theme, string> = { light: 'Light', dark: 'Dark', system: 'Auto' }

/** Plain text switch, like the edition toggles on a news site. */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) ?? 'system')
  function choose(t: Theme) {
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
    <div role="radiogroup" aria-label="Colour theme" className={className}>
      {(['light', 'dark', 'system'] as Theme[]).map((t) => (
        <button key={t} type="button" role="radio" aria-checked={theme === t} onClick={() => choose(t)}>
          {LABEL[t]}
        </button>
      ))}
    </div>
  )
}

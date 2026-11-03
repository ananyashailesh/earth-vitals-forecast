import { useState } from 'react'

type Theme = 'system' | 'light' | 'dark'

const ICON: Record<Theme, string> = {
  light: 'M8 3V1.5M8 14.5V13M3 8H1.5M14.5 8H13M4.5 4.5l-1-1M12.5 12.5l-1-1M4.5 11.5l-1 1M12.5 3.5l-1 1M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z',
  dark: 'M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z',
  system: 'M2 3.5h12v8H2zM6 14h4M8 11.5V14',
}

export function ThemeToggle() {
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
    <div role="radiogroup" aria-label="Colour theme" style={{ display: 'flex', gap: 2, padding: 2, background: 'var(--hover)', borderRadius: 8, width: 'max-content' }}>
      {(['light', 'dark', 'system'] as Theme[]).map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={theme === t}
          aria-label={t}
          title={t[0].toUpperCase() + t.slice(1)}
          onClick={() => choose(t)}
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 30,
            height: 26,
            border: 0,
            borderRadius: 6,
            cursor: 'pointer',
            color: theme === t ? 'var(--text)' : 'var(--text-3)',
            background: theme === t ? 'var(--surface)' : 'transparent',
            boxShadow: theme === t ? '0 1px 2px rgb(0 0 0 / 0.12)' : 'none',
          }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <path d={ICON[t]} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ))}
    </div>
  )
}

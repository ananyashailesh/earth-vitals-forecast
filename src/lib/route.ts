import { useCallback, useEffect, useState } from 'react'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

const read = () => ({
  path: location.pathname.slice(BASE.length).replace(/^\/|\/$/g, ''),
  params: new URLSearchParams(location.search),
})

/** Minimal History-API router: one path segment plus query-string settings, so every view is a shareable URL. */
export function useRoute() {
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const on = () => setRoute(read())
    addEventListener('popstate', on)
    return () => removeEventListener('popstate', on)
  }, [])
  const navigate = useCallback((path: string, params?: URLSearchParams, replace = false) => {
    const qs = params?.toString()
    const url = `${BASE}/${path}${qs ? `?${qs}` : ''}`
    if (url === location.pathname + location.search) return
    history[replace ? 'replaceState' : 'pushState'](null, '', url)
    setRoute(read())
  }, [])
  return { ...route, navigate }
}

export const href = (path: string) => `${BASE}/${path}`

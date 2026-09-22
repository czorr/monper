export const PROFILE_ICONS = ['initials', 'user', 'briefcase', 'home', 'code', 'book', 'compass'] as const
export type ProfileIcon = typeof PROFILE_ICONS[number]
export const SEARCH_ENGINES = { google: 'Google', duckduckgo: 'DuckDuckGo', bing: 'Bing', brave: 'Brave' } as const
export type SearchEngine = keyof typeof SEARCH_ENGINES

export interface ProfilePreferences {
  color: string
  icon: ProfileIcon
  tint: string | null
  homePage: string
  newTab: 'titanio' | 'home'
  startup: 'restore' | 'home'
  searchEngine: SearchEngine
  agent: {
    defaultModel: { providerId: string; id: string } | null
    instructions: string
    browserTools: boolean
    skills: boolean
    mcp: boolean
  }
}

export interface BrowserProfile {
  id: string
  nombre: string
  avatar: string | null
  preferences: ProfilePreferences
}
export interface ProfileSettings {
  activeId: string
  profiles: BrowserProfile[]
}

export function defaultProfilePreferences(): ProfilePreferences {
  return {
    color: '#64748b', icon: 'initials', tint: null, homePage: '', newTab: 'titanio',
    startup: 'restore', searchEngine: 'google',
    agent: { defaultModel: null, instructions: '', browserTools: true, skills: true, mcp: true }
  }
}

export function searchUrlFor(query: string, engine: SearchEngine): string {
  const base = { google: 'https://www.google.com/search?q=', duckduckgo: 'https://duckduckgo.com/?q=', bing: 'https://www.bing.com/search?q=', brave: 'https://search.brave.com/search?q=' }[engine]
  return base + encodeURIComponent(query.trim())
}

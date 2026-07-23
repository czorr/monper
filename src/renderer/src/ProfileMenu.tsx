import { useEffect, type JSX } from 'react'
import { Avatar, MenuLabel, MenuDivider, MenuItem } from './components/ui'

const { monper } = window

const Chevron = (): JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 14 14"><path d="M5 3l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
)

// Iconos propios del menú (stroke 1.2–1.3)
const Ic = {
  newProfile: <svg width="17" height="17" viewBox="0 0 17 17"><circle cx="8.5" cy="6" r="3" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M3 14.5c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>,
  bookmarks: <svg width="15" height="15" viewBox="0 0 15 15"><path d="M4 2h7v11l-3.5-2.5L4 13V2z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>,
  downloads: <svg width="15" height="15" viewBox="0 0 15 15"><path d="M7.5 2v8m0 0L4.5 7m3 3 3-3M3 13h9" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  extensions: <svg width="15" height="15" viewBox="0 0 15 15"><path d="M6 2.5a1.5 1.5 0 0 1 3 0V4h2.5v2.5H13a1.5 1.5 0 0 1 0 3h-1.5V12H9v-1.5a1.5 1.5 0 0 0-3 0V12H3.5V9.5H2a1.5 1.5 0 0 1 0-3h1.5V4H6V2.5z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>,
  history: <svg width="15" height="15" viewBox="0 0 15 15"><path d="M7.5 3a4.5 4.5 0 1 1-4.35 5.6M7.5 3V1.5M3 5H1.5M7.5 5v2.5L9.5 9" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  developers: <svg width="15" height="15" viewBox="0 0 15 15"><path d="M5 4 2 7.5 5 11m5-7 3 3.5L10 11" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  settings: <svg width="15" height="15" viewBox="0 0 15 15"><circle cx="7.5" cy="7.5" r="2" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M7.5 1.5v1.5m0 9v1.5m6-6H12m-9 0H1.5m10.6-4.2-1 1M4 10l-1 1m8.1 0-1-1M4 4 3 3" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" /></svg>,
  newTab: <svg width="15" height="15" viewBox="0 0 15 15"><path d="M7.5 3v9M3 7.5h9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>,
  incognito: <svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 9h12M5 9c0-2 .8-3 3-3s3 1 3 3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /><circle cx="5" cy="11" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" /><circle cx="11" cy="11" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
}

export default function ProfileMenu(): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') monper.closeMenu() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div id="menu-root">
      <MenuLabel>Profiles</MenuLabel>

      <button className="m-item" onClick={() => monper.menuAction('switch-profile')}>
        <Avatar initials="LC" size="sm" />
        <span className="name">Luis Carlos Zorrilla</span>
        <span className="meta">
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2.5 7.5 6 11l5.5-7.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="3.5" cy="8" r="1.1" fill="currentColor" /><circle cx="8" cy="8" r="1.1" fill="currentColor" /><circle cx="12.5" cy="8" r="1.1" fill="currentColor" /></svg>
        </span>
      </button>

      <MenuItem icon={Ic.newProfile} name="New profile" onClick={() => monper.menuAction('new-profile')} />

      <MenuDivider />

      <MenuItem icon={Ic.bookmarks} name="Bookmarks" meta={<Chevron />} onClick={() => monper.menuAction('bookmarks')} />
      <MenuItem icon={Ic.downloads} name="Downloads" meta={<Chevron />} onClick={() => monper.menuAction('downloads')} />
      <MenuItem icon={Ic.extensions} name="Extensions" meta={<Chevron />} onClick={() => monper.menuAction('extensions')} />
      <MenuItem icon={Ic.history} name="History" meta={<Chevron />} onClick={() => monper.menuAction('history')} />
      <MenuItem icon={Ic.developers} name="Developers" meta={<Chevron />} onClick={() => monper.menuAction('developers')} />
      <MenuItem icon={Ic.settings} name="Settings" meta="⌘," onClick={() => monper.menuAction('settings')} />

      <MenuDivider />

      <MenuItem icon={Ic.newTab} name="New Tab" meta="⌘T" onClick={() => monper.menuAction('new-tab')} />
      <MenuItem icon={Ic.incognito} name="Incognito Window" meta="⇧⌘N" onClick={() => monper.menuAction('incognito')} />
    </div>
  )
}

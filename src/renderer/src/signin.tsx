import { createRoot } from 'react-dom/client'
import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import type { SigninCredential } from '@shared/types'
import IconKey from '~icons/tabler/key'
import IconX from '~icons/tabler/x'
import IconWorld from '~icons/tabler/world'
import './styles.css'

const sg = window.signin

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

function Row({ c }: { c: SigninCredential }): JSX.Element {
  const [broken, setBroken] = useState(false)
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostOf(c.origin))}&sz=64`
  return (
    <button
      onClick={() => sg.fill(c.id)}
      className="flex items-center gap-3 w-full p-3 rounded-xl bg-black/40 hover:bg-black/60 text-left transition-colors outline-none"
    >
      {broken ? (
        <span className="w-8 h-8 shrink-0 grid place-items-center rounded-lg bg-white/[0.06] text-text-dim [&>svg]:w-5 [&>svg]:h-5"><IconWorld /></span>
      ) : (
        <img src={favicon} alt="" className="w-8 h-8 shrink-0 rounded-lg object-contain" onError={() => setBroken(true)} />
      )}
      <span className="min-w-0">
        <span className="block text-[15px] font-medium text-text truncate">{c.label || hostOf(c.origin)}</span>
        {c.username && <span className="block text-[13px] text-text-dim truncate">{c.username}</span>}
      </span>
    </button>
  )
}

function SignIn(): JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null)
  const [creds, setCreds] = useState<SigninCredential[]>([])
  useEffect(() => sg.onCredentials(setCreds), [])
  useLayoutEffect(() => {
    if (boxRef.current) sg.reportHeight(Math.ceil(boxRef.current.getBoundingClientRect().height))
  }, [creds])

  return (
    <div className="p-3">
      <div
        ref={boxRef}
        style={{ animation: 'peek-in 160ms cubic-bezier(0.33,1,0.68,1)' }}
        className="rounded-2xl border border-white/10 bg-[#1c1c20]/95 backdrop-blur-md shadow-2xl shadow-black/50 p-3"
      >
        <div className="flex items-center gap-2 px-1 pb-2.5">
          <IconKey className="w-[18px] h-[18px] text-text-dim shrink-0" />
          <span className="flex-1 text-[15px] text-text-dim">Sign in with…</span>
          <button
            onClick={() => sg.dismiss()}
            title="Cerrar"
            className="w-5 h-5 grid place-items-center rounded-full bg-white/[0.10] text-text-dim hover:text-text hover:bg-white/[0.18] [&>svg]:w-3 [&>svg]:h-3"
          >
            <IconX />
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          {creds.map((c) => <Row key={c.id} c={c} />)}
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<SignIn />)

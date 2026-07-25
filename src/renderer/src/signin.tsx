import { createRoot } from 'react-dom/client'
import { useEffect, useState, type JSX } from 'react'
import type { SigninCredential } from '@shared/types'
import { PopoverPanel } from '@renderer/components/popover'
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
  // El favicon del sitio ya está cargado en la pestaña: pedirlo a Google le contaba a un
  // tercero en qué páginas guardas contraseñas. Si no hay, el candado.
  const favicon = c.favicon ?? ''
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
  const [creds, setCreds] = useState<SigninCredential[]>([])
  useEffect(() => sg.onCredentials(setCreds), [])

  return (
    <PopoverPanel onHeight={sg.reportHeight} measure={creds} className="p-3">
      <>
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
      </>
    </PopoverPanel>
  )
}

createRoot(document.getElementById('root')!).render(<SignIn />)

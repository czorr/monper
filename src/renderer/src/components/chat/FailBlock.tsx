import { useState, type JSX } from 'react'
import type { ChatFallo } from '@shared/types'
import IconKey from '~icons/tabler/key'
import IconCoin from '~icons/tabler/coin'
import IconHourglass from '~icons/tabler/hourglass'
import IconCube from '~icons/tabler/cube'
import IconWifiOff from '~icons/tabler/wifi-off'
import IconServer from '~icons/tabler/server-bolt'
import IconTextWrap from '~icons/tabler/text-wrap-disabled'
import IconSpark from '~icons/tabler/sparkles'
import IconAlert from '~icons/tabler/alert-triangle'
import IconChevron from '~icons/tabler/chevron-right'
import IconExternal from '~icons/tabler/external-link'

const ICONO: Record<ChatFallo['tipo'], typeof IconKey> = {
  auth: IconKey,
  credito: IconCoin,
  tope: IconCoin,
  limite: IconHourglass,
  modelo: IconCube,
  red: IconWifiOff,
  proveedor: IconServer,
  contexto: IconTextWrap,
  'sin-proveedor': IconSpark,
  desconocido: IconAlert
}

/**
 * Los que se arreglan solos esperando van en ámbar; los que exigen que el usuario haga algo,
 * en rojo. El color es la primera lectura: dice si esto es un contratiempo o una tarea.
 */
const TEMPLADO: ChatFallo['tipo'][] = ['limite', 'red', 'proveedor']

export default function FailBlock({ fail }: { fail: ChatFallo }): JSX.Element {
  const [abierto, setAbierto] = useState(false)
  const Icon = ICONO[fail.tipo] ?? IconAlert
  const suave = TEMPLADO.includes(fail.tipo)
  const tono = suave ? 'text-amber-400' : 'text-red-400'
  const borde = suave ? 'border-amber-400/25 bg-amber-400/[0.06]' : 'border-red-400/25 bg-red-400/[0.06]'

  const actuar = (): void => {
    if (!fail.accion) return
    if (fail.accion.kind === 'settings') window.monper.openSettings('ai')
    else if (fail.accion.value) window.monper.go(fail.accion.value)
  }

  return (
    <div className={`rounded-xl border px-3 py-2.5 flex flex-col gap-1.5 ${borde}`}>
      <div className="flex items-start gap-2.5">
        <Icon className={`w-[17px] h-[17px] shrink-0 mt-px ${tono}`} />
        <div className="flex-1 min-w-0">
          <div className={`text-[13.5px] font-semibold ${tono}`}>{fail.titulo}</div>
          <p className="text-[13px] leading-relaxed text-text-dim mt-0.5">{fail.detalle}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 pl-[27px]">
        {fail.accion && (
          <button
            onClick={actuar}
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-[12.5px] text-text transition-colors [&>svg]:w-3.5 [&>svg]:h-3.5 [&>svg]:opacity-70"
          >
            {fail.accion.label}
            {fail.accion.kind === 'url' && <IconExternal />}
          </button>
        )}
        {/* El error del proveedor sigue aquí, plegado: sin él, un caso mal clasificado sería
            imposible de depurar y esto quedaría peor que volcar la cadena cruda. */}
        {fail.crudo && (
          <button
            onClick={() => setAbierto((v) => !v)}
            className="flex items-center gap-1 h-7 px-1.5 rounded-lg text-[12px] text-text-faint hover:text-text-dim transition-colors"
          >
            <IconChevron className={'w-3 h-3 transition-transform duration-150 ' + (abierto ? 'rotate-90' : '')} />
            Detalle técnico
          </button>
        )}
      </div>

      {abierto && fail.crudo && (
        <pre className="ml-[27px] mt-0.5 p-2 rounded-lg bg-black/25 text-[11.5px] leading-relaxed text-text-faint whitespace-pre-wrap break-words max-h-40 overflow-y-auto selectable [&::-webkit-scrollbar]:w-0">
          {fail.crudo}
        </pre>
      )}
    </div>
  )
}

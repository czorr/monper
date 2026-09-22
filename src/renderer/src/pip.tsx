import { t as tr, useLocale } from '@renderer/lib/i18n'
import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState, type JSX } from 'react'
import type { PipOferta } from '@shared/types'
import IconPlay from '~icons/tabler/player-play-filled'
import IconPause from '~icons/tabler/player-pause-filled'
import IconBack from '~icons/tabler/arrow-back-up'
import IconX from '~icons/tabler/x'
import './styles.css'

const pip = window.pipwin

/**
 * La ventana del Picture-in-Picture.
 *
 * El vídeo llega por WebRTC desde la pestaña (ver `preload/pipSource.ts`): aquí solo se pinta
 * el stream. En reposo se ve el vídeo y nada más; los controles y el sitio de origen aparecen
 * al pasar por encima, porque un PiP con la interfaz siempre puesta tapa justo lo que has
 * sacado a flotar.
 */
function PipWindow(): JSX.Element {
  useLocale()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hover, setHover] = useState(false)
  const [pausado, setPausado] = useState(false)
  const [origen, setOrigen] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    pip.onOferta(async (d: PipOferta) => {
      try {
        setOrigen(new URL(d.origen).hostname.replace(/^www\./, ''))
      } catch { setOrigen(d.titulo) }
      setPausado(d.pausado)
      try {
        const pc = new RTCPeerConnection()
        pc.ontrack = (e) => {
          if (videoRef.current) videoRef.current.srcObject = e.streams[0]
        }
        await pc.setRemoteDescription(JSON.parse(d.sdp) as RTCSessionDescriptionInit)
        const respuesta = await pc.createAnswer()
        await pc.setLocalDescription(respuesta)
        // Igual que en el origen: sin los candidatos ICE la conexión no llega a establecerse.
        await new Promise<void>((resolve) => {
          if (pc.iceGatheringState === 'complete') return resolve()
          pc.addEventListener('icegatheringstatechange', () => {
            if (pc.iceGatheringState === 'complete') resolve()
          })
          setTimeout(resolve, 1500)
        })
        pip.responder(JSON.stringify(pc.localDescription))
      } catch (e) {
        // Sin esto la ventana se quedaría negra para siempre y nadie sabría por qué.
        console.error('[pip] no se pudo establecer la conexión:', e)
        setError(tr("No se pudo recibir el vídeo"))
      }
    })
  }, [])

  const alternar = (): void => {
    const v = !pausado
    setPausado(v)
    pip.comando(v ? 'pause' : 'play')
    // El <video> local es un espejo del stream: pausarlo aquí solo congelaría la imagen, así
    // que quien manda es el vídeo de la pestaña. Aquí se sigue lo que él haga.
    if (videoRef.current) { if (v) videoRef.current.pause(); else void videoRef.current.play() }
  }

  return (
    <div
      className="fixed inset-0 overflow-hidden rounded-[14px] bg-black select-none"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      // Toda la ventana arrastra: no hay barra de título de la que tirar.
      style={{ ['WebkitAppRegion' as never]: 'drag' }}
    >
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain bg-black" />

      {error && (
        <div className="absolute inset-0 grid place-items-center text-[12.5px] text-text-dim px-4 text-center">
          {error}
        </div>
      )}

      {/* Capa de controles: aparece al hover y no roba el arrastre salvo en los botones. */}
      <div
        className={'absolute inset-0 transition-opacity duration-150 ' + (hover ? 'opacity-100' : 'opacity-0 pointer-events-none')}
      >
        {/* De dónde sale el vídeo, arriba y en pequeño. */}
        <div className="absolute top-0 left-0 right-0 h-9 px-2.5 flex items-center gap-1.5 bg-gradient-to-b from-black/70 to-transparent">
          <span className="text-[11.5px] text-white/80 truncate">{origen}</span>
        </div>

        <div
          className="absolute bottom-0 left-0 right-0 h-11 px-2 flex items-center justify-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent"
          style={{ ['WebkitAppRegion' as never]: 'no-drag' }}
        >
          <button onClick={alternar} title={pausado ? tr("Reproducir") : tr("Pausa")} className={BTN}>
            {pausado ? <IconPlay /> : <IconPause />}
          </button>
          <button onClick={() => pip.volver()} title={tr("Volver a la pestaña")} className={BTN}>
            <IconBack />
          </button>
          <button onClick={() => pip.comando('cerrar')} title={tr("Cerrar")} className={BTN}>
            <IconX />
          </button>
        </div>
      </div>
    </div>
  )
}

const BTN =
  'grid place-items-center w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 text-white ' +
  'transition-colors [&>svg]:w-[15px] [&>svg]:h-[15px]'

createRoot(document.getElementById('root')!).render(<PipWindow />)

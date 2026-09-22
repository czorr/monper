import { useId, type JSX } from 'react'
import logo from '@renderer/assets/iso-white.svg'

// GlassLogo de la web app, con los valores de su tema oscuro para estas superficies.
// El filtro va en el padre: aplicado sobre la máscara recortaría el relieve.
export function GlassLogo({ className = '' }: { className?: string }): JSX.Element {
  const filterId = `glass-logo-${useId().replace(/:/g, '')}`

  return (
    <div aria-hidden="true" className={`relative size-11 shrink-0 ${className}`}>
      <svg aria-hidden className="absolute size-0" focusable="false">
        <defs>
          <filter id={filterId}>
            <feFlood floodColor="#000000" floodOpacity="0.24" result="bodyInk" />
            <feComposite in="bodyInk" in2="SourceAlpha" operator="in" result="body" />

            <feOffset in="SourceAlpha" dx="0" dy="1.5" result="offset" />
            <feGaussianBlur in="offset" stdDeviation="1.5" result="blurred" />
            <feComposite in="SourceAlpha" in2="blurred" operator="out" result="lip" />
            <feFlood floodColor="#000000" floodOpacity="0.85" result="ink" />
            <feComposite in="ink" in2="lip" operator="in" result="shadow" />

            <feOffset in="SourceAlpha" dx="0" dy="-1.5" result="liftOffset" />
            <feGaussianBlur in="liftOffset" stdDeviation="1.5" result="liftBlurred" />
            <feComposite in="SourceAlpha" in2="liftBlurred" operator="out" result="liftLip" />
            <feFlood floodColor="#ffffff" floodOpacity="0.1" result="liftInk" />
            <feComposite in="liftInk" in2="liftLip" operator="in" result="highlight" />

            <feMorphology in="SourceAlpha" operator="dilate" radius="1" result="grown" />
            <feComposite in="grown" in2="SourceAlpha" operator="out" result="ring" />
            <feFlood floodColor="#ffffff" floodOpacity="0" result="rimInk" />
            <feComposite in="rimInk" in2="ring" operator="in" result="rim" />

            <feMerge>
              <feMergeNode in="rim" />
              <feMergeNode in="body" />
              <feMergeNode in="highlight" />
              <feMergeNode in="shadow" />
            </feMerge>
          </filter>
        </defs>
      </svg>
      <div className="size-full" style={{ filter: `url(#${filterId})` }}>
        {/* El negro solo aporta el alfa; el filtro pinta el cuerpo y los bordes. */}
        <div
          className="size-full bg-black"
          style={{
            maskImage: `url(${JSON.stringify(logo)})`,
            maskSize: 'contain',
            maskRepeat: 'no-repeat',
            maskPosition: 'center',
            WebkitMaskImage: `url(${JSON.stringify(logo)})`,
            WebkitMaskSize: 'contain',
            WebkitMaskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center'
          }}
        />
      </div>
    </div>
  )
}

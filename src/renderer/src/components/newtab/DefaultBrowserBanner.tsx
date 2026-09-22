import { t as tr, useLocale } from '@renderer/lib/i18n'
import { useEffect, useState, type JSX } from 'react'
import IconX from '~icons/tabler/x'

const { titanioTab } = window

/**
 * Ofrece Titanio como navegador predeterminado. Solo cuando toca.
 *
 * Tres cosas que hacen que un banner así no se odie, y que decide el main en `debeOfrecerse`:
 * no aparece si ya lo somos, no vuelve hasta pasado un mes si lo descartaste, y **nunca sale
 * en desarrollo** (ahí registraría Electron, no Titanio).
 *
 * Y si el sistema rechaza el cambio se dice **por qué**, en el mismo sitio: un banner que
 * desaparece sin más deja al usuario creyendo que ya está hecho.
 */
export default function DefaultBrowserBanner(): JSX.Element | null {
  useLocale()
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    titanioTab.getDefaultBrowser()
      .then((s) => setVisible(s.shouldOffer))
      .catch((e) => console.error('[predeterminado] no se pudo consultar el estado:', e))
  }, [])

  if (!visible) return null

  const hacerlo = async (): Promise<void> => {
    const r = await titanioTab.makeDefaultBrowser()
    if (r.ok) setVisible(false)
    else setError(r.error || tr("El sistema no aceptó el cambio."))
  }

  const descartar = (): void => {
    titanioTab.dismissDefaultBrowser()
    setVisible(false)
  }

  return (
    <div className="w-full max-w-[600px] -mt-6 mb-8">
      <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/[0.05] border border-white/10">
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] text-text">{tr("Hacer de Titanio tu navegador predeterminado")}</div>
          <div className="text-[12px] text-text-faint mt-0.5">
            {error || tr("Los enlaces que abras desde otras apps llegarán aquí.")}
          </div>
        </div>
        <button
          onClick={hacerlo}
          className="shrink-0 h-8 px-3.5 rounded-lg bg-white/90 text-black text-[12.5px] font-medium hover:bg-white transition-colors"
        >
          {tr("Usar Titanio")} </button>
        <button
          onClick={descartar}
          title={tr("Ahora no")}
          className="shrink-0 w-7 h-7 grid place-items-center rounded-lg text-text-faint hover:text-text hover:bg-white/[0.08] transition-colors [&>svg]:w-4 [&>svg]:h-4"
        >
          <IconX />
        </button>
      </div>
    </div>
  )
}

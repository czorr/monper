import { Suspense, lazy, memo, type JSX } from 'react'

/**
 * Markdown del asistente, cargado en diferido.
 *
 * `react-markdown` + `remark-gfm` + micromark son ~547 KB, y antes entraban en el chunk que
 * carga `index.html`: el navegador parseaba medio mega de maquinaria de Markdown para pintar
 * un sidebar y una topbar, en cada arranque. Solo hace falta cuando el agente contesta.
 *
 * Mientras llega el chunk se muestra el mismo texto en plano, con la tipografía final: así no
 * hay hueco en blanco ni salto de layout, solo el formato que aparece un instante después.
 * Ocurre una vez por sesión; a partir de ahí React ya lo tiene cargado.
 */
const Impl = lazy(() => import('./MarkdownImpl'))

function MarkdownLazy({ children }: { children: string }): JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="text-[13.5px] leading-relaxed text-text whitespace-pre-wrap">{children}</div>
      }
    >
      <Impl>{children}</Impl>
    </Suspense>
  )
}

/** Memoizado: solo re-render cuando cambia el texto (importa durante el streaming). */
export const Markdown = memo(MarkdownLazy)

import type { Components } from 'react-markdown'

const { monperTab } = window

/**
 * Cómo se pinta el markdown en Settings.
 *
 * Vive aparte desde que hay dos pantallas que lo enseñan —Skills y Memory— y las dos tienen que
 * verse igual: es el mismo tipo de contenido (un .md del agente) y dos tablas de estilos
 * separadas se habrían ido despegando a la primera.
 */
export const MD_COMPONENTS: Components = {
  p: ({ children }) => <p className="my-3 leading-relaxed text-[13.5px] text-text-dim">{children}</p>,
  h1: ({ children }) => <h1 className="mt-6 mb-3 text-[18px] font-semibold text-text">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-6 mb-2 text-[15px] font-semibold text-text">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-4 mb-1.5 text-[14px] font-semibold text-text">{children}</h3>,
  ul: ({ children }) => <ul className="my-3 pl-5 list-disc marker:text-text-faint space-y-1.5 text-[13.5px] text-text-dim">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 pl-5 list-decimal marker:text-text-faint space-y-1.5 text-[13.5px] text-text-dim">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-text">{children}</strong>,
  a: ({ children, href }) => <a onClick={(e) => { e.preventDefault(); if (href) monperTab.navigate(href) }} className="text-sky-400 hover:underline cursor-pointer">{children}</a>,
  code: ({ className, children }) => {
    if (!className) return <code className="px-1.5 py-0.5 rounded-[5px] bg-white/[0.07] text-[12.5px] font-mono text-text">{children}</code>
    return <code className="block text-[12.5px] font-mono leading-relaxed text-text">{children}</code>
  },
  pre: ({ children }) => <pre className="my-3 p-4 rounded-xl bg-[#0d0d10] border border-white/[0.06] overflow-x-auto [&::-webkit-scrollbar]:h-1.5">{children}</pre>,
  hr: () => <hr className="my-6 border-white/[0.06]" />
}

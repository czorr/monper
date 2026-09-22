import type { JSX } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const { titanio } = window

// Componentes a medida: tipografía compacta y coherente con el tema oscuro del panel.
const COMPONENTS: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0 leading-relaxed">{children}</p>,
  a: ({ href, children }) => (
    <a
      href={href}
      onClick={(e) => { e.preventDefault(); if (href) titanio.go(href) }}
      className="text-sky-400 hover:underline underline-offset-2 cursor-pointer"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="my-2 pl-4 list-disc marker:text-text-faint space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 pl-4 list-decimal marker:text-text-faint space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => <h1 className="mt-3 mb-1.5 text-[15px] font-semibold tracking-[-0.1px]">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-3 mb-1.5 text-[14px] font-semibold tracking-[-0.1px]">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-2.5 mb-1 text-[13.5px] font-semibold">{children}</h3>,
  strong: ({ children }) => <strong className="font-semibold text-text">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  hr: () => <hr className="my-3 border-white/10" />,
  blockquote: ({ children }) => (
    <blockquote className="my-2 pl-3 border-l-2 border-white/15 text-text-dim">{children}</blockquote>
  ),
  code: ({ className, children }) => {
    const inline = !className
    if (inline) {
      return <code className="px-1 py-0.5 rounded-[5px] bg-white/[0.08] text-[12.5px] font-mono">{children}</code>
    }
    return (
      <code className="block my-2 p-3 rounded-lg bg-black/30 border border-white/10 overflow-x-auto text-[12.5px] font-mono leading-relaxed [&::-webkit-scrollbar]:h-1.5">
        {children}
      </code>
    )
  },
  pre: ({ children }) => <pre className="my-0">{children}</pre>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto [&::-webkit-scrollbar]:h-1.5">
      <table className="w-full text-[12.5px] border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-white/10 px-2 py-1 text-left font-semibold bg-white/[0.04]">{children}</th>,
  td: ({ children }) => <td className="border border-white/10 px-2 py-1">{children}</td>
}

function MarkdownImpl({ children }: { children: string }): JSX.Element {
  return (
    <div className="text-[13.5px] text-text">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  )
}

/**
 * Implementación real. Se carga en un chunk aparte (ver Markdown.tsx): react-markdown +
 * micromark pesan ~547 KB y no tienen nada que hacer en el arranque del navegador.
 */
export default MarkdownImpl

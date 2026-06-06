import ReactMarkdown from "react-markdown";

/**
 * Render de markdown para las respuestas del agente. Sin rehype-raw → no ejecuta
 * HTML (seguro contra XSS). Componentes mapeados a clases Tailwind del tema.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        ul: ({ children }) => (
          <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        code: ({ children }) => (
          <code className="rounded bg-black/20 px-1 py-0.5 font-mono text-xs">{children}</code>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-periwinkle underline"
          >
            {children}
          </a>
        ),
        h1: ({ children }) => <p className="mb-2 text-base font-semibold">{children}</p>,
        h2: ({ children }) => <p className="mb-2 text-base font-semibold">{children}</p>,
        h3: ({ children }) => <p className="mb-2 font-semibold">{children}</p>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

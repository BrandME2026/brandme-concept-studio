import { cn } from "@/lib/utils";

type Variant = "primary" | "mint" | "white" | "ghost-on-dark" | "outline";

/**
 * Botón con las variantes del DESIGN.md (together.ai).
 * Label SIEMPRE en mono mayúsculas (mono-caps-button); shape rounded-sm 4px; sin sombra.
 */
const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-on-primary",
  mint: "bg-accent-mint text-ink",
  white: "bg-canvas text-ink",
  "ghost-on-dark": "bg-surface-dark-soft text-on-dark",
  outline: "bg-canvas text-ink border border-hairline rounded-xs",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({
  variant = "primary",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-sm px-6 py-1.5",
        "font-mono text-base font-medium uppercase tracking-[0.08px]",
        "transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed",
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

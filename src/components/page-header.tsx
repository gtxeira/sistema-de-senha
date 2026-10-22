import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  /** Linha fina acima do título (ex.: "BEM-VINDO"). */
  readonly eyebrow?: string;
  /** Título da tela. */
  readonly title?: string;
  /** Complemento abaixo do título. */
  readonly subtitle?: string;
}

/**
 * Cabeçalho da página: eyebrow + título + subtítulo.
 *
 * Vive na própria página (e não no layout) porque o texto é **dado da
 * tela** — cada rota sabe o que é. Renderizado no primeiro paint, o
 * título já sai no HTML; antes ele era publicado num effect para uma
 * store global e só aparecia depois da hidratação.
 *
 * Sem `"use client"`: é markup puro, serve tanto no servidor quanto no
 * client. As margens (`mt-4 mb-3`) preservam o espaçamento que o layout
 * produzia — o `gap-4` do `<main>` continua valendo porque o fragmento
 * da página não cria nó DOM.
 */
export function PageHeader({ eyebrow, title, subtitle }: PageHeaderProps) {
  if (!eyebrow && !title && !subtitle) return null;

  return (
    <div className="mt-4 mb-3 sm:mt-5">
      {eyebrow && (
        <p className="text-[10px] font-extrabold tracking-[1.25px] text-[#7990a1]">
          {eyebrow}
        </p>
      )}
      {title && (
        <h1
          className={cn(
            "mt-2 text-[24px] font-bold text-[#13324d] sm:text-[30px]",
            subtitle && "mb-1.25",
          )}
        >
          {title}
        </h1>
      )}
      {subtitle && <p className="text-[13px] text-[#7590a0]">{subtitle}</p>}
    </div>
  );
}

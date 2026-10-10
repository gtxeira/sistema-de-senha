/**
 * Classes Tailwind compartilhadas da área de administração.
 *
 * Antes, `page.tsx` e `AccessSection.tsx` importavam o mesmo
 * `Admin.module.css`; agora as regras usadas pelos dois arquivos viram
 * strings reutilizáveis aqui, e o que é específico de cada um fica em
 * consts locais no próprio componente.
 */

/** Cartão branco padrão das seções da tela. */
export const sectionStyle =
  "mt-[25px] rounded-[12px] border border-[#dde9ed] bg-white p-[26px]";

/** Cabeçalho da seção: eyebrow à esquerda, ações à direita. */
export const sectionTitleStyle = "flex justify-between";

/** O `<p>` do cabeçalho (eyebrow): minúsculo, largo e cinza-azulado. */
export const sectionEyebrowStyle =
  "text-[10px] font-extrabold tracking-[1.5px] text-[#7895a3]";

/** O `<h2>` do cabeçalho: respiro acima do eyebrow. */
export const sectionHeadingStyle = "mt-[7px] text-[18px]";

/** Faixa de mensagem (sucesso/permissão): verde clarinho com borda. */
export const alertBoxStyle =
  "mb-1.5 rounded-[8px] border border-[#a8dbb9] bg-[#eaf7ef] px-[18px] py-[13px] text-[13px] text-[#1a6b3a]";

/** Label de campo (sync e formulários): minúsculo e bold. */
export const fieldLabelStyle =
  "mb-1.5 block text-[11px] font-bold uppercase tracking-[0.5px] text-[#416477]";

/** Campo de texto/select: borda 1.5px que azuleja no foco. */
export const fieldStyle =
  "w-full rounded-[8px] border-[1.5px] border-[#cddde5] bg-white px-[13px] py-[11px] text-[14px] outline-none transition-[border-color] duration-[150ms] focus:border-[#1678a0]";

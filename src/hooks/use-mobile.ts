import * as React from "react"

const MOBILE_BREAKPOINT = 768

/** Assina o `matchMedia` do breakpoint mobile (fonte externa ao React). */
function subscribe(callback: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}

export function useIsMobile() {
  // `useSyncExternalStore` lê o valor direto da fonte externa (o
  // `matchMedia`) em vez de copiá-lo para o estado via effect — evita o
  // setState síncrono no efeito e o flash de hidratação (server = false).
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false,
  )
}

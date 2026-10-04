/**
 * 'smooth' unless the person asked for reduced motion — then scroll jumps.
 * Use for every programmatic scroll (scrollIntoView / scrollTo / scrollBy).
 */
export function scrollBehavior(): ScrollBehavior {
  if (typeof window === 'undefined' || !window.matchMedia) return 'auto'
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

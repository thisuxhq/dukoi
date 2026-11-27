import type { Action } from 'svelte/action'

export interface RevealOptions {
  /** Stagger delay in milliseconds (keep short: 30-80ms between siblings). */
  delay?: number
  /** Slight scale(0.985) entrance in addition to translateY. */
  scale?: boolean
}

/**
 * Progressive-enhancement scroll reveal using IntersectionObserver.
 * Elements already inside the viewport on load stay visible immediately;
 * below-the-fold elements reveal once as they scroll into view.
 */
export const reveal: Action<HTMLElement, RevealOptions | undefined> = (node, options = {}) => {
  const applyOptions = (opts: RevealOptions = {}) => {
    if (opts.delay) {
      node.style.setProperty('--reveal-delay', `${opts.delay}ms`)
    } else {
      node.style.removeProperty('--reveal-delay')
    }
    if (opts.scale) {
      node.setAttribute('data-reveal-scale', '')
    } else {
      node.removeAttribute('data-reveal-scale')
    }
  }

  applyOptions(options)

  // Already in view (or above the current scroll position) — never hide or flash.
  const rect = node.getBoundingClientRect()
  if (rect.top < window.innerHeight * 0.94) {
    node.setAttribute('data-reveal', 'visible')
    return { update: applyOptions }
  }

  node.setAttribute('data-reveal', 'hidden')

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          node.setAttribute('data-reveal', 'visible')
          observer.disconnect()
          break
        }
      }
    },
    { threshold: 0.08, rootMargin: '0px 0px -48px 0px' },
  )

  observer.observe(node)

  return {
    update: applyOptions,
    destroy() {
      observer.disconnect()
    },
  }
}

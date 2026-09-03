import type { Page } from 'playwright'

/**
 * tsx rewrites named functions as `__name(fn, "fn")`. Playwright then
 * serializes that into the renderer, where `__name` does not exist.
 * Build the function at runtime so the page only sees plain JS.
 */
export async function evalInPage<T, A = unknown>(page: Page, body: string, arg?: A): Promise<T> {
  const fn = new Function('arg', body)
  return page.evaluate(fn as never, arg)
}

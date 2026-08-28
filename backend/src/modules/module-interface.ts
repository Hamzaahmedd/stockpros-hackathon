import type { Router } from 'express'

/** Public contract exposed by every business module to the composition root. */
export interface AppModule {
  readonly name: string
  readonly route: string
  readonly router: Router
}

export const defineModule = (module: AppModule): AppModule =>
  Object.freeze(module)

import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Components render into the same jsdom document; unmount between tests.
afterEach(() => {
  cleanup()
})

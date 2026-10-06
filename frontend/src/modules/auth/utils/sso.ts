const BINDING_KEY = 'sso_binding_token'

/** Keeps the binding token in this tab only; storage can be unavailable (private mode), so every access is guarded. */
export const saveSsoBinding = (token: string): void => {
  try {
    sessionStorage.setItem(BINDING_KEY, token)
  } catch {
    // Without storage the sign-in cannot be completed here; the exchange will report it.
  }
}

export const readSsoBinding = (): string | null => {
  try {
    return sessionStorage.getItem(BINDING_KEY)
  } catch {
    return null
  }
}

export const clearSsoBinding = (): void => {
  try {
    sessionStorage.removeItem(BINDING_KEY)
  } catch {
    // Nothing to clear.
  }
}

/** The backend only ever sends an https IdP address; anything else is refused rather than followed. */
export const isSafeRedirectUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

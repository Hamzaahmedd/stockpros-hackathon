/** How an admin supplies their IdP's settings. */
export enum SsoConfigSource {
  METADATA_XML = 'METADATA_XML',
  METADATA_URL = 'METADATA_URL',
  MANUAL = 'MANUAL',
}

/** Why a sign-in round trip to the IdP was started. */
export enum SsoFlowPurpose {
  /** A real login: success mints a one-time code the browser exchanges for a session. */
  LOGIN = 'LOGIN',
  /** An admin's "Test SSO connection": success only marks the connection as tested. */
  TEST = 'TEST',
}

/** The result the app is told about after an IdP round trip (`?sso=` on login, `?sso_test=` on the security page). */
export enum SsoReturnResult {
  PASSED = 'passed',
  FAILED = 'failed',
}

/** Where the browser lands after the IdP posts back to us. */
export enum SsoCallbackOutcome {
  LOGIN_READY = 'LOGIN_READY',
  LOGIN_FAILED = 'LOGIN_FAILED',
  TEST_PASSED = 'TEST_PASSED',
  TEST_FAILED = 'TEST_FAILED',
}

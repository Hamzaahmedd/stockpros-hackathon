# Enterprise SSO (SAML 2.0) — runbook

SAML single sign-on for workspace domains. Off by default (`config.features.enableSso`).
Everything SAML-specific sits behind the `SsoProvider` port
(`src/modules/sso/provider.ts`); the adapter is `@node-saml/node-saml`
(`src/modules/sso/providers/node-saml.ts`).

## How a login works

1. `POST /api/v1/auth/sso/start { email }` — finds the enabled, verified domain for the
   email, stores single-use state in Redis and returns the IdP redirect plus a
   `bindingToken` the browser keeps in `sessionStorage`.
2. The IdP posts the signed response to `POST /api/v1/auth/sso/:tenantId/acs`. We require a
   **signed assertion** that answers a request we issued (`InResponseTo`, single use,
   tenant-scoped), then check audience and clock skew, then claim the request id atomically.
   The browser is always redirected back to the app (`/auth/sso/complete?code=…` or a
   generic failure); the reason is only in the server logs.
3. `POST /api/v1/auth/sso/exchange { code, bindingToken }` — the code lives 60 seconds, works
   once and only with the binding token of the browser that started the login. `ssoSignIn`
   (auth service) requires the asserted email to be on **exactly** the tenant's verified
   domain, then runs `assertLoginAllowed` and `persistSession` (recording `login_method =
   SSO` and `sso_tenant_id`; access tokens carry the usual `sid`).

The tenant id is the `team_domains.id` of the domain. IdP settings live in
`team_sso_connections` (public data only — no secrets).

## Turning it on

1. Apply the schema: `npm run db:sync` (additive).
2. Set `API_PUBLIC_URL` (public base URL of this API; ACS URLs are built from it).
   Required in production once the flag is on — startup fails without it.
3. Redis must be connected in production. Without it every SSO route answers `503`
   (single-use state must be shared between instances).
4. Set `features.enableSso: true` in `src/config/production.ts` (or the environment's file)
   and deploy. While it is off every SSO route, and the team SSO routes, answer
   `403 FORBIDDEN_FEATURE_DISABLED` and the UI shows nothing.

## Setting up a customer

Owner or admin (enabling: owner only), **Workspace → Security** (`/settings/workspace/security`):

1. Verify the company domain (Domains tab) if it is not yet.
2. Copy the **ACS URL** and **Entity ID** into the IdP. The IdP must **sign the assertion**
   and send the user's email (as an email Name ID or an `email` / `mail` attribute).
3. Give us the IdP settings (metadata URL, metadata file, or manual) and save.
4. **Test SSO connection** (owner or admin). Then the **owner** switches **Enable SSO** on after
   checking the IdP settings shown: whoever controls them can assert any email on the domain,
   so admins can configure and test but not enable. Admins can switch it off.
5. The owner may then require it: Sign-in security → *Single sign-on (SAML) only*
   (needs an enabled, tested connection and an owner session that passed the test, so the
   owner cannot lock themselves out).

Any change to the IdP settings switches SSO off and clears the test result. While SSO is
required the connection cannot be changed, disabled or removed (409): the owner first
moves the domain to another sign-in method.

## Verifying against a real IdP (before enabling for a customer)

The automated tests simulate the IdP with real signed assertions; they cannot prove a
particular vendor's behaviour. Check once per vendor (Okta, Entra ID, Ping, Google):

- [ ] Metadata URL / file imports without error (HTTP-Redirect sign-in endpoint present).
- [ ] **Test SSO connection** passes and returns to `/settings/workspace/security`.
- [ ] A user on the domain signs in from `/login` and lands signed in; a first-time user
      goes through onboarding.
- [ ] The user's email arrives (check the server log line `[SSO] assertion rejected` →
      `no usable email` if not) and is lower-cased correctly.
- [ ] A user whose email is on another domain is refused.
- [ ] A workspace *admin* can save and test but cannot enable (button disabled, API 403).
- [ ] After *Disable SSO* the SSO session is signed out within one access-token lifetime.
- [ ] Certificate rotation: save the new metadata, test, enable again.

## Break-glass (customer cannot sign in)

Staff (platform admin, step-up, reason + ticket), Ops panel → Team workspaces → *View SSO*:

- **Disable SSO** — turns SSO off, signs out its sessions and, if SSO was required, puts the
  domain back to *any method* so people can use magic link / Google.
- **Reset SSO setup** — removes the connection entirely so the customer can start again.

Both write the team trail (`SAML_DISABLED` / `SAML_CONFIG_UPDATED`, `byStaff`) and the admin
trail (`SAML_DISABLED` / `SAML_CONFIG_RESET`), log identifiers through Pino and email the
risky-action alert. The existing *Reset auth policy to ANY* also frees a locked domain.

## Diagnosing a failed login

Failures never reach the user in detail. Search the logs for `[SSO]`:

| Log message | Meaning |
|---|---|
| `callback with unknown or mismatched state` | Relay state expired (10 min), reused, or from another tenant |
| `assertion rejected` (`detail`) | The SAML library refused it: signature, audience, expiry, `InResponseTo`, … |
| `replayed response refused` | The same response was posted twice |
| `login refused for identity outside its domain` | The IdP asserted an email not on the tenant's domain |

Logs carry tenant ids and library error text only — never assertions, certificates or emails.

## Limits (v1)

SAML 2.0 only (OIDC is not implemented); HTTP-Redirect out / HTTP-POST in; no single logout,
no SCIM / group mapping; metadata is read once (not refreshed); several signing
certificates are accepted for rotation; one workspace per user (existing rule).

## Swapping the broker

Callers depend only on `SsoProvider` (`upsertConnection`, `deleteConnection`, `startLogin`,
`completeLogin`) and return a verified `{ tenantId, email, nameId, requestId, attributes }`.
A hosted broker (for example SuperTokens SAML) would be a new adapter in
`src/modules/sso/providers/`; the state handling, domain binding, `ssoSignIn`, policy
enforcement, UI and tests above it do not change.

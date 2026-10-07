# <company name> Corporate Website: Complete Implementation Plan

Status: Draft v2 (hypothetical) · Last updated: 2026-10-06 · Owner: TBD

This plan covers the public corporate website for <company name> (the "site"), in the style of Anthropic's corporate site. It presents the company: its mission, its approach to trust and responsible AI, its people, careers and news. The product (an AI stock forecasting platform, the "platform") has its own web app (the "app") at a separate address, and the site links to it. In v1 the site does not sell, price or demo the product; product pages can be added later as a section of this site (see §15). Platform facts used in the copy come from the repo's root `README.md`. Items that still need a decision are marked **[OPEN]**.

Placeholders used throughout: `<company name>`, `<domain>`, `<legal entity name>`, `<registered address>`, `<press email>`, `<careers email>`, `<security email>`.

Change from v1: product marketing was removed (no pricing, Teams or platform subpages, no live demo, no pricing endpoint, no app-side changes). One short platform page links to the app.

---

## 1. Goals, non-goals, success metrics

### Goals
1. Establish <company name> as a credible company: who we are, what we believe, who is behind it.
2. Publish an honest methodology and responsible-use position. For a forecasting company this is the main trust signal.
3. Attract talent through a careers section that is easy to browse and apply from.
4. Give press, partners and prospective investors one place to find facts, assets and contacts.
5. Point interested visitors to the platform and its app.
6. Own the brand search results for "<company name>", and rank for queries on responsible AI for investing.
7. Let communications and HR publish without engineering.

### Non-goals (v1)
- No product marketing in v1: no pricing, plan comparison, feature deep dives or live demo. These can be added later under `/platform` (see §15).
- No authenticated features. The app stays at `app.<domain>`.
- No documentation portal, community forum or in-site chat.
- No investor portal or financial reporting (private company; "Investors" is a contact page only, **[OPEN]**).
- No localisation beyond English (structure for i18n, ship one language).

### Success metrics (baseline after 30 days)
| Metric | Target |
| --- | --- |
| Lighthouse mobile: Performance / Accessibility / SEO / Best Practices | ≥ 90 / ≥ 95 / ≥ 95 / ≥ 95 |
| LCP / INP / CLS (p75, field data) | ≤ 2.0 s / ≤ 200 ms / ≤ 0.05 |
| Careers page → application click-through | ≥ 10% |
| Home → app click-through | tracked, baseline only |
| Branded search position for "<company name>" | #1 |
| Availability | ≥ 99.9% monthly |

---

## 2. Audiences and positioning

| Audience | Need | Primary pages | CTA |
| --- | --- | --- | --- |
| Job seeker | What the company is like, open roles, how hiring works | Company, Careers | View roles |
| Press and analysts | Facts, leadership, assets, contacts | Newsroom, Press kit | Contact press |
| Partners and prospective investors | Credibility, direction, a contact | Company, Investors | Get in touch |
| Regulators, auditors, business reviewers | Disclosures, security and privacy practice | Trust, Legal | Contact security |
| Curious visitors and prospective users | What the company builds and why we can be trusted | Home, Platform, Trust | Go to the app |

**[OPEN]** Primary market. The platform bills in PKR through Safepay but uses US market data (NYSE). Decide Pakistan-first, global, or both. It changes legal pages, regulatory disclosures and copy.

Voice: plain, specific, no hype, first person plural ("we"). Never use "guaranteed", "beat the market", "predict the market", "risk-free" or "sure thing".

---

## 3. Architecture

### 3.1 Decision
A separate static-first app at `website/`, deployed as its own Vercel project. It is not part of `frontend/`, which is a client-rendered Vite SPA with a catch-all rewrite in `frontend/vercel.json`. That is wrong for SEO-critical pages.

| Concern | Choice | Reason |
| --- | --- | --- |
| Framework | Astro 5, static output, minimal React islands | Near-zero JS by default |
| Language | TypeScript, `strict: true` | Matches repo standard |
| Styling | Tailwind 3.4 using a shared preset from `frontend/tailwind.config.cjs` | One brand source |
| Formatting | Prettier with the Tailwind plugin, `trailingComma: all`, `format:check` in CI | Matches `frontend/` |
| Content | MDX content collections with Zod schemas for news, blog, legal, methodology, press, people, values | Typed frontmatter, build-time validation, reviewed in PRs |
| Non-engineer publishing | Git-based CMS layer (for example Decap or TinaCMS) over the same MDX files **[OPEN]**; a hosted headless CMS only if volume demands it | Communications and HR publish without a developer; content stays in the repo |
| Careers | Hosted applicant tracking system (ATS) feed, fetched at build time and refreshed by a scheduled rebuild **[OPEN: which ATS]** | HR manages roles in the ATS; the site never stores applicant data |
| Forms | POST to one backend endpoint (§7) | Reuses Zod, rate limiting, Pino and Resend |
| Hosting | Vercel, per-PR previews | Already in use |
| Analytics | PostHog, consent-gated | Already in the app; see §8.5 |
| Search (later) | Pagefind | Static, no server |

Alternative considered: Next.js with static export. Rejected for v1 because it ships more client JS for no gain on content pages.

### 3.2 Layout
```
website/
  astro.config.ts
  tailwind.config.cjs        # extends the shared preset
  package.json  README.md
  public/                    # favicons, default OG image, robots.txt, press-kit assets
  src/
    config/
      site.ts                # company name, URLs, nav, footer, social, contacts (non-secret)
      features.ts            # feature flags (careers feed, newsroom)
    content/
      config.ts              # Zod collection schemas
      blog/ legal/ methodology/ press/ people/ values/ trust/
    components/
      ui/ sections/ islands/ # islands: ContactForm, ConsentBanner, JobList
    layouts/                 # Base, Article, Legal, Profile
    pages/                   # file-based routes (§4)
    lib/                     # seo.ts, schema-org.ts, api.ts, env.ts, ats.ts
  e2e/                       # Playwright
  scripts/                   # banned-phrase lint, link check, bundle budget
```
Update the root `README.md` architecture table and `sonar-project.properties` to include `website/`. Keep it in the existing top-level layout; do not create duplicate directories.

### 3.3 Environments
| Env | URL | Source |
| --- | --- | --- |
| Production | `https://<domain>` (`www` redirects to apex, 308) | `main` |
| Staging | `https://staging.<domain>` (protected, `noindex`) | `staging` |
| Preview | Vercel per-PR URL (`noindex`) | PRs |
| App | `https://app.<domain>` | `frontend/` (unchanged) |

---

## 4. Information architecture and routes

### 4.1 Navigation
Company · Platform · Trust · Careers · News · Contact · **Go to the app** (to `app.<domain>`). The Company menu holds About, Values, Leadership and Partners. The footer has Company, Trust, Careers, News, Legal, Social, and a one-line risk disclaimer with the <legal entity name> and <registered address>. Links to the app are plain links; the site passes no parameters and creates no sessions.

### 4.2 Route map
| Route | Purpose | Notes |
| --- | --- | --- |
| `/` | Home | Mission statement, our approach, trust strip, latest news, careers teaser, link to the app |
| `/company` | About <company name> | Story, mission, what we do and do not do |
| `/company/values` | Principles | How we make decisions, including product and data principles |
| `/company/leadership` | Leadership and advisors | Bios, only with consent |
| `/company/partners` | Partners and data providers | Only with permission and licence terms (§10) |
| `/platform` | What we build | One page: what the platform is, who it is for, link to the app, risk disclosure |
| `/careers` | Careers home | Culture, benefits, hiring process, open roles |
| `/careers/[role]` | Role detail | From the ATS feed; application link goes to the ATS |
| `/news` | Press releases, announcements and articles | One chronological list with type filter |
| `/news/[slug]` | Article or press release | MDX |
| `/press-kit` | Brand and media assets | Logos, screenshots, boilerplate, fact sheet, contacts |
| `/investors` | Investor enquiries | A short page with a contact route; no financials **[OPEN]** |
| `/trust` | Trust centre hub | Links to the pages below |
| `/trust/methodology` | How forecasts are made and evaluated | Model, data, evaluation, limitations |
| `/trust/responsible-use` | Responsible-use and AI principles | What forecasts are, what they are not, how we handle errors |
| `/trust/security` | Security and privacy practices | Only verified claims (§5.6) |
| `/trust/disclosures` | Regulatory status and conflicts of interest | **[OPEN]** per market |
| `/trust/report-an-issue` | Security disclosure and complaints route | Dedicated contacts, response commitments |
| `/contact` | Contact routes | Business, press, partnerships, security, careers, general |
| `/legal/terms`, `/privacy`, `/cookies`, `/risk-disclosure`, `/acceptable-use` | Legal | Counsel-approved text only |
| `/404`, `/500` | Errors | |
| `/sitemap-index.xml`, `/robots.txt`, `/rss.xml`, `/llms.txt`, `/.well-known/security.txt` | Generated | |

In v1, pricing, plans, Teams and the changelog live with the product, not on this site (see §15 for adding them later).

---

## 5. Page requirements

### 5.1 Home
1. Hero: one sentence on what <company name> exists to do, one subline, primary link "Our approach", secondary link "Go to the app".
2. Our approach: three short commitments (for example evidence over hype, honesty about limits, privacy by design) linking to Values, Methodology and Responsible use.
3. What we build: a short block linking to `/platform`.
4. Trust strip: links to Methodology, Security and Disclosures.
5. Latest news: the three most recent items, automatic.
6. Careers teaser: open-role count and a link.
7. Footer.

### 5.2 Company: About, Values, Leadership, Partners
- **About:** the founding story, the problem, the mission, what we build, and what we deliberately do not do (for example: we do not give personalised investment advice). About 600–900 words. Facts only; every claim sourced.
- **Values:** four to six principles with one concrete example each, written as commitments the site can be held to (for example, publishing model limitations and reproducible numbers).
- **Leadership:** photo, name, role, two-sentence bio and a link per person. Only people who gave written consent appear. Placeholder cards are never published.
- **Partners:** data providers (Finnhub, Polygon, FMP) and the payment partner (Safepay) are named only where licence and partner terms permit **[OPEN]**, with required attribution.
- Do not claim awards, customers, user counts, assets under analysis or funding unless documented and approved.

### 5.3 Platform
One page of about 300–500 words: what the platform does (AI forecasts with evaluation metrics, portfolio analytics, buy/sell/hold decision support), who it is for, and a link to the app. It carries the risk disclosure and links to Methodology. It has no prices, plan comparison, screenshots of paid features or demo.

### 5.4 Careers
- Careers home: why work here, what we are like, benefits, hiring process in steps, equal-opportunity statement, and the open-role list with filters (team, location, type).
- Role pages are generated from the ATS feed. The Apply button opens the ATS application. The site stores no applicant data and no CVs.
- The scheduled rebuild runs hourly. A role page that no longer exists redirects to the careers home.
- JSON-LD `JobPosting` markup per role, only for roles that are genuinely open, with correct location and employment type.
- Salary ranges are shown only where HR approves, and where local law requires it.
- Fallback when the feed fails: the last good snapshot, and a "Check back soon" state if none exists.

### 5.5 News and press kit
- One `/news` list holds press releases, company announcements and articles, with a type filter. Each item has a date, a headline and an author or media contact. Coverage links to external sites are labelled as such.
- Press kit: logo pack (SVG, PNG, light and dark), brand colours, approved screenshots, a one-page fact sheet, the company boilerplate, leadership headshots (with consent) and usage guidelines, as downloadable ZIP files hosted as static assets.
- Press enquiries go to `<press email>` through the lead pipeline with `topic = PRESS`.

### 5.6 Trust centre
- **Methodology:** model description (GRU time series), features, training and evaluation windows, metrics (MSE, RMSE, MAE), and a backtest table with date range and universe for each number. Limitations are stated plainly: markets are noisy, past performance does not predict future results, the model can be wrong, and forecasts are not investment advice. Every published number links to a reproducible script owned by the `ai-service` team, with a named reviewer, and a model version history. If a number cannot be reproduced, it is not published.
- **Responsible use:** what the platform is and is not, how confidence and risk levels should be read, known failure modes, how users can report a wrong output, and what we do with that feedback.
- **Security:** state only what is true today, and have engineering sign off every line: structured logging with PII redaction, append-only audit logs (including staff-action logs), signed payment webhooks (HMAC-SHA512), secrets kept in environment variables, account deletion that purges personal data and keeps `user_id`-only audit rows, and team data isolation enforced in application queries and covered by automated tests. **Do not claim database row-level security.** The repo has RLS code (commit `f04009c`) but it is not wired in. Re-check the repo before publishing, and update the claim only if RLS is later enabled. No certifications (SOC 2, ISO 27001) unless held.
- **Disclosures:** regulatory status for each market, conflicts of interest (for example whether staff hold positions in covered securities), and data-provider attributions **[OPEN]**.
- **Report an issue:** a security disclosure contact (`<security email>`), expected response times, and a separate route for complaints.

### 5.7 Contact
One page with routes for Business, Press, Partnerships, Security, Careers (links to the ATS) and General. One form for Business, Press, Partnerships and General with fields: name, work email, company (optional), message, consent checkbox, honeypot. It posts to §7.1, shows inline validation, and has clear success and failure states. Existing users who need help are pointed to in-app support, not the form.

### 5.8 Content types
News and blog items share one schema (Zod): `title`, `description` (≤ 160), `date`, `updated?`, `type: press | announcement | article | research-note`, `author`, `tags[]`, `cover`, `draft`. The build fails on schema errors, and drafts are excluded in production.

---

## 6. Backend and app changes

The only backend work is the contact form. It follows CLAUDE.md: Zod validation, OpenAPI updates, Pino logging with no PII, enums instead of magic strings, tests holding the 90% coverage gate, and `scripts/check-module-boundaries.cjs`, `tsc --noEmit`, `npm run build` and `npm run lint` passing.

### 6.1 `POST /api/v1/public/leads`
- New module `backend/src/modules/leads/`.
- Body: `{ name, email, company?, topic, message, consent: true, source, turnstileToken }`. Enum: `LeadTopic = BUSINESS | PRESS | PARTNERSHIP | GENERAL`.
- Protections: Cloudflare Turnstile (secret in `.env`, site key in `site.ts`), per-IP rate limit (for example 5/hour), payload size limit, CORS restricted to the site origin.
- Storage: a `lead` table (email, name, company, topic, consentAt, source). Email is PII, so it is never logged (log lead id only), can be purged on request, and has a retention limit **[OPEN: 24 months]**.
- Side effects: queue a confirmation email through the existing Resend worker and an internal notification routed by topic. Job payloads are Zod-validated on read.
- Responses: `202` accepted, `400` validation, `429` rate limited. A duplicate email returns the same `202`, to prevent enumeration.

### 6.2 Careers feed
Fetched by the site's build, not by the backend. The ATS credential, if one is needed, is a build-time secret in the hosting provider's environment, never in the client bundle. The build validates the feed with Zod and fails with a clear message if the shape changes.

### 6.3 App
No changes to `frontend/`. The site links to `app.<domain>` with plain links. All sign-in and sign-up stays in the app, through the existing path that calls `assertLoginAllowed` and `persistSession` (CLAUDE.md rule 7), so a verified domain's sign-in policy cannot be bypassed. No `/teams` routes are added, so `tenant-isolation.test.ts` is not affected.

### 6.4 Documentation
Add the endpoint to the OpenAPI spec. Write `website/README.md` (setup, scripts, env vars, content guide, release process). Update the root `README.md` (architecture table, env vars, Getting Started).

---

## 7. Cross-cutting requirements

### 7.1 SEO
- Unique `<title>` (≤ 60 characters) and meta description (≤ 160) per page, canonical URLs, Open Graph and Twitter cards, and a generated OG image per news item.
- JSON-LD: `Organization` (with `sameAs` social profiles, <legal entity name> and <registered address>), `WebSite`, `NewsArticle` (press), `BlogPosting`, `Person` (leadership), `JobPosting` (open roles), `BreadcrumbList`. No rating or review markup unless real and verifiable.
- `sitemap-index.xml`, `robots.txt`, `rss.xml`, `llms.txt`. A redirect map for retired URLs. A no-trailing-slash policy.

### 7.2 Performance budgets (CI-enforced)
- JS per route ≤ 40 KB gzip on content pages (no heavy islands on this site).
- Images through `astro:assets` (AVIF/WebP, explicit dimensions, lazy below the fold). Fonts self-hosted and subset, `font-display: swap`, at most 2 families.
- No third-party script on the critical path. Analytics loads after consent and idle.

### 7.3 Accessibility (WCAG 2.2 AA)
Semantic landmarks, visible focus, skip link, contrast ≥ 4.5:1, keyboard-operable nav and filters, `prefers-reduced-motion` respected, alt text on all leadership and press images, form errors announced with `aria-live`. axe runs in Playwright on every route.

### 7.4 Security
- Headers via `vercel.json` or middleware: strict CSP (nonce or hashes, no inline scripts), HSTS, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `frame-ancestors 'none'`.
- No secrets in the client bundle. Only public keys (Turnstile site key, PostHog key) appear in config. Env vars are validated with Zod at build.
- Non-secret settings (company contacts, nav, social links, feature flags) live in `src/config/*`, not in `.env`.
- `npm audit` with a baseline like `frontend/audit-baseline.json`, Dependabot, and lockfile-only installs in CI.
- The contact form relies on origin checks, Turnstile and rate limits.
- Dev-only tooling (Astro dev toolbar, the style guide route) is off in production builds.
- Any build script that reads generated files or fetched feeds (careers snapshot, sitemap, OG assets) checks `fs.existsSync` first and fails with a clear message.
- Publish `/.well-known/security.txt` with `<security email>`, a disclosure policy link and an expiry date.
- Email domain hygiene for the sending domain: SPF, DKIM and DMARC, since the contact pipeline sends mail.

### 7.5 Privacy and consent
- PostHog loads only after the visitor accepts. The consent banner has equal-weight Accept and Reject buttons, and a persistent "Cookie settings" link in the footer. Use a separate PostHog project, or a `site` property, so website events stay apart from product events.
- The privacy policy names every processor: hosting, PostHog, Resend, the form-protection provider, and the ATS (applicants are handled by the ATS under its own notice). It states retention periods and deletion routes, including how a lead deletion request is handled.
- Whether IP addresses are stored with leads **[OPEN]**. Default: not stored.
- Leadership photos and bios require written consent, with a documented way to have them removed.

### 7.6 Observability
Vercel Analytics and Speed Insights for field Web Vitals. Browser error monitoring **[OPEN: tool]** with PII scrubbing. Uptime checks on `/` and the lead endpoint, with alerts to the team channel. Backend logging for the new endpoint uses Pino with redaction and logs lead ids and counts only.

---

## 8. Design system and brand

- Reuse tokens from `frontend/tailwind.config.cjs` through a shared preset. Dark and light themes, defaulting to the system setting, with no flash of the wrong theme.
- Anthropic-style corporate tone: generous whitespace, large editorial type, one accent colour, text-led pages with real photography or illustration for People and Careers (no stock-photo crowds), and restrained motion.
- Components: Button, Link, Container, Section, Hero, ValueCard, ArticleCard, PressCard, PersonCard, JobList with filters, Callout (disclaimer), TOC, form fields, Toast, Footer, Nav with mobile drawer. Testimonials and logo strips only with real, permissioned content.
- Motion is subtle, ≤ 300 ms, and disabled under reduced motion.
- A `/internal/styleguide` route exists in non-production builds only, with `noindex`.
- Brand assets: the existing logo asset in `frontend/public`. A full SVG and favicon set, plus brand guidelines for the press kit **[OPEN: design owner]**.

---

## 9. Legal, compliance and claims policy

This needs counsel review before launch. It is not legal advice.

1. No investment advice. A risk disclosure appears in the footer, on the Platform page and at `/legal/risk-disclosure`.
2. A CI lint fails the build on banned phrases: guaranteed, risk-free, beat the market, predict the market, sure thing.
3. Performance claims need a source on the Methodology page, a date range and reproducibility, and must not be cherry-picked.
4. Company facts (founding date, team size, funding, customers, awards) appear only when documented and approved by leadership and counsel.
5. Check regulatory fit for each target market (securities regulator rules on research or advisory content) and publish the regulatory status on `/trust/disclosures` **[OPEN]**.
6. Confirm that the data-provider terms (Finnhub, Polygon, FMP) permit naming them, and note any required attribution.
7. Testimonials, logos, leadership bios and certifications appear only with written permission or proof.
8. Careers: an equal-opportunity statement and pay-range disclosures where local law requires them, reviewed by HR and counsel.
9. Press: every release approved by an authorised spokesperson before publication.
10. Lead consent text and a lawful basis recorded in `consentAt`.
11. Footer and legal pages state the <legal entity name> and <registered address>.

---

## 10. Quality, testing and CI

| Layer | Tool | Gate |
| --- | --- | --- |
| Types | `astro check`, `tsc --noEmit` | zero errors |
| Lint and format | ESLint, Prettier `format:check` | zero errors |
| Content | Zod collections, banned-phrase lint, link check (external nightly) | build fails |
| Unit | Vitest for `lib/*`, the ATS parser and form logic | ≥ 90% |
| E2E | Playwright, following `frontend/e2e` conventions: every route 200, nav, careers filters, news filters, form success/error/rate limit, theme, 404 | all pass on preview |
| Accessibility | `@axe-core/playwright` on all routes | zero serious or critical |
| Performance | Lighthouse CI, size budgets | meets §7.2 |
| Visual | Playwright screenshots, 3 widths | reviewed on diff |
| Static analysis | SonarCloud on `website/` (new-code gate) | pass |
| Backend | Jest for the leads endpoint, OpenAPI updated, module boundaries | within the repo-wide 90% gate |

Pipeline: install from the lockfile, typecheck, lint, format check, unit tests, build, content checks, deploy preview, then Playwright, axe and Lighthouse against the preview. These are required to merge.

---

## 11. Delivery plan

| Phase | Scope | Exit criteria | Est. |
| --- | --- | --- | --- |
| 0. Alignment | Resolve the **[OPEN]** items (market, ATS, CMS approach); company narrative and values workshop; leadership consent; wireframes; copy outline; legal kickoff | Signed-off sitemap and copy deck v1 | 1–2 wk |
| 1. Foundation | `website/` scaffold, shared tokens, layouts, nav and footer, env validation, banned-phrase lint, CI, preview deploys, security headers, `security.txt`, README updates | Empty shell on staging, all gates green | 3–4 d |
| 2. Company pages | Home, About, Values, Leadership, Partners, Platform, Press kit, Investors contact, Contact | Content approved by leadership | 1–1.5 wk |
| 3. Backend (parallel with 2) | Leads module, OpenAPI, tests, Turnstile, email routing | Endpoint on staging, 90% coverage kept, form works end to end | 3–4 d |
| 4. Careers | ATS feed, role pages, filters, JobPosting markup, fallback states | A role posted in the ATS appears on staging within the refresh window | 4–5 d |
| 5. Trust and legal | Methodology with reproducible numbers, Responsible use, Security, Disclosures, Report an issue, legal pages, consent banner | Counsel and engineering sign-offs recorded | 1–1.5 wk |
| 6. News and content | News list and articles, RSS, OG images, JSON-LD, sitemap | 3 launch articles and an announcement release | 4–5 d |
| 7. Hardening | Accessibility audit, cross-browser pass, redirect map, monitoring and alerts, rollback runbook | Launch checklist complete | 2–3 d |
| 8. Launch | DNS cutover, remove `noindex` on production only, verify analytics and consent, announce | Live, 48-hour watch | 1 d |

About 5–6 weeks with 2 engineers, 1 designer, and part-time content, communications, HR and legal reviewers. The critical path is Phase 0 and Phase 5 (narrative, leadership consent, legal review and methodology numbers), not code.

Working agreement for the build: one commit per phase; each phase ends with the full check run (typecheck, lint, format check, build, tests, module-boundary check).

---

## 12. Launch checklist

- [ ] All **[OPEN]** items resolved and recorded
- [ ] Company facts, leadership bios and partner names approved in writing
- [ ] Methodology numbers reproduced and signed off by the AI-service owner
- [ ] Security page re-checked against the repo (no RLS claim unless RLS is wired in)
- [ ] Regulatory disclosures published for each target market
- [ ] Legal pages approved; banned-phrase lint green; <legal entity name> and <registered address> correct everywhere
- [ ] Careers feed live, role pages tested, applications confirmed to reach the ATS
- [ ] Press kit assets reviewed; press email monitored
- [ ] Turnstile, rate limits and CORS tested with production config
- [ ] Security headers verified; `security.txt` live; SPF, DKIM and DMARC configured
- [ ] Lighthouse, axe and Web Vitals budgets met on the production URL
- [ ] `robots.txt`, sitemap, canonical URLs; `noindex` only on non-production
- [ ] PostHog loads only after consent; no tracking before it
- [ ] "Go to the app" and login links tested, including a verified domain that enforces Google or Workspace sign-in
- [ ] Uptime alerts live; rollback runbook written
- [ ] Root `README.md`, `website/README.md`, OpenAPI and `sonar-project.properties` updated
- [ ] Redirects tested
- [ ] Backup and restore plan for the `lead` table

---

## 13. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Regulatory or misleading-claims exposure | High | Claims policy (§9), legal review, banned-phrase lint, disclosures page |
| Unapproved company claims (funding, customers, awards, team) | High | Written approval for every company fact; no placeholder people or logos |
| Methodology numbers cannot be reproduced | High | Do not publish until reproduced; link the source |
| Overstated security claims (for example RLS) | High | Verified-claims-only rule, engineering sign-off, re-check before launch |
| Stale or incorrect job listings | Medium | Hourly rebuild, ATS as the single source, redirect for removed roles |
| Applicant data handled outside the ATS | Medium | The site stores none; applications go straight to the ATS |
| Data-vendor terms forbid naming them | Medium | Get written confirmation before the Partners page names any provider |
| Contact form abused (spam) | Medium | Turnstile, rate limits, honeypot, identical responses |
| Deep links bypass domain sign-in policy | Low | The site passes no parameters and creates no sessions; the app's sign-in gate handles everything |
| Website analytics mixed with product analytics | Medium | Separate PostHog project or `site` property; consent-gated loading |
| Leadership or press content published without consent | Medium | Consent log, approval step in the PR template |
| Scope creep back into product marketing, docs, investor reporting | Medium | Non-goals (§1) |

---

## 14. Open decisions

1. Company name, legal entity, registered address and domain (currently placeholders).
2. Primary market.
3. Which ATS to use, and how often to refresh the careers feed.
4. Whether to run a Git-based CMS for non-engineers, or edit MDX through PRs only.
5. Whether to publish an Investors page, and what it says.
6. Leadership and advisor line-up, and consent for each person.
7. Lead retention period and whether IPs are stored.
8. Browser error monitoring tool and PII-scrubbing rules.
9. Design owner for the SVG logo set, favicons and brand guidelines.
10. Final confirmation of Astro versus Next.js by the frontend lead.

---

## 15. Later additions (not in v1)

The site is one engineered property alongside the app. Add to it before adding a new site. A new site is justified only when a different audience needs a different experience, or a different team ships on a different schedule.

| Addition | Trigger | How |
| --- | --- | --- |
| Product pages (features, Teams) | Visitors need detail beyond the single `/platform` page | New routes under `/platform/*` in the same `website/` app |
| Pricing page | Pricing needs a public, searchable page | `/pricing`, fed from a read-only `GET /api/v1/public/plans` endpoint derived from the billing config and fetched at build time, with a CI check against the rendered page; never hard-code prices |
| Live demo | Data-provider licence confirms public display is allowed | A precomputed, cached `GET /api/v1/public/demo-forecast` endpoint behind a feature flag, with a static snapshot fallback; visitor requests never trigger inference |
| Plan deep links from the site | Marketing wants "start on this plan" buttons | The app reads `?plan=` and `?seats=` on signup, validated against enums; the site still creates no sessions |
| Changelog | Product updates become regular | `/changelog` from MDX, or link to one hosted with the product |
| Standalone trust centre | Enterprise customers send security questionnaires | Move `/trust` to a hosted trust-centre tool or its own subdomain |
| Separate product marketing site | Product marketing gets its own team, release rhythm or SEO and testing needs | A third property (like a dedicated product domain); migrate the `/platform/*` and `/pricing` routes to it and redirect |
| Docs site | The company offers an API or integrations | A separate docs property |

**Hosted tools, not built:** a status page and a help centre should be hosted tools on subdomains (for example `status.<domain>` and `help.<domain>`), configured rather than engineered. Link to them from the footer when they exist.

Every addition keeps the existing rules: Zod validation, OpenAPI updates, tests holding the 90% gate, consent-gated analytics, the claims policy in §9, and no database row-level-security claim until it is wired in.

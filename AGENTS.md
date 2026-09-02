# Repository Guidelines for AI Agents

## Core Principles & Engineering Standards
- **Strict Type Safety & Runtime Validation:** Avoid using `any`, implicit coercions, or unsafe casts. Enforce explicit TypeScript types across all layers and require Zod schemas for validating incoming API payloads, route parameters, and environment variables.
- **API Specification Consistency:** When creating, updating, or modifying API endpoints, continuously update the corresponding OpenAPI/Swagger documentation specs to prevent contract drift.
- **SonarQube Quality Standards:** Maintain Clean Code attributes (Intentional, Consistent, Adaptable, Responsible). Zero tolerance for security vulnerabilities, bugs, cognitive complexity smells, or duplicated code blocks.
- **Formatting & Style:** Enforce automated formatting (e.g., Prettier) on all modified files. Keep code styles, naming conventions, and file structures completely consistent across the repository.
- **Lean Codebase & Cleanup:** Continuously remove dead code, unused imports, redundant variables, and unreferenced assets. Keep pull requests minimal and focused.
- **Directory Consistency:** Respect and adhere to the established project folder hierarchy. Do not invent duplicate directories, arbitrary subfolders, or place files out of their domain context.

## Strict System & Security Rules
1. **Defensive Runtime Asset Checks:** Always verify the existence of dynamic or external assets (e.g., generated Swagger JSON files, static artifacts) using `fs.existsSync` before attempting to read, import, or parse them at runtime to prevent process boot crashes.
2. **Environment Feature Gating:** Guard developer-only endpoints (e.g., Swagger UI), internal utilities, and debug interfaces behind environment configuration flags or explicit non-production environment checks.
3. **Structured Logging & PII Redaction:** Use structured loggers (e.g., Pino) for all operational, error, and audit events. NEVER write or log raw credentials, authorization tokens, passwords, API keys, or personally identifiable information (PII) to system logs or external telemetry streams. Use automated redaction or explicit sanitization.
4. **Audit Data Retention vs. PII Purging:** When executing account or entity deletion routines, purge or anonymize personal identity data from primary databases while maintaining immutable, non-PII system audit logs (`user_id` references only) for operational integrity.
5. **Resource Safety & Non-Blocking Execution:** Avoid unhandled synchronous loops, memory-intensive background tasks, or blocking operations that could exhaust system CPU/RAM bounds.

## Automated Self-Review & Quality Checklist
Before marking any task or code generation as complete:
1. **Auto-Review Code:** Perform a thorough sanity review of all diffs to ensure no unintended breaking changes, schema discrepancies, or regression vulnerabilities were introduced.
2. **Test Suite Execution & Coverage:** Update existing unit/integration tests or write new tests for modified features. Ensure the test suite passes without regressions.
3. **Static Analysis & Type Verification:** Confirm that type checks (`tsc --noEmit`), linter runs (`npm run lint`), module boundary checks (`scripts/check-module-boundaries.cjs`), and Clean Code complexity rules pass with zero errors.
4. **Preserve Error & Log Standards:** Ensure newly introduced routes, functions, or modules maintain the repository's standard error handling, Zod validation errors, and sanitization layers.
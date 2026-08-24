# Modular monolith architecture

The application is deployed as one process, but its HTTP capabilities are composed from explicit business modules in `src/modules`.

## Boundaries

- `src/modules/<module>/index.ts` is a module's public API. The composition root imports modules only through these entry points.
- `src/modules/index.ts` is the module registry and the single place where business capabilities are assembled.
- `src/app.ts` configures the transport layer and can be instantiated without starting databases, queues, cron jobs, or network listeners.
- `src/index.ts` is the infrastructure composition root. It owns process lifecycle and starts/stops external adapters.
- `src/shared` contains the small shared kernel and technical adapters: errors, HTTP concerns, configuration, database, cache, logging, and realtime transport.

Each business capability owns its presentation, application, domain, and infrastructure code. Cross-module access must go through the target module's `index.ts` contract; `npm run architecture:check` enforces this and rejects the former horizontal layer folders.

## Dependency direction

`index.ts -> app.ts -> modules -> route/controller/application logic`

Infrastructure is wired at the process edge. Domain modules must not import `app.ts` or `index.ts`.

## Modules

`auth`, `access-control`, `forecast`, `market`, `search`, `decision-support`, `watchlist`, `notifications`, `news`, and `dashboard` are independently named boundaries inside the single deployable application.

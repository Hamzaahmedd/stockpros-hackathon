import type { AppModule } from './module-interface'
import { accessControlModule } from './access-control'
import { authModule } from './auth'
import { dashboardModule } from './dashboard'
import { decisionSupportModule } from './decision-support'
import { forecastModule } from './forecast'
import { marketModule } from './market'
import { newsModule } from './news'
import { notificationsModule } from './notifications'
import { searchModule } from './search'
import { watchlistModule } from './watchlist'

/** The only place where business modules are assembled into the application. */
export const modules: readonly AppModule[] = [
  authModule, forecastModule, marketModule, decisionSupportModule,
  accessControlModule, watchlistModule, notificationsModule, newsModule,
  dashboardModule, searchModule,
]

export type { AppModule } from './module-interface'

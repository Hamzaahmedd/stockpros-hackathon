import type { AppModule } from './module-interface'
import { accessControlModule } from './access-control'
import { adminModule } from './admin'
import { authModule } from './auth'
import { dashboardModule } from './dashboard'
import { decisionSupportModule } from './decision-support'
import { feedbackModule } from './feedback'
import { forecastModule } from './forecast'
import { marketModule } from './market'
import { newsModule } from './news'
import { notificationsModule } from './notifications'
import { paymentsModule } from './payments'
import { searchModule } from './search'
import { teamsModule } from './teams'
import { watchlistModule } from './watchlist'

/** The only place where business modules are assembled into the application. */
export const modules: readonly AppModule[] = [
  adminModule,
  authModule,
  forecastModule,
  marketModule,
  decisionSupportModule,
  accessControlModule,
  watchlistModule,
  notificationsModule,
  newsModule,
  dashboardModule,
  searchModule,
  feedbackModule,
  paymentsModule,
  teamsModule,
]

export type { AppModule } from './module-interface'

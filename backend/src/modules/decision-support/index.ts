import { defineModule } from '../module-interface'
import router from './routes'

export const decisionSupportModule = defineModule({ name: 'decision-support', route: '/api/v1/decision-support', router })
export { getLatestDecisionRun } from './repository'


import router from './routes'
import { defineModule } from '../module-interface'

export const forecastModule = defineModule({ name: 'forecast', route: '/api/v1/forecast', router })

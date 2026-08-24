import router from './routes'
import { defineModule } from '../module-interface'

export const searchModule = defineModule({ name: 'search', route: '/api/v1/search', router })

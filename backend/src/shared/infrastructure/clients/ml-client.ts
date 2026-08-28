import config from '@/config'
import axios from 'axios'

const ML_INTERNAL_URL = config.ml.internalUrl

if (!ML_INTERNAL_URL) {
  throw new Error('ML internal URL is not configured in env.')
}

const mlClient = axios.create({
  baseURL: ML_INTERNAL_URL,
  timeout: 30000, // ML training/inference can take longer
})

export default mlClient

import config from '@/config'
import axios from 'axios'

const TWELVE_DATA_API_KEY = config.twelveData.apiKey

if (!TWELVE_DATA_API_KEY) {
  throw new Error('Twelve Data API key is not configured in env.')
}

const twelveDataClient = axios.create({
  baseURL: 'https://api.twelvedata.com',
  params: {
    apikey: TWELVE_DATA_API_KEY,
  },
  timeout: 10000,
})

export default twelveDataClient

import axios from 'axios'
import config from '../config/env'

const apiKey = config.alphavantage.apiKey

if (!apiKey) {
  throw new Error('CRITICAL: Alphavantage API key is not configured in environment variables.')
}

const alphavantageClient = axios.create({
  baseURL: 'https://www.alphavantage.co/query',
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  },
  params: { apikey: apiKey },
})

export default alphavantageClient

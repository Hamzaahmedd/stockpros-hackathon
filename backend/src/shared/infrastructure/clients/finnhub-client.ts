import config from '../config/env';
import axios from 'axios';

const FINNHUB_API_KEY = config.finnhub.apiKey;

if (!FINNHUB_API_KEY) {
  throw new Error('Finnhub API key is not configured in env.');
}

const finnhubClient = axios.create({
  baseURL: 'https://finnhub.io/api/v1',
  params: {
    token: FINNHUB_API_KEY,
  },
  timeout: 10000, // 10 seconds
})

export default finnhubClient;
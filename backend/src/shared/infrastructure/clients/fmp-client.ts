import config from '../config/env';
import axios from 'axios';

const FMP_API_KEY = config.fmp.apiKey;

if (!FMP_API_KEY) {
  throw new Error('CRITICAL: FMP API key is not configured in environment variables.');
}

const fmpClient = axios.create({
  baseURL: 'https://financialmodelingprep.com/stable',
  params: {
    apikey: FMP_API_KEY,
  },
  timeout: 10000,
})

export default fmpClient;
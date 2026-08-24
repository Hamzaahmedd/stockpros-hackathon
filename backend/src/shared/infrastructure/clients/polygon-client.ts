import config from '../config/env'
import axios  from 'axios'

const polygonClient = axios.create({
  baseURL: 'https://api.polygon.io',
  params:  { apiKey: config.polygon.apiKey },
  timeout: 10000,
})

export default polygonClient
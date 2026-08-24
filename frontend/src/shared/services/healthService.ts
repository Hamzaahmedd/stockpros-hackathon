// services/healthService.ts
import axios from 'axios';
import { HEALTH_CHECK_URL } from '../config';

class HealthService {
  async checkHealth() {
    try {
      axios.get(HEALTH_CHECK_URL + '/health')
      .then(() => console.log("Health check successful"))
      .catch(() => console.log("Health check failed"));
    } catch (error) {
    }
  }
}

export default new HealthService();
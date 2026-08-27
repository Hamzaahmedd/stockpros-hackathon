import api from '@/shared/api/axios';
import { ForecastData, ForecastInsight, ForecastResponse } from './types';

class ForecastService {
  constructor() {
    // No need for baseURL since api already has it
  }

  async getForecast(symbol: string, period: string): Promise<ForecastData> {
    try {
      // CORRECTED: Await the axios call and use response.data
      const response = await api.get<ForecastResponse>(
        `/api/v1/forecast?symbol=${symbol}&period=${period}`
      );
      
      // Axios response structure: { data, status, headers, config }
      if (response.status !== 200) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = response.data;
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to get forecast data');
      }
      
      if (!data.data) {
        throw new Error('No forecast data received from server');
      }

      return this.enrichForecastData(data.data);
    } catch (error: any) {
      console.error('Forecast service error:', error);
      throw new Error(`Failed to fetch forecast: ${error.message}`);
    }
  }

  async getRawForecast(symbol: string, period: string): Promise<ForecastData> {
    // Fetches the backend /api/v1/forecast payload as-is,
    // without any client-side enrichment (used by the CSV download).
    const response = await api.get<ForecastResponse>(
      `/api/v1/forecast?symbol=${symbol}&period=${period}`
    );

    if (response.status !== 200 || !response.data.success || !response.data.data) {
      throw new Error(response.data.message || 'Failed to get forecast data');
    }

    return response.data.data;
  }

  private enrichForecastData(data: ForecastData): ForecastData {
    if (data.status === 'training') {
      return {
        ...data,
        predictedChange: 0,
        confidence: 0,
        insights: [{
          type: 'info',
          title: 'Model Training',
          description: data.message || 'The model is currently training. Please wait.',
          icon: '⏳'
        }]
      };
    }
    
    const predictions = data.predictions || [];
    
    // Calculate predicted change
    let predictedChange = 0;
    if (predictions.length >= 2) {
      const first = predictions[0].base;
      const last = predictions[predictions.length - 1].base;
      predictedChange = ((last - first) / first) * 100;
    }

    // Calculate confidence
    let confidence = this.calculateConfidence(predictions);
    
    // Generate insights
    const insights = this.generateInsights(predictions);

    return {
      ...data,
      predictedChange,
      confidence,
      insights
    };
  }

  private calculateConfidence(predictions: Array<{base: number}>): number {
    if (predictions.length < 2) return 0;
    
    const changes: number[] = [];
    for (let i = 1; i < predictions.length; i++) {
      const change = Math.abs(
        (predictions[i].base - predictions[i-1].base) / 
        predictions[i-1].base * 100
      );
      changes.push(change);
    }
    
    const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
    const volatilityPenalty = avgChange * 10;
    const lengthPenalty = (predictions.length - 1) * 2;
    
    return Math.max(0, 100 - volatilityPenalty - lengthPenalty);
  }

  private generateInsights(predictions: Array<{base: number}>): ForecastInsight[] {
    const insights: ForecastInsight[] = [];
    
    if (predictions.length < 2) return insights;

    const firstPred = predictions[0].base;
    const lastPred = predictions[predictions.length - 1].base;
    const overallChange = ((lastPred - firstPred) / firstPred) * 100;

    // Trend insight
    if (overallChange > 2) {
      insights.push({
        type: 'bullish',
        title: 'Bullish Trend Detected',
        description: `AI predicts upward movement of ${overallChange.toFixed(1)}%`,
        icon: '📈'
      });
    } else if (overallChange < -2) {
      insights.push({
        type: 'bearish',
        title: 'Bearish Trend Detected',
        description: `AI predicts downward movement of ${Math.abs(overallChange).toFixed(1)}%`,
        icon: '📉'
      });
    }

    // Volatility insight
    const changes = predictions.slice(1).map((p, i) => 
      Math.abs((p.base - predictions[i].base) / 
      predictions[i].base * 100)
    );
    const avgVolatility = changes.reduce((a, b) => a + b, 0) / changes.length;
    
    if (avgVolatility > 1.5) {
      insights.push({
        type: 'warning',
        title: 'High Volatility',
        description: `Avg daily volatility: ${avgVolatility.toFixed(1)}%`,
        icon: '⚡'
      });
    }

    return insights;
  }

  async getMultipleForecasts(
    symbols: string[], 
    period: string
  ): Promise<Map<string, ForecastData>> {
    const forecasts = new Map<string, ForecastData>();
    
    try {
      const promises = symbols.map(symbol => this.getForecast(symbol, period));
      const results = await Promise.allSettled(promises);
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          forecasts.set(symbols[index], result.value);
        }
      });
      
      return forecasts;
    } catch (error) {
      console.error('Error fetching multiple forecasts:', error);
      throw error;
    }
  }

  validateSymbol(symbol: string): boolean {
    // Basic symbol validation
    const regex = /^[A-Z]{1,5}$/;
    return regex.test(symbol);
  }

  validatePeriod(period: string): boolean {
    const validPeriods = ['1d', '1w'];
    return validPeriods.includes(period);
  }
}

// Export as singleton
export default new ForecastService();
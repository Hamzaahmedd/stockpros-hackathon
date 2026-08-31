// pages/Forecast.tsx
import { Sidebar } from '@/shared/components/Sidebar';
import { ReportDownloadButton } from '@/shared/components/ReportDownloadButton';
import { SmartSearch } from '@/shared/components/SmartSearch';
import healthService from '@/shared/services/healthService';
import {
  AlertCircle,
  BarChart3,
  Calendar,
  Menu
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import ForecastChart from '../components/ForecastChart';
import ForecastTable from '../components/ForecastTable';
import PriceTargetRange from '../components/PriceTargetRange';
import TrainingTimer from '../components/TrainingTimer';
import forecastService from '../services';
import { ForecastData, PeriodOption } from '../types';
import { downloadForecastCsv } from '../utils/downloadForecast';
import { downloadForecastPdf } from '../utils/downloadForecastPdf';

import { Button } from '@/shared/components/ui/button';
import { CardContent, CardHeader, CardTitle, Card as ShadcnCard } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';

function Card({ title, actions, children, className = "" }: Readonly<{ 
  title?: string; 
  actions?: React.ReactNode; 
  children: React.ReactNode;
  className?: string;
}>) {
  return (
    <ShadcnCard className={className}>
      {(title || actions) && (
        <CardHeader className="flex flex-row items-center justify-between pb-2 pt-5 px-5 space-y-0">
          {title && <CardTitle className="text-sm font-bold">{title}</CardTitle>}
          {actions && <div>{actions}</div>}
        </CardHeader>
      )}
      <CardContent className={(!title && !actions) ? "p-5" : "px-5 pb-5 pt-3"}>
        {children}
      </CardContent>
    </ShadcnCard>
  );
}

const Forecast: React.FC = () => {
  const [symbol, setSymbol] = useState<string>('AAPL');
  const [period, setPeriod] = useState<string>('1w');
  const [forecastData, setForecastData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  const periodOptions: PeriodOption[] = [
    { value: '1d', label: '1 Day', icon: <Calendar size={16} /> },
    { value: '1w', label: '1 Week', icon: <BarChart3 size={16} /> }
  ];

  useEffect(() => {
    healthService.checkHealth();
  }, []);

  const fetchForecast = async (isManualRefresh = false) => {
    if (!forecastService.validateSymbol(symbol)) {
      setError('Invalid stock symbol. Use 1-5 uppercase letters.');
      return;
    }
    
    if (!forecastService.validatePeriod(period)) {
      setError('Invalid period. Use: 1d or 1w');
      return;
    }
    
    setLoading(true);
    setError(null);
    if (!isManualRefresh) setForecastData(null); 
    
    try {
      const data = await forecastService.getForecast(symbol, period);
      setForecastData(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching forecast data');
      console.error('Error fetching forecast:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (symbol && period) {
      fetchForecast();
    }
  }, [symbol, period]);

  const handleTrainingComplete = () => {
    // Re-fetch forecast once timer hits zero
    fetchForecast(true);
  };

  const canDownload =
    !!forecastData &&
    !loading &&
    !exporting &&
    forecastData.status !== 'training' &&
    (forecastData.predictions?.length ?? 0) > 0;

  const handleDownload = async (format: 'csv' | 'pdf') => {
    if (!forecastData || !canDownload) return;
    setExporting(true);
    try {
      const raw = await forecastService.getRawForecast(symbol, period);

      if (format === 'csv') {
        downloadForecastCsv(raw);
        toast.success('Forecast downloaded as CSV');
      } else {
        downloadForecastPdf(raw);
        toast.success('Forecast downloaded as PDF');
      }
    } catch (err) {
      console.error('Error downloading forecast:', err);
      toast.error('Failed to download forecast');
    } finally {
      setExporting(false);
    }
  };

  const renderForecastContent = () => {
    if (loading) {
      return (
        <div className="space-y-6">
          {/* Forecast Chart Card Skeleton */}
          <div className="border border-border rounded-xl bg-card p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-44 rounded-md" />
              <div className="flex gap-2">
                <Skeleton className="h-8 w-12 rounded-md" />
                <Skeleton className="h-8 w-12 rounded-md" />
                <Skeleton className="h-8 w-12 rounded-md" />
              </div>
            </div>
            <div className="h-[350px] w-full rounded-lg bg-muted/20 border border-border/50 p-6 flex flex-col justify-between">
              <div className="flex justify-between items-center">
                <Skeleton className="h-4 w-32 rounded" />
                <div className="flex gap-4">
                  <Skeleton className="h-3 w-16 rounded" />
                  <Skeleton className="h-3 w-16 rounded" />
                </div>
              </div>
              <div className="space-y-3">
                <Skeleton className="h-[180px] w-full rounded" />
              </div>
              <div className="flex justify-between items-center pt-4 border-t border-border/40">
                <Skeleton className="h-3 w-20 rounded" />
                <Skeleton className="h-3 w-20 rounded" />
                <Skeleton className="h-3 w-20 rounded" />
                <Skeleton className="h-3 w-20 rounded" />
              </div>
            </div>
          </div>

          {/* Price Target Range Card Skeleton */}
          <div className="border border-border rounded-xl bg-card p-6 space-y-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Skeleton className="h-6 w-48 rounded-md" />
                <Skeleton className="h-3 w-72 rounded" />
              </div>
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-muted/20 border border-border/50 space-y-2">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-7 w-32 rounded" />
                <Skeleton className="h-3 w-40 rounded" />
              </div>
              <div className="p-4 rounded-lg bg-muted/20 border border-border/50 space-y-2">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-7 w-32 rounded" />
                <Skeleton className="h-3 w-40 rounded" />
              </div>
              <div className="p-4 rounded-lg bg-muted/20 border border-border/50 space-y-2">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-7 w-32 rounded" />
                <Skeleton className="h-3 w-40 rounded" />
              </div>
            </div>
          </div>

          {/* Forecast Table Card Skeleton */}
          <div className="border border-border rounded-xl bg-card p-6 space-y-4 shadow-sm">
            <Skeleton className="h-6 w-40 rounded-md" />
            <div className="space-y-3 pt-2">
              <div className="flex justify-between border-b border-border pb-2">
                <Skeleton className="h-4 w-20 rounded" />
                <Skeleton className="h-4 w-20 rounded" />
                <Skeleton className="h-4 w-20 rounded" />
                <Skeleton className="h-4 w-20 rounded" />
              </div>
              {['row-1', 'row-2', 'row-3', 'row-4', 'row-5'].map((rowKey) => (
                <div key={rowKey} className="flex justify-between py-2 border-b border-border/40">
                  <Skeleton className="h-4 w-16 rounded" />
                  <Skeleton className="h-4 w-14 rounded" />
                  <Skeleton className="h-4 w-14 rounded" />
                  <Skeleton className="h-4 w-14 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (!forecastData) {
      return null;
    }

    if (forecastData.status === 'training' && forecastData.estimated_ready_at) {
      return (
        <div className="py-12 fade-in">
          <TrainingTimer 
            estimatedReadyAt={forecastData.estimated_ready_at} 
            onComplete={handleTrainingComplete} 
            symbol={symbol}
          />
        </div>
      );
    }

    return (
      <div className="space-y-6 fade-in">
        {/* Chart Section */}
        <Card title="Price Forecast Chart">
          <div className="mt-6">
            <ForecastChart data={forecastData} period={period} />
          </div>
        </Card>

        {/* Price Target Range */}
        {forecastData.targetRange && (
          <PriceTargetRange
            targetRange={forecastData.targetRange}
            symbol={symbol}
            period={period}
          />
        )}

        {/* Forecast Table */}
        <Card title="Detailed Forecast">
          <div className="mt-6">
            <ForecastTable data={forecastData} />
          </div>
        </Card>
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col lg:flex-row bg-background text-foreground overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          className="fixed inset-0 bg-black/50 z-40 lg:hidden w-full h-full border-none cursor-pointer p-0"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar />

      {/* MAIN CONTENT */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto overflow-x-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-muted-foreground"
            >
              <Menu size={20} />
            </Button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                AI Price Forecast
              </h1>
              <p className="text-muted-foreground mt-1 text-sm">Analyze historical patterns and model predictions.</p>
            </div>
          </div>

          <ReportDownloadButton
            onDownload={handleDownload}
            loading={exporting}
            disabled={!canDownload}
            title="Download the current forecast report"
          />
        </div>

        <div className="space-y-6">
          <ShadcnCard className="p-4">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              {/* Search */}
              <div className="flex-1">
                <SmartSearch 
                  onSubmit={(sym) => {
                    setSymbol(sym);
                  }}
                  initialValue={symbol}
                  placeholder="Search stock symbol (e.g., AAPL, MSFT)"
                />
              </div>

              {/* Period Selector */}
              <div className="flex items-center gap-2 flex-wrap">
                {periodOptions.map((option: PeriodOption) => (
                  <Button
                    key={option.value}
                    variant={period === option.value ? "default" : "outline"}
                    onClick={() => setPeriod(option.value)}
                    className="flex items-center gap-2"
                  >
                    {option.icon}
                    <span>{option.label}</span>
                  </Button>
                ))}
              </div>
            </div>
            
            {/* Error Display */}
            {error && (
              <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <div className="flex items-center text-destructive">
                  <AlertCircle size={16} className="mr-2" />
                  <span className="text-sm">{error}</span>
                </div>
              </div>
            )}
          </ShadcnCard>

          {renderForecastContent()}

          {/* Disclaimer */}
          <div className="p-4 border rounded-lg text-xs bg-muted/30 border-border text-muted-foreground">
            <p className="font-bold mb-1 text-foreground">Important Notice:</p>
            <p>
              Predictions are generated by AI models based on historical price patterns and technical indicators. 
              These forecasts are for informational purposes only and should not be considered as financial advice. 
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Forecast;
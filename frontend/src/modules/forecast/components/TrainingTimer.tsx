import React, { useState, useEffect } from 'react';
import { useTheme } from '@/shared/hooks/useTheme';
import { Clock, Loader2 } from 'lucide-react';
import { Skeleton } from '@/shared/components/ui/skeleton';

interface TrainingTimerProps {
  estimatedReadyAt: number;
  onComplete: () => void;
  symbol: string;
}

const TrainingTimer: React.FC<TrainingTimerProps> = ({ estimatedReadyAt, onComplete, symbol }) => {
  const { theme } = useTheme();
  const [secondsLeft, setSecondsLeft] = useState<number>(() => {
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, estimatedReadyAt - now);
  });

  useEffect(() => {
    if (secondsLeft <= 0) {
      onComplete();
      return;
    }

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(interval);
          onComplete();
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [secondsLeft, onComplete]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = Math.min(100, Math.max(0, ((180 - secondsLeft) / 180) * 100));

  return (
    <div className={`p-8 rounded-2xl border text-center transition-all ${
      theme === 'dark' 
        ? 'bg-[#0f1115] border-white/10 shadow-2xl shadow-cyan-500/10' 
        : 'bg-white border-gray-200 shadow-lg'
    }`}>
      <div className="flex justify-center mb-6">
        <div className="relative">
          <div className="absolute inset-0 animate-ping rounded-full bg-cyan-500/20"></div>
          <div className="relative bg-gradient-to-br from-cyan-500 to-blue-600 p-4 rounded-2xl shadow-lg">
            <Skeleton className="w-8 h-8 rounded-full" />
          </div>
        </div>
      </div>

      <h3 className={`text-xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
        Training AI Model for {symbol}
      </h3>
      <p className={`text-sm mb-6 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
        Analyzing historical patterns and technical indicators to generate your forecast.
      </p>

      <div className="max-w-xs mx-auto mb-6">
        <div className="flex justify-between items-end mb-2">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</span>
          <span className="text-sm font-bold text-cyan-500">{Math.round(progress)}%</span>
        </div>
        <div className="w-full h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-1000 ease-linear"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>

      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold ${
        theme === 'dark' ? 'bg-white/5 text-cyan-400 border border-white/10' : 'bg-cyan-50 text-cyan-700 border border-cyan-100'
      }`}>
        <Clock className="w-4 h-4" />
        <span>Estimated Completion: {formatTime(secondsLeft)}</span>
      </div>

      <p className="mt-8 text-xs text-gray-500 italic">
        "Good things come to those who wait for accurate data."
      </p>

      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default TrainingTimer;

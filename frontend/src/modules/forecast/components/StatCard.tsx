// components/StatCard.tsx
import React from 'react';
import { StatCardProps } from '../types';

const StatCard: React.FC<StatCardProps> = ({ 
  title, 
  value, 
  change, 
  changeType, 
  icon 
}) => {
  const getChangeColor = (): string => {
    switch (changeType) {
      case 'positive':
        return 'text-green-600 dark:text-cyan-400';
      case 'negative':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getIconBgColor = (): string => {
    switch (changeType) {
      case 'positive':
        return 'bg-green-100 dark:bg-green-900';
      case 'negative':
        return 'bg-red-100 dark:bg-red-900';
      default:
        return 'bg-gray-100 dark:bg-gray-700';
    }
  };

  const getIconColor = (): string => {
    switch (changeType) {
      case 'positive':
        return 'text-green-600 dark:text-cyan-400';
      case 'negative':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 transition-all hover:shadow-md">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
            {typeof value === 'number' ? `$${value.toFixed(2)}` : value}
          </p>
        </div>
        <div className={`p-3 rounded-full ${getIconBgColor()}`}>
          <div className={getIconColor()}>
            {React.cloneElement(icon as React.ReactElement, { size: 20 })}
          </div>
        </div>
      </div>
      {change && (
        <div className={`mt-4 flex items-center text-sm ${getChangeColor()}`}>
          <span className="font-medium">{change}</span>
          <span className="ml-2 text-gray-500 dark:text-gray-400">
            from previous
          </span>
        </div>
      )}
    </div>
  );
};

export default StatCard;
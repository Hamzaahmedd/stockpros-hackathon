import React from "react";

export const CircularProgress: React.FC<{ value: number; size?: number; strokeWidth?: number; color?: string; band?: string }> = ({ 
  value, 
  size = 120, 
  strokeWidth = 10, 
  color = "#22c55e",
  band = "Fair"
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" className="text-muted/50" />
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={strokeWidth} fill="transparent" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold">{value}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{band}</span>
      </div>
    </div>
  );
};

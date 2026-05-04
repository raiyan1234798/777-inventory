import React from 'react';

/**
 * A simple Sparkline component using SVG to visualize trends
 */
export const Sparkline = ({ data, color = '#3b82f6', height = 40, width = 120 }: { data: number[], color?: string, height?: number, width?: number }) => {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 2;
  
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - padding * 2) - padding;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        className="drop-shadow-sm"
      />
    </svg>
  );
};

/**
 * A custom Donut Chart component using SVG and stroke-dasharray
 */
export const DonutChart = ({ items, size = 160 }: { items: { label: string, value: number, color: string }[], size?: number }) => {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const radius = size * 0.35;
  const circumference = 2 * Math.PI * radius;
  let currentOffset = 0;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {items.map((item, i) => {
          const percentage = (item.value / total) * 100;
          const strokeDashactive = (percentage / 100) * circumference;
          const strokeDashoffset = currentOffset;
          currentOffset -= strokeDashactive;

          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="transparent"
              stroke={item.color}
              strokeWidth={size * 0.12}
              strokeDasharray={`${strokeDashactive} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-1000 ease-out hover:opacity-80 cursor-pointer"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total</span>
        <span className="text-xl font-black text-gray-900 leading-none">{total.toLocaleString()}</span>
      </div>
    </div>
  );
};

/**
 * A Gauge component for performance metrics
 */
export const Gauge = ({ value, label, min = 0, max = 100, color = '#10b981' }: { value: number, label: string, min?: number, max?: number, color?: string }) => {
  const percentage = Math.min(Math.max(((value - min) / (max - min)) * 100, 0), 100);
  const radius = 40;
  const circumference = Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-12 overflow-hidden">
        <svg width="96" height="48" className="absolute top-0 left-0">
          <path
            d="M 8 48 A 40 40 0 0 1 88 48"
            fill="none"
            stroke="#f3f4f6"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M 8 48 A 40 40 0 0 1 88 48"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute bottom-0 inset-x-0 text-center">
          <span className="text-lg font-black text-gray-900 leading-none">{value}%</span>
        </div>
      </div>
      <span className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-wider">{label}</span>
    </div>
  );
};

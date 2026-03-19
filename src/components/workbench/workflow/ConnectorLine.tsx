import React from 'react';

interface ConnectorLineProps {
  fromStatus: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  toStatus: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  height?: number;
  isError?: boolean;
  isOptional?: boolean;
}

export const ConnectorLine: React.FC<ConnectorLineProps> = ({
  fromStatus,
  toStatus,
  height = 40,
  isError = false,
  isOptional = false,
}) => {
  // 确定颜色和样式
  const getColor = () => {
    if (isError) return '#ef4444'; // 红色
    if (isOptional) return '#999999'; // 灰色
    if (fromStatus === 'failed') return '#ef4444';
    if (fromStatus === 'completed' || fromStatus === 'running') {
      return '#f97316'; // 橙色
    }
    return '#666666'; // 默认灰色
  };

  const getStrokeDasharray = () => {
    if (isError || isOptional) return '5, 5'; // 虚线
    return undefined; // 实线
  };

  const color = getColor();
  const strokeDasharray = getStrokeDasharray();

  const arrowSize = 12;
  const arrowStart = height - arrowSize;

  return (
    <div
      className="w-full flex justify-center my-1"
      style={{
        height: `${height + arrowSize}px`,
      }}
    >
      <svg
        width="100"
        height={height + arrowSize}
        style={{
          opacity: isOptional ? 0.6 : 1,
        }}
      >
        {/* 主线 */}
        <defs>
          {!isOptional && !isError && (
            <linearGradient id={`gradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="1" />
              <stop offset="100%" stopColor={color} stopOpacity="0.8" />
            </linearGradient>
          )}

          {/* 脉动动画（错误状态） */}
          {isError && (
            <style>{`
              @keyframes pulse-error {
                0%, 100% { opacity: 0.3; }
                50% { opacity: 1; }
              }
              .connector-error {
                animation: pulse-error 2s infinite;
              }
            `}</style>
          )}
        </defs>

        {/* 线条 */}
        <line
          x1="50"
          y1="0"
          x2="50"
          y2={arrowStart}
          stroke={color}
          strokeWidth="3"
          strokeDasharray={strokeDasharray}
          className={isError ? 'connector-error' : ''}
          fill="none"
          style={{
            stroke: !isOptional && !isError ? `url(#gradient-${color})` : color,
          }}
        />

        {/* 箭头 */}
        <polygon
          points={`50,${height} ${50 - arrowSize / 2},${arrowStart} ${50 + arrowSize / 2},${arrowStart}`}
          fill={color}
          className={isError ? 'connector-error' : ''}
          style={{
            opacity: isError ? 1 : 0.9,
          }}
        />
      </svg>
    </div>
  );
};

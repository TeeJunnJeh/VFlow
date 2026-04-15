import React, { useState, useRef, useEffect } from 'react';

interface ResizableSplitterProps {
  position: number;
  minSize?: number;
  onResize: (position: number) => void;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  hitAreaSize?: number;
  lineThickness?: number;
}

const ResizableSplitter: React.FC<ResizableSplitterProps> = ({
  position,
  minSize = 100,
  onResize,
  orientation = 'vertical',
  className = '',
  hitAreaSize = 12,
  lineThickness = 3,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [startPosition, setStartPosition] = useState(0);
  const [startSize, setStartSize] = useState(0);
  const splitterRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setStartPosition(orientation === 'vertical' ? e.clientX : e.clientY);
    setStartSize(position);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const currentPosition = orientation === 'vertical' ? e.clientX : e.clientY;
      const delta = currentPosition - startPosition;
      let newSize = startSize + delta;

      // 确保最小尺寸
      newSize = Math.max(minSize, newSize);
      
      // 限制最大尺寸（避免超出屏幕）
      const maxSize = orientation === 'vertical' 
        ? window.innerWidth * 0.8 
        : window.innerHeight * 0.8;
      newSize = Math.min(maxSize, newSize);

      onResize(newSize);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = orientation === 'vertical' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
      document.body.style.touchAction = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (isDragging) {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.body.style.touchAction = '';
      }
    };
  }, [isDragging, startPosition, startSize, onResize, orientation, minSize]);

  const isVertical = orientation === 'vertical';
  const safeHitAreaSize = Math.max(6, Math.floor(hitAreaSize));
  const safeLineThickness = Math.max(1, Math.min(safeHitAreaSize, Math.floor(lineThickness)));
  const hitAreaHalf = safeHitAreaSize / 2;

  return (
    <div
      ref={splitterRef}
      className={`relative ${isVertical ? 'cursor-col-resize' : 'cursor-row-resize'} ${className}`}
      onMouseDown={handleMouseDown}
      style={{
        [isVertical ? 'width' : 'height']: `${safeHitAreaSize}px`,
        [isVertical ? 'marginLeft' : 'marginTop']: `${-hitAreaHalf}px`,
        [isVertical ? 'marginRight' : 'marginBottom']: `${-hitAreaHalf}px`,
        zIndex: 50,
      }}
    >
      <div
        className={`absolute inset-0 transition-all duration-150 ${
          isDragging
            ? 'bg-orange-500'
            : 'bg-white/20 hover:bg-orange-400'
        }`}
        style={{
          [isVertical ? 'width' : 'height']: `${safeLineThickness}px`,
          [isVertical ? 'left' : 'top']: '50%',
          [isVertical ? 'transform' : '']: isVertical ? 'translateX(-50%)' : 'translateY(-50%)',
          borderRadius: '2px',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          [isVertical ? 'width' : 'height']: '24px',
          [isVertical ? 'left' : 'top']: '50%',
          [isVertical ? 'transform' : '']: isVertical ? 'translateX(-50%)' : 'translateY(-50%)',
        }}
      />
    </div>
  );
};

export default ResizableSplitter;
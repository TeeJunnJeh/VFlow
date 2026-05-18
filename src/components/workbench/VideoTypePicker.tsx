import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  VIDEO_FAMILIES,
  getFamilyDefaultTypeId,
  getVideoTypeDef,
  type VideoTypeI18n,
} from './videoTypes';

type VideoTypePickerProps = {
  /** 当前选中的 VideoTypeId（slug），未选为空串。 */
  value: string;
  onChange: (id: string) => void;
  /** 直接传 translations[lang]，结构兼容 VideoTypeI18n。 */
  t: VideoTypeI18n;
  placeholder?: string;
  buttonClassName?: string;
  labelClassName?: string;
  iconClassName?: string;
};

/**
 * 视频类型二级 flyout 选择器：
 * 点开 -> 5 大家族；hover 家族 -> 右侧弹出子类；
 * 点子类 = 选该子类；只点家族 = 选该家族默认子类（第一个）。
 */
export const VideoTypePicker: React.FC<VideoTypePickerProps> = ({
  value,
  onChange,
  t,
  placeholder = 'Select…',
  buttonClassName = '',
  labelClassName = '',
  iconClassName = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredFamily, setHoveredFamily] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const selectedDef = getVideoTypeDef(value);

  const close = () => {
    setIsOpen(false);
    setHoveredFamily(null);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const updatePosition = () => {
      const el = buttonRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setMenuStyle({
        position: 'fixed',
        left: rect.left,
        top: rect.bottom + 8,
        minWidth: rect.width,
        zIndex: 1000,
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  const pickType = (id: string) => {
    onChange(id);
    close();
  };

  const menu = (
    <div
      ref={menuRef}
      className="rounded-lg border border-white/10 bg-zinc-950/95 backdrop-blur-sm shadow-xl py-1"
      style={menuStyle}
      role="menu"
      onMouseLeave={() => setHoveredFamily(null)}
    >
      {VIDEO_FAMILIES.map((family) => {
        const isHovered = hoveredFamily === family.id;
        return (
          <div key={family.id} className="relative" onMouseEnter={() => setHoveredFamily(family.id)}>
            <button
              type="button"
              role="menuitem"
              className={`w-full flex items-center justify-between gap-6 px-3 py-2 text-xs text-left transition hover:bg-white/5 ${
                isHovered ? 'bg-white/5 text-white' : 'text-zinc-200'
              }`}
              onClick={() => pickType(getFamilyDefaultTypeId(family))}
            >
              <span>{t[family.labelKey]}</span>
              <ChevronRight className="w-3 h-3 text-zinc-500 shrink-0" />
            </button>

            {isHovered && (
              <div className="absolute left-full top-0 min-w-[160px] rounded-lg border border-white/10 bg-zinc-950/95 backdrop-blur-sm shadow-xl py-1 z-[1001]">
                {family.types.map((typeDef, idx) => {
                  const showDefault = family.types.length >= 2 && idx === 0;
                  const isSelected = typeDef.id === value;
                  return (
                    <button
                      type="button"
                      key={typeDef.id}
                      role="menuitem"
                      title={typeDef.tooltipKey ? t[typeDef.tooltipKey] : undefined}
                      className={`w-full text-left px-3 py-2 text-xs whitespace-nowrap transition hover:bg-white/5 ${
                        isSelected ? 'text-white' : 'text-zinc-200'
                      }`}
                      onClick={() => pickType(typeDef.id)}
                    >
                      {t[typeDef.labelKey]}
                      {showDefault && (
                        <span className="text-zinc-500">{t.wb_video_type_default_suffix}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={`relative w-full focus:outline-none transition ${buttonClassName}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <span className={`block w-full pr-7 truncate text-left ${labelClassName}`}>
          {selectedDef ? t[selectedDef.labelKey] : placeholder}
        </span>
        <ChevronDown
          className={`absolute right-3 top-1/2 -translate-y-1/2 transition ${
            isOpen ? 'rotate-180' : ''
          } ${iconClassName}`}
        />
      </button>

      {isOpen && createPortal(menu, document.body)}
    </div>
  );
};

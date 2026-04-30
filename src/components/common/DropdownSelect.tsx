import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export type DropdownSelectOption = {
  value: string;
  label: React.ReactNode;
};

type DropdownSelectRenderOptionArgs = {
  option: DropdownSelectOption;
  isSelected: boolean;
  onSelect: () => void;
  closeMenu: () => void;
};

type DropdownSelectProps = {
  value: string;
  options: DropdownSelectOption[];
  onChange: (value: string) => void;
  onOpen?: () => void;
  placeholder?: React.ReactNode;
  disabled?: boolean;
  buttonClassName?: string;
  labelClassName?: string;
  iconClassName?: string;
  menuClassName?: string;
  optionClassName?: string;
  renderOption?: (args: DropdownSelectRenderOptionArgs) => React.ReactNode;
  renderInPortal?: boolean;
};

export const DropdownSelect: React.FC<DropdownSelectProps> = ({
  value,
  options,
  onChange,
  onOpen,
  placeholder = 'Select…',
  disabled = false,
  buttonClassName = '',
  labelClassName = '',
  iconClassName = '',
  menuClassName = '',
  optionClassName = '',
  renderOption,
  renderInPortal = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const portalMenuRef = useRef<HTMLDivElement>(null);
  const [portalStyle, setPortalStyle] = useState<React.CSSProperties>({});

  const selected = options.find((o) => o.value === value);
  const closeMenu = () => setIsOpen(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const inDropdown = !!dropdownRef.current?.contains(target);
      const inPortalMenu = !!portalMenuRef.current?.contains(target);
      if (!inDropdown && !inPortalMenu) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useLayoutEffect(() => {
    if (!isOpen || !renderInPortal) return;
    const updatePosition = () => {
      const el = buttonRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPortalStyle({
        position: 'fixed',
        left: rect.left,
        top: rect.bottom + 8,
        width: rect.width,
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
  }, [isOpen, renderInPortal]);

  const menuNode = (
    <div
      ref={renderInPortal ? portalMenuRef : undefined}
      className={`${renderInPortal ? '' : 'mt-2'} w-full max-h-64 overflow-auto custom-scroll rounded-lg border border-white/10 bg-zinc-950/90 backdrop-blur-sm shadow-xl z-[120] ${menuClassName}`}
      role="listbox"
      style={renderInPortal ? portalStyle : undefined}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        const handleSelect = () => {
          onChange(opt.value);
          closeMenu();
        };

        if (renderOption) {
          return (
            <div key={opt.value} role="option" aria-selected={isSelected}>
              {renderOption({
                option: opt,
                isSelected,
                onSelect: handleSelect,
                closeMenu,
              })}
            </div>
          );
        }

        return (
          <button
            type="button"
            key={opt.value}
            role="option"
            aria-selected={isSelected}
            className={`w-full text-left px-3 py-2 hover:bg-white/5 ${
              isSelected ? 'text-white' : 'text-zinc-200'
            } ${optionClassName}`}
            onClick={handleSelect}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => { const next = !isOpen; setIsOpen(next); if (next && onOpen) onOpen(); }}
        className={`relative w-full focus:outline-none transition ${
          disabled ? 'opacity-60 cursor-not-allowed' : ''
        } ${buttonClassName}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={`block w-full pr-7 truncate text-left ${labelClassName}`}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={`absolute right-3 top-1/2 -translate-y-1/2 transition ${isOpen ? 'rotate-180' : ''} ${iconClassName}`}
        />
      </button>

      {isOpen && !disabled && (
        renderInPortal
          ? createPortal(menuNode, document.body)
          : <div className="absolute z-[120] w-full">{menuNode}</div>
      )}
    </div>
  );
};

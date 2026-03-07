import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export type DropdownSelectOption = {
  value: string;
  label: React.ReactNode;
};

type DropdownSelectProps = {
  value: string;
  options: DropdownSelectOption[];
  onChange: (value: string) => void;
  placeholder?: React.ReactNode;
  disabled?: boolean;
  buttonClassName?: string;
  labelClassName?: string;
  iconClassName?: string;
  menuClassName?: string;
  optionClassName?: string;
};

export const DropdownSelect: React.FC<DropdownSelectProps> = ({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  buttonClassName = '',
  labelClassName = '',
  iconClassName = '',
  menuClassName = '',
  optionClassName = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((v) => !v)}
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
        <div
          className={`absolute mt-2 w-full max-h-64 overflow-auto custom-scroll rounded-lg border border-white/10 bg-zinc-950/90 backdrop-blur-sm shadow-xl z-[120] ${menuClassName}`}
          role="listbox"
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                type="button"
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                className={`w-full text-left px-3 py-2 hover:bg-white/5 ${
                  isSelected ? 'text-white' : 'text-zinc-200'
                } ${optionClassName}`}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

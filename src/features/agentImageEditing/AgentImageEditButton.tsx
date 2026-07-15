import React from 'react';
import { Paintbrush } from 'lucide-react';

interface AgentImageEditButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  label: string;
  iconClassName?: string;
}

export const AgentImageEditButton: React.FC<AgentImageEditButtonProps> = ({
  label,
  iconClassName = 'h-4 w-4',
  ...buttonProps
}) => (
  <button type="button" title={label} aria-label={label} {...buttonProps}>
    <Paintbrush className={iconClassName} />
  </button>
);

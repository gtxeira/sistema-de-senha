import React, { useState, forwardRef } from 'react';
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from '@/components/ui/input-group';
import { Eye, EyeOff } from 'lucide-react';

export interface PasswordInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  /** Rótulo customizado para acessibilidade quando a senha está visível */
  hidePasswordLabel?: string;
  /** Rótulo customizado para acessibilidade quando a senha está oculta */
  showPasswordLabel?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  (
    {
      className,
      disabled,
      hidePasswordLabel = 'Ocultar senha',
      showPasswordLabel = 'Mostrar senha',
      autoComplete = 'current-password',
      placeholder = '••••••••',
      ...props
    },
    ref,
  ) => {
    const [isVisible, setIsVisible] = useState(false);

    const toggleVisibility = () => {
      setIsVisible((prev) => !prev);
    };

    const actionLabel = isVisible ? hidePasswordLabel : showPasswordLabel;

    return (
      <InputGroup className={className}>
        <InputGroupInput
          ref={ref}
          type={isVisible ? 'text' : 'password'}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete={autoComplete}
          {...props}
        />

        <InputGroupAddon align="inline-end">
          <InputGroupButton
            type="button"
            aria-label={actionLabel}
            title={actionLabel}
            size="icon-xs"
            disabled={disabled}
            onClick={toggleVisibility}
          >
            {isVisible ? <EyeOff /> : <Eye />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    );
  },
);

PasswordInput.displayName = 'PasswordInput';

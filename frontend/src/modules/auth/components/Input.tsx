// components/Input.tsx
import React from 'react'
import { RegisterOptions, UseFormRegisterReturn } from 'react-hook-form'
import { Input as ShadcnInput } from '@/shared/components/ui/input'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  registration?: Partial<UseFormRegisterReturn>
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  registration,
  className = '',
  ...inputProps
}) => {
  return (
    <div className='w-full space-y-1'>
      {label && (
        <label
          htmlFor={inputProps.id}
          className='block text-sm font-medium text-foreground'
        >
          {label}
        </label>
      )}
      <ShadcnInput
        {...registration}
        {...inputProps}
        className={`w-full ${error ? 'border-destructive focus-visible:ring-destructive' : ''} ${className}`}
      />
      {error && (
        <p className='mt-1 text-sm font-medium text-destructive'>{error}</p>
      )}
    </div>
  )
}

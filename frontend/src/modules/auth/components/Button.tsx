// src/components/Button.tsx
import React from 'react'

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement>
> = ({ children, className, ...props }) => (
  <button
    {...props}
    className={`bg-brand-600 hover:bg-brand-500 rounded-md px-4 py-2 text-white disabled:opacity-60 ${className || ''}`}
  >
    {children}
  </button>
)

// src/components/Button.tsx
import React from "react";

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, className, ...props }) => (
  <button {...props} className={`px-4 py-2 bg-brand-600 text-white rounded-md hover:bg-brand-500 disabled:opacity-60 ${className || ""}`}>
    {children}
  </button>
);

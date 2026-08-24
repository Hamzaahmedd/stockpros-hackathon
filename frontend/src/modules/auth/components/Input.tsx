// components/Input.tsx
import React from "react";
import { RegisterOptions, UseFormRegisterReturn } from "react-hook-form";
import { Input as ShadcnInput } from "@/shared/components/ui/input";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  registration?: Partial<UseFormRegisterReturn>;
}

export const Input: React.FC<InputProps> = ({ 
  label, 
  error, 
  registration, 
  className = "", 
  ...inputProps 
}) => {
  return (
    <div className="space-y-1 w-full">
      {label && (
        <label className="block text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <ShadcnInput
        {...registration}
        {...inputProps}
        className={`w-full ${error ? "border-destructive focus-visible:ring-destructive" : ""} ${className}`}
      />
      {error && (
        <p className="text-sm text-destructive mt-1 font-medium">{error}</p>
      )}
    </div>
  );
};
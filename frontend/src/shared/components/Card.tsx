// src/components/Card.tsx
import React from "react";
import { Card as ShadcnCard, CardHeader, CardTitle, CardContent } from "./ui/card";

export const Card: React.FC<{ title?: string; className?: string; children?: React.ReactNode; }> = ({ title, className= "", children }) => (
  <ShadcnCard className={`rounded-xl shadow-card transition-all duration-300 ${className}`}>
    {title && (
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-brand-700">{title}</CardTitle>
      </CardHeader>
    )}
    <CardContent className={!title ? "pt-5" : ""}>
      {children}
    </CardContent>
  </ShadcnCard>
);
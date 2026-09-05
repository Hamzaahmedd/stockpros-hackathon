import { CardContent, CardHeader, CardTitle, Card as ShadcnCard } from "@/shared/components/ui/card";
import React from "react";

export interface CustomCardProps {
  readonly title?: string;
  readonly actions?: React.ReactNode;
  readonly children: React.ReactNode;
  readonly className?: string;
}

export function CustomCard({ title, actions, children, className = "" }: CustomCardProps) {
  return (
    <ShadcnCard className={className}>
      {(title || actions) && (
        <CardHeader className="flex flex-row items-center justify-between pb-2 pt-5 px-5 space-y-0">
          {title && <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</CardTitle>}
          {actions && <div>{actions}</div>}
        </CardHeader>
      )}
      <CardContent className={(!title && !actions) ? "p-5" : "px-5 pb-5 pt-3"}>
        {children}
      </CardContent>
    </ShadcnCard>
  );
}

import { cn } from "@/shared/utils/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted/80 dark:bg-muted/50",
        "after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer",
        "after:bg-gradient-to-r after:from-transparent after:via-black/5 dark:after:via-white/10 after:to-transparent",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }

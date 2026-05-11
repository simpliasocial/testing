import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: "default" | "primary" | "accent" | "success" | "warning" | "destructive";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const variantStyles = {
  default: "bg-card border-border",
  primary: "bg-primary text-primary-foreground border-primary",
  accent: "bg-accent text-accent-foreground border-accent",
  success: "bg-success/10 border-success/20 text-foreground",
  warning: "bg-warning/10 border-warning/20 text-foreground",
  destructive: "bg-destructive/10 border-destructive/20 text-foreground",
};

const iconVariantStyles = {
  default: "bg-secondary text-primary",
  primary: "bg-primary-foreground/20 text-primary-foreground",
  accent: "bg-accent-foreground/20 text-accent-foreground",
  success: "bg-success/20 text-success",
  warning: "bg-warning/20 text-warning",
  destructive: "bg-destructive/20 text-destructive",
};

const sizeStyles = {
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

export function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = "default",
  size = "md",
  className,
}: KPICardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border shadow-card transition-all duration-300 hover:shadow-card-hover",
        variantStyles[variant],
        sizeStyles[size],
        "animate-fade-in",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className={cn(
            "text-sm font-medium",
            variant === "default" ? "text-muted-foreground" : "opacity-80"
          )}>
            {title}
          </p>
          <p className={cn(
            "font-display font-bold tracking-tight animate-number-count",
            size === "lg" ? "text-3xl" : size === "md" ? "text-2xl" : "text-xl"
          )}>
            {value}
          </p>
          {subtitle && (
            <p className={cn(
              "text-xs",
              variant === "default" ? "text-muted-foreground" : "opacity-70"
            )}>
              {subtitle}
            </p>
          )}
        </div>
        {Icon && (
          <div className={cn(
            "rounded-lg p-2.5",
            iconVariantStyles[variant]
          )}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1.5">
          <span className={cn(
            "text-xs font-medium px-1.5 py-0.5 rounded",
            trend.isPositive ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
          )}>
            {trend.isPositive ? "+" : ""}{trend.value}%
          </span>
          <span className={cn(
            "text-xs",
            variant === "default" ? "text-muted-foreground" : "opacity-70"
          )}>
            vs mes anterior
          </span>
        </div>
      )}
    </div>
  );
}

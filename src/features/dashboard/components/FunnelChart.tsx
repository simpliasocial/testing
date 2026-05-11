import { cn } from "@/lib/utils";

interface FunnelStage {
  label: string;
  value: number;
  percentage: number;
  color: string;
}

interface FunnelChartProps {
  stages: FunnelStage[];
  className?: string;
}

export function FunnelChart({ stages, className }: FunnelChartProps) {
  const maxValue = Math.max(...stages.map(s => s.value));

  return (
    <div className={cn("space-y-3", className)}>
      {stages.map((stage, index) => {
        const widthPercent = maxValue > 0 ? (stage.value / maxValue) * 100 : 0;
        const delay = index * 100;

        return (
          <div
            key={stage.label}
            className="group relative animate-fade-in"
            style={{ animationDelay: `${delay}ms` }}
          >
            <div className="flex items-center gap-4">
              <div className="w-32 text-right">
                <span className="text-sm font-medium text-foreground">
                  {stage.label}
                </span>
              </div>
              <div className="flex-1 relative h-12">
                <div
                  className="absolute inset-y-0 left-0 rounded-r-lg transition-all duration-700 ease-out flex items-center justify-end pr-4 group-hover:brightness-110"
                  style={{
                    width: `${widthPercent}%`,
                    backgroundColor: stage.color,
                    minWidth: stage.value > 0 ? '80px' : '0px',
                  }}
                >
                  <span className="text-white font-bold text-lg drop-shadow-sm">
                    {stage.value.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="w-16 text-right">
                <span className="text-sm font-semibold text-muted-foreground">
                  {stage.percentage}%
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

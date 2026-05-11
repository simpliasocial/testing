import { cn } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from "recharts";

interface DataCaptureChartProps {
  className?: string;
  data?: {
    completionRate: number;
    fieldRates: Array<{ field: string; rate: number }>;
    incomplete: number;
    funnelDropoff: number;
  };
}

export function DataCaptureChart({ className, data }: DataCaptureChartProps) {
  const completionRate = data?.completionRate || 0;
  const fieldData = data?.fieldRates || [];

  const completionData = [
    { name: "Completado", value: completionRate, color: "hsl(142, 71%, 45%)" },
    { name: "Abandonado", value: 100 - completionRate, color: "hsl(220, 30%, 65%)" },
  ];

  return (
    <div className={cn("grid grid-cols-1 lg:grid-cols-2 gap-6", className)}>
      {/* Donut Chart */}
      <div className="flex flex-col items-center">
        <h4 className="text-sm font-medium text-muted-foreground mb-4">Estado de Captura</h4>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={completionData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={70}
                paddingAngle={2}
                dataKey="value"
              >
                {completionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value) => <span className="text-sm text-foreground">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 text-center">
          <span className="text-3xl font-bold text-success">{completionRate}%</span>
          <p className="text-sm text-muted-foreground">Tasa de Completitud</p>
        </div>
      </div>

      {/* Horizontal Bar Chart */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-4">Tasa de Completitud por Campo</h4>
        <div className="space-y-4">
          {fieldData.map((item, index) => (
            <div
              key={item.field}
              className="animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-foreground font-medium">{item.field}</span>
                <span className="text-primary font-semibold">{item.rate}%</span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out"
                  style={{
                    width: `${item.rate}%`,
                    background: `linear-gradient(90deg, hsl(224, 62%, 32%) 0%, hsl(224, 55%, 45%) 100%)`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

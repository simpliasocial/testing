import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";

interface WeeklyTrendProps {
  data: Array<{ week: string; leads: number; appointments: number }>;
  className?: string;
}

export function WeeklyTrend({ data, className }: WeeklyTrendProps) {
  return (
    <div className={cn("h-48", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="week"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            axisLine={{ stroke: 'hsl(var(--border))' }}
          />
          <YAxis
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            axisLine={{ stroke: 'hsl(var(--border))' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
            }}
          />
          <Line
            type="monotone"
            dataKey="leads"
            stroke="hsl(224, 62%, 32%)"
            strokeWidth={2}
            dot={{ fill: 'hsl(224, 62%, 32%)', strokeWidth: 0, r: 4 }}
            name="Leads"
          />
          <Line
            type="monotone"
            dataKey="appointments"
            stroke="hsl(45, 93%, 58%)"
            strokeWidth={2}
            dot={{ fill: 'hsl(45, 93%, 58%)', strokeWidth: 0, r: 4 }}
            name="Citas"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

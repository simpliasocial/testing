import { cn } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";

interface DisqualificationReasonsProps {
  className?: string;
  data?: Array<{ reason: string; count: number; percentage: number }>;
}

type DisqualificationReason = NonNullable<DisqualificationReasonsProps["data"]>[number];

const colors = [
  "hsl(0, 72%, 51%)",
  "hsl(38, 92%, 50%)",
  "hsl(220, 30%, 60%)",
  "hsl(220, 20%, 75%)",
];

const getTooltipPercentage = (props: unknown) => {
  const payload = (props as { payload?: Partial<DisqualificationReason> })?.payload;
  const percentage = Number(payload?.percentage || 0);
  return Number.isFinite(percentage) ? percentage : 0;
};

export function DisqualificationReasons({ className, data = [] }: DisqualificationReasonsProps) {

  return (
    <div className={cn("", className)}>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }} barSize={32}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="reason"
              tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
              width={150}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted)/0.2)' }}
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}
              formatter={(value: number, _name: string, props: unknown) => [
                <div className="flex flex-col gap-1">
                  <span className="font-bold">{value} leads</span>
                  <span className="text-xs text-muted-foreground">
                    {getTooltipPercentage(props)}% del total
                  </span>
                </div>,
                'Cantidad'
              ]}
            />
            <Bar dataKey="count" radius={4} background={{ fill: 'hsl(var(--muted)/0.2)', radius: 4 }}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {data.map((item, index) => (
          <div
            key={item.reason}
            className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full shadow-sm"
                style={{ backgroundColor: colors[index % colors.length] }}
              />
              <span className="text-sm font-medium text-foreground">{item.reason}</span>
            </div>
            <span className="text-sm font-bold text-muted-foreground">{item.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

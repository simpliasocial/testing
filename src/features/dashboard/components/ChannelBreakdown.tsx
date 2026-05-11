import { cn } from "@/lib/utils";
import { MessageCircle, Facebook, Instagram, HelpCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ChannelData {
  name: string;
  count: number;
  percentage: number;
  icon: LucideIcon | string;
  color: string;
}

const iconMap: Record<string, LucideIcon> = {
  MessageCircle,
  Facebook,
  Instagram,
  HelpCircle,
};

interface ChannelBreakdownProps {
  className?: string;
  data?: ChannelData[];
}

export function ChannelBreakdown({ className, data }: ChannelBreakdownProps) {
  // If no data provided, show empty or default
  const displayChannels = data || [];

  return (
    <div className={cn("space-y-4", className)}>
      {displayChannels.map((channel, index) => (
        <div
          key={channel.name}
          className="p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors animate-fade-in"
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <div className="flex items-center gap-3 mb-2">
            <div className={cn("p-2 rounded-lg", channel.color)}>
              {(() => {
                const IconComponent = typeof channel.icon === 'string' ? iconMap[channel.icon] : channel.icon;
                return IconComponent ? <IconComponent className="h-4 w-4 text-white" /> : null;
              })()}
            </div>
            <span className="font-semibold text-foreground">{channel.name}</span>
            <span className="ml-auto text-lg font-bold text-primary">{channel.count}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5">
            <div
              className={cn("h-2.5 rounded-full", channel.color)}
              style={{ width: `${channel.percentage}%` }}
            ></div>
          </div>
          <div className="text-right text-xs text-muted-foreground mt-1">
            {channel.percentage}% del total
          </div>
        </div>
      ))}
    </div>
  );
}

import { Card, CardContent } from "../ui/Card";
import { cn } from "../../lib/utils";

interface StatsCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  trend?: string;
  accent?: "violet" | "emerald" | "amber";
}

const ACCENT_CLASSES = {
  violet: "bg-amber-50 text-amber-700",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-100 text-amber-700",
} as const;

export function StatsCard({
  label,
  value,
  icon,
  trend,
  accent = "violet",
}: StatsCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900">
              {value}
            </p>
            {trend !== undefined && (
              <p className="mt-1 text-xs text-slate-400">{trend}</p>
            )}
          </div>
          <span
            className={cn(
              "flex size-10 items-center justify-center rounded-lg",
              ACCENT_CLASSES[accent],
            )}
          >
            {icon}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

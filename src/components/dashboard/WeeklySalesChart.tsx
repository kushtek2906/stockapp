import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { last7Days, shortDayLabel } from "../../lib/utils";
import type { Sale } from "../../types";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";

interface WeeklySalesChartProps {
  sales: Sale[];
}

const TOOLTIP_STYLE = {
  backgroundColor: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
} as const;

export function WeeklySalesChart({ sales }: WeeklySalesChartProps) {
  const chartData = useMemo(() => {
    const days = last7Days();
    return days.map((dateStr) => {
      const daySales = sales.filter((s) => s.date === dateStr);
      const revenue = daySales.reduce((sum, s) => sum + s.totalPrice, 0);
      const mlSold = daySales.reduce((sum, s) => sum + s.mlSold, 0);
      return {
        day: shortDayLabel(dateStr),
        Revenue: revenue,
        "ML Sold": mlSold,
      };
    });
  }, [sales]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sales of the Week</CardTitle>
        <p className="text-sm text-slate-500">Revenue and ML sold — last 7 days</p>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 12, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="revenue"
                tick={{ fontSize: 12, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="ml"
                orientation="right"
                tick={{ fontSize: 12, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar
                yAxisId="revenue"
                dataKey="Revenue"
                fill="#b45309"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                yAxisId="ml"
                dataKey="ML Sold"
                fill="#cbd5e1"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

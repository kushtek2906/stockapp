import { DollarSign, ShoppingCart, TrendingUp, Wallet } from "lucide-react";
import { useMemo } from "react";
import logo from "../assets/logo.png";
import { WeeklySalesChart } from "../components/dashboard/WeeklySalesChart";
import { StatsCard } from "../components/dashboard/StatsCard";
import { formatCurrency } from "../lib/utils";
import type { Sale } from "../types";

interface DashboardPageProps {
  sales: Sale[];
  totalInvestment: number;
  totalRevenue: number;
  totalProfit: number;
}

export function DashboardPage({
  sales,
  totalInvestment,
  totalRevenue,
  totalProfit,
}: DashboardPageProps) {
  const weekSales = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return sales.filter((s) => s.date >= cutoffStr);
  }, [sales]);

  const weekRevenue = useMemo(
    () => weekSales.reduce((sum, s) => sum + s.totalPrice, 0),
    [weekSales],
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <img src={logo} alt="DECANTVERSE" className="h-14 w-auto object-contain" />
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Dashboard</h1>
          <p className="mt-0.5 text-sm text-stone-500">
            Overview of your decant business
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          label="Total Investment"
          value={formatCurrency(totalInvestment)}
          icon={<Wallet className="size-5" aria-hidden />}
          accent="violet"
          trend="Total invested to date"
        />
        <StatsCard
          label="Total Revenue"
          value={formatCurrency(totalRevenue)}
          icon={<ShoppingCart className="size-5" aria-hidden />}
          accent="emerald"
          trend={`${sales.length} sales total`}
        />
        <StatsCard
          label="Total Profit"
          value={formatCurrency(totalProfit)}
          icon={<TrendingUp className="size-5" aria-hidden />}
          accent="emerald"
          trend="Across all orders (approx.)"
        />
        <StatsCard
          label="This Week"
          value={formatCurrency(weekRevenue)}
          icon={<DollarSign className="size-5" aria-hidden />}
          accent="amber"
          trend={`${weekSales.length} sales this week`}
        />
      </div>

      <WeeklySalesChart sales={sales} />
    </div>
  );
}

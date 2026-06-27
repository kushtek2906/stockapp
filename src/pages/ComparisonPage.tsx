import { ArrowLeftRight, ClipboardCopy, Settings } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SheetSettingsDialog } from "../components/order/SheetSettingsDialog";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent } from "../components/ui/Card";
import {
  buildComparison,
  formatComparisonReport,
  type ComparisonReport,
  type SizeComparison,
} from "../lib/compare";
import { loadPrefs, savePrefs } from "../lib/prefs";
import { fetchCompetitorCatalog } from "../lib/sheet";
import { cn, formatDateTime } from "../lib/utils";
import { DECANT_SIZES, type DecantCatalog } from "../types";

interface ComparisonPageProps {
  myCatalog: DecantCatalog | null;
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "neutral" }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
      <p className="text-xs text-stone-400">{label}</p>
      <p
        className={cn(
          "text-lg font-semibold",
          tone === "good" && "text-emerald-600",
          tone === "bad" && "text-red-600",
          (tone === undefined || tone === "neutral") && "text-stone-900",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function SizeCell({ cmp }: { cmp: SizeComparison | undefined }) {
  if (cmp === undefined) {
    return <span className="text-stone-300">—</span>;
  }
  const tone =
    cmp.diff < 0 ? "text-emerald-600" : cmp.diff > 0 ? "text-red-600" : "text-stone-500";
  const sign = cmp.diff > 0 ? `+${cmp.diff}` : `${cmp.diff}`;
  return (
    <div className="leading-tight">
      <div className="text-stone-700">
        {cmp.mine} <span className="text-stone-400">/ {cmp.theirs}</span>
      </div>
      <div className={cn("text-xs font-medium", tone)}>{cmp.diff === 0 ? "same" : sign}</div>
    </div>
  );
}

export function ComparisonPage({ myCatalog }: ComparisonPageProps) {
  const prefs = loadPrefs();
  const [compId, setCompId] = useState(prefs.competitorSheetId);
  const [compGid, setCompGid] = useState(prefs.competitorSheetGid);
  const [report, setReport] = useState<ComparisonReport | null>(null);
  const [generating, setGenerating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const reportText = useMemo(
    () => (report !== null ? formatComparisonReport(report) : ""),
    [report],
  );

  const generate = async (id: string = compId, gid: string = compGid) => {
    if (myCatalog === null) {
      toast.error("Your prices haven't loaded yet — open the Order tab once, then retry.");
      return;
    }
    setGenerating(true);
    try {
      const competitor = await fetchCompetitorCatalog(id, gid);
      setReport(buildComparison(myCatalog, competitor));
      toast.success("Comparison generated.");
    } catch (e) {
      toast.error(
        `Couldn't read the competitor sheet. ${e instanceof Error ? e.message : ""}`,
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveConfig = (id: string, gid: string) => {
    setCompId(id);
    setCompGid(gid);
    savePrefs({ competitorSheetId: id, competitorSheetGid: gid });
    void generate(id, gid);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      toast.success("Report copied to clipboard.");
    } catch {
      toast.error("Couldn't copy — select the text and copy manually.");
    }
  };

  const stats = report?.stats;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Price Comparison</h1>
          <p className="mt-1 text-sm text-stone-500">
            Smart-maps your perfumes to a competitor's sheet and reports where you're
            cheaper or pricier.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => void generate()}
            disabled={generating || myCatalog === null}
          >
            <ArrowLeftRight className="size-4" aria-hidden />
            {generating ? "Comparing…" : "Generate comparison"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Competitor sheet settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      {myCatalog === null && (
        <p className="text-sm text-amber-600">
          Waiting for your own prices to load from the sheet…
        </p>
      )}

      {report === null ? (
        <div className="rounded-xl border border-dashed border-stone-200 bg-white p-10 text-center text-sm text-stone-400">
          Choose <span className="font-medium">Generate comparison</span> to build a
          detailed report against the competitor's prices.
        </div>
      ) : (
        <div className="space-y-6">
          {stats !== undefined && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard label="Matched" value={`${stats.matchedCount}/${stats.myTotal}`} />
              <StatCard label="Comparisons" value={`${stats.sizeComparisons}`} />
              <StatCard label="I'm cheaper" value={`${stats.cheaper}`} tone="good" />
              <StatCard label="I'm pricier" value={`${stats.pricier}`} tone="bad" />
              <StatCard label="Same" value={`${stats.same}`} />
              <StatCard
                label="Avg diff"
                value={`${stats.avgDiff >= 0 ? "+" : ""}${stats.avgDiff.toFixed(0)}`}
                tone={stats.avgDiff > 0 ? "bad" : stats.avgDiff < 0 ? "good" : "neutral"}
              />
            </div>
          )}

          <p className="text-xs text-stone-400">
            Generated {formatDateTime(report.generatedAt)} · each cell shows{" "}
            <span className="text-stone-600">mine / theirs</span> and the difference
            (green = I'm cheaper, red = I'm pricier). {report.unmatchedMine.length} of
            mine had no match; {report.competitorOnlyCount} of theirs aren't in my list.
          </p>

          {/* Detailed table */}
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            <div className="max-h-[calc(100vh-22rem)] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-stone-50/95 backdrop-blur">
                  <tr className="border-b border-stone-100">
                    <th className="px-4 py-3 text-left font-medium text-stone-500">
                      My Perfume
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-stone-500">
                      Competitor Match
                    </th>
                    {DECANT_SIZES.map((sz) => (
                      <th
                        key={sz}
                        className="px-4 py-3 text-left font-medium text-stone-500"
                      >
                        {sz}ml
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.matched.map((row, i) => {
                    const bySize = new Map(row.sizes.map((s) => [s.size, s]));
                    return (
                      <tr
                        key={`${row.perfume}-${i}`}
                        className="border-b border-stone-100 last:border-0"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-stone-900">{row.perfume}</p>
                          <p className="text-xs text-stone-400">{row.brand}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-stone-600">{row.competitorPerfume}</span>
                            {row.score < 0.82 && (
                              <Badge variant="low" className="text-[10px]">
                                ≈ check
                              </Badge>
                            )}
                          </div>
                        </td>
                        {DECANT_SIZES.map((sz) => (
                          <td key={sz} className="px-4 py-3">
                            <SizeCell cmp={bySize.get(sz)} />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Copyable full report */}
          <Card>
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-stone-900">Full report</h2>
                <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                  <ClipboardCopy className="size-4" aria-hidden />
                  Copy report
                </Button>
              </div>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-stone-200 bg-stone-50 px-3 py-3 font-mono text-xs text-stone-800">
                {reportText}
              </pre>
            </CardContent>
          </Card>
        </div>
      )}

      <SheetSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        sheetId={compId}
        gid={compGid}
        lastSynced={report?.generatedAt ?? null}
        syncing={generating}
        onSave={handleSaveConfig}
        onRefresh={() => void generate()}
      />
    </div>
  );
}

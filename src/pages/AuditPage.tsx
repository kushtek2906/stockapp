import { useMemo, useState } from "react";
import type { AuditAction, AuditEntity, AuditEntry } from "../types";
import { formatDateTime } from "../lib/utils";
import { Badge } from "../components/ui/Badge";
import { cn } from "../lib/utils";

interface AuditPageProps {
  auditLog: AuditEntry[];
}

const ACTION_BADGE_CLASS: Record<AuditAction, string> = {
  create: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  edit: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  delete: "bg-red-50 text-red-700 ring-1 ring-red-200",
} as const;

const ACTION_LABEL: Record<AuditAction, string> = {
  create: "Created",
  edit: "Edited",
  delete: "Deleted",
} as const;

const ENTITY_LABEL: Record<AuditEntity, string> = {
  brand: "Brand",
  perfume: "Perfume",
  sale: "Sale",
} as const;

const ALL = "all" as const;

export function AuditPage({ auditLog }: AuditPageProps) {
  const [filterAction, setFilterAction] = useState<AuditAction | typeof ALL>(
    ALL,
  );
  const [filterEntity, setFilterEntity] = useState<AuditEntity | typeof ALL>(
    ALL,
  );

  const sorted = useMemo(
    () => auditLog.toSorted((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [auditLog],
  );

  const filtered = useMemo(() => {
    return sorted.filter((e) => {
      const actionMatch = filterAction === ALL || e.action === filterAction;
      const entityMatch = filterEntity === ALL || e.entity === filterEntity;
      return actionMatch && entityMatch;
    });
  }, [sorted, filterAction, filterEntity]);

  const SELECT_CLASS =
    "h-9 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Audit Log</h1>
        <p className="mt-1 text-sm text-stone-500">
          Every create, edit, and delete action is recorded here for
          transparency.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="filter-action" className="text-sm text-stone-500">
            Action:
          </label>
          <select
            id="filter-action"
            className={SELECT_CLASS}
            value={filterAction}
            onChange={(e) =>
              setFilterAction(e.target.value as AuditAction | typeof ALL)
            }
          >
            <option value="all">All</option>
            <option value="create">Created</option>
            <option value="edit">Edited</option>
            <option value="delete">Deleted</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="filter-entity" className="text-sm text-stone-500">
            Type:
          </label>
          <select
            id="filter-entity"
            className={SELECT_CLASS}
            value={filterEntity}
            onChange={(e) =>
              setFilterEntity(e.target.value as AuditEntity | typeof ALL)
            }
          >
            <option value="all">All</option>
            <option value="brand">Brand</option>
            <option value="perfume">Perfume</option>
            <option value="sale">Sale</option>
          </select>
        </div>

        <span className="ml-auto text-sm text-stone-400">
          {filtered.length} of {auditLog.length} entries
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50/80">
              <th className="px-4 py-3 text-left font-medium text-stone-500">
                Timestamp
              </th>
              <th className="px-4 py-3 text-left font-medium text-stone-500">
                Action
              </th>
              <th className="px-4 py-3 text-left font-medium text-stone-500">
                Type
              </th>
              <th className="px-4 py-3 text-left font-medium text-stone-500">
                Description
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-stone-400">
                  {auditLog.length === 0
                    ? "No activity recorded yet."
                    : "No entries match the current filters."}
                </td>
              </tr>
            ) : (
              filtered.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-stone-100 last:border-0 hover:bg-stone-50/50 transition-colors"
                >
                  <td className="px-4 py-3 text-xs text-stone-400 whitespace-nowrap">
                    {formatDateTime(entry.timestamp)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                        ACTION_BADGE_CLASS[entry.action],
                      )}
                    >
                      {ACTION_LABEL[entry.action]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="default">
                      {ENTITY_LABEL[entry.entity]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-stone-700">
                    {entry.description}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

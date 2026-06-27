import * as Dialog from "@radix-ui/react-dialog";
import { RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDateTime } from "../../lib/utils";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";

interface SheetSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheetId: string;
  gid: string;
  lastSynced: string | null;
  syncing: boolean;
  onSave: (sheetId: string, gid: string) => void;
  onRefresh: () => void;
}

export function SheetSettingsDialog({
  open,
  onOpenChange,
  sheetId,
  gid,
  lastSynced,
  syncing,
  onSave,
  onRefresh,
}: SheetSettingsDialogProps) {
  const [idValue, setIdValue] = useState(sheetId);
  const [gidValue, setGidValue] = useState(gid);

  useEffect(() => {
    if (open) {
      setIdValue(sheetId);
      setGidValue(gid);
    }
  }, [open, sheetId, gid]);

  const handleSave = () => {
    const trimmedId = idValue.trim();
    const trimmedGid = gidValue.trim();
    if (trimmedId === "" || trimmedGid === "") return;
    onSave(trimmedId, trimmedGid);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(90vw,30rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-stone-200 bg-white p-6 shadow-xl focus:outline-none">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold text-stone-900">
                Price Sheet Settings
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-stone-500">
                Prices are read live from a Google Sheet (decant tab). The app
                only reads — it never edits your sheet.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close dialog">
                <X className="size-4" aria-hidden />
              </Button>
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sheet-id">Sheet ID</Label>
              <Input
                id="sheet-id"
                value={idValue}
                onChange={(e) => setIdValue(e.target.value)}
                placeholder="The long ID from the sheet URL"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sheet-gid">Tab GID (decant tab)</Label>
              <Input
                id="sheet-gid"
                value={gidValue}
                onChange={(e) => setGidValue(e.target.value)}
                placeholder="e.g. 2087866095"
              />
            </div>

            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-xs text-stone-500">
              <p className="mb-1 font-medium text-stone-700">Sharing required</p>
              The sheet must be shared so that{" "}
              <span className="font-medium">anyone with the link can view</span>.
              Find the ID and gid in the sheet URL:
              <code className="mt-1 block break-all font-mono text-[11px] text-stone-600">
                .../d/<span className="text-amber-700">SHEET_ID</span>/edit#gid=
                <span className="text-amber-700">GID</span>
              </code>
            </div>

            <div className="flex items-center justify-between text-xs text-stone-500">
              <span>
                {lastSynced !== null
                  ? `Last synced: ${formatDateTime(lastSynced)}`
                  : "Never synced"}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={syncing}
              >
                <RefreshCw
                  className={syncing ? "size-3.5 animate-spin" : "size-3.5"}
                  aria-hidden
                />
                Refresh now
              </Button>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              onClick={handleSave}
              disabled={idValue.trim() === "" || gidValue.trim() === ""}
            >
              Save &amp; Refresh
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

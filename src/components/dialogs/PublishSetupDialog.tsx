import * as Dialog from "@radix-ui/react-dialog";
import { ClipboardCopy, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { loadPrefs, savePrefs } from "../../lib/prefs";
import { buildAppsScript } from "../../lib/publish";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";

interface PublishSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the URL is saved so the parent can re-read prefs. */
  onSaved: () => void;
}

/** Guides the one-time Apps Script write-back setup and stores the /exec URL. */
export function PublishSetupDialog({
  open,
  onOpenChange,
  onSaved,
}: PublishSetupDialogProps) {
  const [url, setUrl] = useState("");
  const script = buildAppsScript(loadPrefs());

  useEffect(() => {
    if (open) setUrl(loadPrefs().publishScriptUrl);
  }, [open]);

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(script);
      toast.success("Script copied — paste it into the Apps Script editor.");
    } catch {
      toast.error("Couldn't copy — select the text and copy manually.");
    }
  };

  const save = () => {
    savePrefs({ publishScriptUrl: url.trim() });
    onSaved();
    onOpenChange(false);
    toast.success(
      url.trim() === "" ? "Publish URL cleared." : "Publish URL saved.",
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(92vw,44rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-stone-200 bg-white p-6 shadow-xl focus:outline-none">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold text-stone-900">
                Set up "Publish to sheet"
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-stone-500">
                A one-time hookup so the app can write your prices into the
                customer Google Sheet.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close dialog">
                <X className="size-4" aria-hidden />
              </Button>
            </Dialog.Close>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-stone-600">
              <li>
                Open your <span className="font-medium">customer price</span>{" "}
                Google Sheet → <span className="font-medium">Extensions →
                Apps Script</span>.
              </li>
              <li>Delete anything in the editor, paste the script below, and Save.</li>
              <li>
                <span className="font-medium">Deploy → New deployment</span> →
                type <span className="font-medium">Web app</span> → Execute as{" "}
                <span className="font-medium">Me</span>, Who has access{" "}
                <span className="font-medium">Anyone with the link</span> →
                Deploy. Authorize when asked.
              </li>
              <li>
                Copy the <span className="font-mono text-xs">…/exec</span> URL it
                gives you and paste it below.
              </li>
            </ol>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Apps Script</Label>
                <Button variant="outline" size="sm" onClick={copyScript}>
                  <ClipboardCopy className="size-3.5" aria-hidden />
                  Copy script
                </Button>
              </div>
              <pre className="max-h-52 overflow-auto rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-[11px] leading-relaxed text-stone-700">
                {script}
              </pre>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="publish-url">Web app URL (…/exec)</Label>
              <Input
                id="publish-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/…/exec"
              />
              <p className="text-xs text-stone-400">
                Stored on this device only. Anyone with this URL can write to your
                sheet, so keep it private.
              </p>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2 border-t border-stone-100 pt-4">
            <Dialog.Close asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Dialog.Close>
            <Button type="button" onClick={save}>
              Save
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

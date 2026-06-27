import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle, FileJson, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import type { Brand } from "../../types";
import { importSchema, type ImportPayload } from "../../lib/importSchema";
import { Button } from "../ui/Button";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingBrands: Brand[];
  onImport: (payload: ImportPayload) => void;
}

type ParseResult =
  | { ok: true; payload: ImportPayload; newBrands: number; newPerfumes: number; skippedBrands: string[]; missingCodes: string[] }
  | { ok: false; error: string };

function parseAndValidate(raw: string, existingBrands: Brand[]): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Invalid JSON — could not parse the file." };
  }

  const result = importSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues;
    const first = issues[0];
    return { ok: false, error: first?.message ?? "Validation failed." };
  }

  const payload = result.data;
  const existingCodes = new Set(existingBrands.map((b) => b.brandCode.toUpperCase()));
  const incomingCodes = new Set<string>();

  const skippedBrands: string[] = [];
  let newBrands = 0;

  for (const b of payload.brands ?? []) {
    const upper = b.brandCode.toUpperCase();
    if (existingCodes.has(upper)) {
      skippedBrands.push(b.brandCode);
    } else {
      incomingCodes.add(upper);
      newBrands += 1;
    }
  }

  const allKnownCodes = new Set([...existingCodes, ...incomingCodes]);
  const missingCodes: string[] = [];
  let newPerfumes = 0;

  for (const p of payload.perfumes ?? []) {
    if (allKnownCodes.has(p.brandCode.toUpperCase())) {
      newPerfumes += 1;
    } else {
      missingCodes.push(p.brandCode);
    }
  }

  return { ok: true, payload, newBrands, newPerfumes, skippedBrands, missingCodes };
}

export function ImportDialog({
  open,
  onOpenChange,
  existingBrands,
  onImport,
}: ImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rawJson, setRawJson] = useState("");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [importing, setImporting] = useState(false);

  const handleReset = () => {
    setRawJson("");
    setParseResult(null);
    setImporting(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file === undefined) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === "string") {
        setRawJson(text);
        setParseResult(parseAndValidate(text, existingBrands));
      }
    };
    reader.readAsText(file);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setRawJson(text);
    if (text.trim().length > 0) {
      setParseResult(parseAndValidate(text, existingBrands));
    } else {
      setParseResult(null);
    }
  };

  const handleConfirm = () => {
    if (parseResult === null || !parseResult.ok) return;
    setImporting(true);
    onImport(parseResult.payload);
    handleReset();
    onOpenChange(false);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) handleReset();
        onOpenChange(o);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(90vw,36rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-stone-200 bg-white p-6 shadow-xl focus:outline-none">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold text-stone-900">
                Import Inventory (JSON)
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-stone-500">
                Upload a JSON file or paste raw JSON to bulk-import brands and perfumes.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close dialog">
                <X className="size-4" aria-hidden />
              </Button>
            </Dialog.Close>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs text-stone-500">
              <p className="mb-1.5 font-medium text-stone-700">Expected JSON shape:</p>
              <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-stone-600">{`{
  "brands": [{ "name": "Tom Ford", "brandCode": "TF" }],
  "perfumes": [{
    "brandCode": "TF", "name": "Oud Wood",
    "totalMl": 100, "costPrice": 8000,
    "purchaseDate": "2026-04-30"
  }]
}`}</pre>
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileChange}
                aria-label="Select JSON file"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full"
              >
                <Upload className="size-4" aria-hidden />
                Choose JSON File
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-stone-200" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-2 text-xs text-stone-400">or paste JSON</span>
              </div>
            </div>

            <textarea
              aria-label="Paste JSON here"
              rows={6}
              value={rawJson}
              onChange={handleTextChange}
              placeholder='{ "brands": [...], "perfumes": [...] }'
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 font-mono text-xs text-stone-800 placeholder:text-stone-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 resize-none"
            />

            {parseResult !== null && (
              <div>
                {parseResult.ok ? (
                  <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <FileJson className="size-4 text-emerald-600 shrink-0" aria-hidden />
                      <span className="font-medium text-emerald-800">
                        Ready to import: {parseResult.newBrands} new brand{parseResult.newBrands !== 1 ? "s" : ""},{" "}
                        {parseResult.newPerfumes} new perfume{parseResult.newPerfumes !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {parseResult.skippedBrands.length > 0 && (
                      <p className="text-xs text-emerald-700">
                        Skipped (already exist): {parseResult.skippedBrands.join(", ")}
                      </p>
                    )}
                    {parseResult.missingCodes.length > 0 && (
                      <p className="text-xs text-amber-700">
                        Perfumes skipped — brand code not found: {[...new Set(parseResult.missingCodes)].join(", ")}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm">
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden />
                    <p className="text-red-700">{parseResult.error}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="outline" onClick={handleReset}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              disabled={parseResult === null || !parseResult.ok || importing || (parseResult.ok && parseResult.newBrands === 0 && parseResult.newPerfumes === 0)}
              onClick={handleConfirm}
            >
              Confirm Import
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

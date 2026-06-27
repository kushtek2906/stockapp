import { ImageIcon, Trash2, Upload } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";

const MAX_BYTES = 300 * 1024;

interface ImageUploadProps {
  value?: string;
  onChange: (dataUrl: string | null) => void;
  label?: string;
}

export function ImageUpload({ value, onChange, label = "Image" }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    if (file.size > MAX_BYTES) {
      toast.warning(`Image is ${(file.size / 1024).toFixed(0)} KB — keep under 300 KB for best localStorage performance.`);
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === "string") onChange(result);
    };
    reader.readAsDataURL(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file !== undefined) handleFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file !== undefined) handleFile(file);
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-stone-700">{label}</p>
      {value !== undefined ? (
        <div className="relative inline-block">
          <img
            src={value}
            alt="Preview"
            className="h-24 w-24 rounded-lg border border-stone-200 object-cover"
          />
          <button
            type="button"
            aria-label="Remove image"
            onClick={() => onChange(null)}
            className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-red-500 text-white shadow hover:bg-red-600"
          >
            <Trash2 className="size-3" aria-hidden />
          </button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload image"
          className="flex h-24 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-stone-300 bg-stone-50 text-stone-400 transition-colors hover:border-amber-400 hover:bg-amber-50 hover:text-amber-600"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <Upload className="size-5" aria-hidden />
          <span className="text-xs font-medium">Click or drag to upload</span>
          <span className="text-[10px]">PNG, JPG · max 300 KB</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleInputChange}
        aria-label={`Upload ${label}`}
      />
      {value === undefined && (
        <div className="flex items-center gap-1.5 text-xs text-stone-400">
          <ImageIcon className="size-3" aria-hidden />
          <span>Optional — shown as thumbnail in tables</span>
        </div>
      )}
    </div>
  );
}

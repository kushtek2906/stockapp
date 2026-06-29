import type { BoxType } from "../types";

const PREFS_KEY = "decantverse_prefs";

interface AppPrefs {
  rememberLastPerfume: boolean;
  lastPerfumeId: string | null;
  rememberLastBrand: boolean;
  lastBrandId: string | null;
  /** Google Sheet (decant tab) used as the read-only pricing source. */
  sheetId: string;
  sheetGid: string;
  /** Google Sheet (price-revision tab) used as the source of cost prices. */
  costSheetId: string;
  costSheetGid: string;
  /** Competitor's public Google Sheet used for price comparison. */
  competitorSheetId: string;
  competitorSheetGid: string;
  /** Shipping box presets used to fill the pickup CSV (edit dims in-app). */
  boxes: BoxType[];
}

// Placeholder dimensions — edit them in-app via Order History → "Box sizes".
const DEFAULT_BOXES: BoxType[] = [
  { id: "box-small", name: "Small", lengthCm: 15, widthCm: 10, heightCm: 5, weightG: 150 },
  { id: "box-medium", name: "Medium", lengthCm: 20, widthCm: 15, heightCm: 10, weightG: 300 },
  { id: "box-large", name: "Large", lengthCm: 25, widthCm: 20, heightCm: 15, weightG: 500 },
];

const DEFAULT_PREFS: AppPrefs = {
  rememberLastPerfume: false,
  lastPerfumeId: null,
  rememberLastBrand: false,
  lastBrandId: null,
  sheetId: "1reDOBi8XBfdeh0kSmdg28f4qJgh_2lDpqnIWWL5cQYU",
  sheetGid: "2087866095",
  costSheetId: "14w0zPCEXrmvTpKb4dNNf5AZ64ADb08eMW0eDFuj0wbo",
  costSheetGid: "1021089370",
  competitorSheetId: "118f-ZLbawdsi38eDv9TqV7pq-yxjaHPdunruCwuerb8",
  competitorSheetGid: "0",
  boxes: DEFAULT_BOXES,
};

export function loadPrefs(): AppPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw === null) return { ...DEFAULT_PREFS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...(parsed as Partial<AppPrefs>) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: Partial<AppPrefs>): void {
  const current = loadPrefs();
  localStorage.setItem(PREFS_KEY, JSON.stringify({ ...current, ...prefs }));
}

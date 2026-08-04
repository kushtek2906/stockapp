import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { StockStatus } from "../types";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(dateStr));
}

export function formatDateTime(isoStr: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoStr));
}

export function getStockStatus(ml: number): StockStatus {
  if (ml < 10) return "critical";
  if (ml <= 30) return "low";
  return "ok";
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function last7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}

export function shortDayLabel(dateStr: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(
    new Date(dateStr),
  );
}

/**
 * Auto-generate a brand code from the brand name.
 * Takes the first letter of each word, uppercased, capped at 4 characters.
 * "Maison Margiela" → "MM", "Tom Ford" → "TF", "Byredo" → "B"
 * Caller should pad/adjust if the result is too short.
 */
export function generateBrandCode(name: string): string {
  const words = name.trim().split(/\s+/);
  const letters = words.map((w) => w.charAt(0).toUpperCase()).join("");
  return letters.slice(0, 4);
}

/**
 * Generate the next perfume code for a given brand code.
 * Scans existing perfumeCodes for entries matching "XXX-NNN", finds the max serial,
 * then returns XXX-(max+1) zero-padded to 3 digits.
 * If no existing codes, returns "XXX-001".
 */
export function nextPerfumeCode(
  brandCode: string,
  existingCodes: string[],
): string {
  const prefix = `${brandCode}-`;
  let maxSerial = 0;
  for (const code of existingCodes) {
    if (code.startsWith(prefix)) {
      const serial = Number.parseInt(code.slice(prefix.length), 10);
      if (!Number.isNaN(serial) && serial > maxSerial) {
        maxSerial = serial;
      }
    }
  }
  const next = String(maxSerial + 1).padStart(3, "0");
  return `${brandCode}-${next}`;
}

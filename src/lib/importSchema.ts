import { z } from "zod";

export const importBrandSchema = z.object({
  name: z.string().min(1, "Brand name is required"),
  brandCode: z.string().min(1).max(6, "Brand code max 6 chars"),
});

export const importPerfumeSchema = z.object({
  brandCode: z.string().min(1),
  name: z.string().min(1, "Perfume name is required"),
  totalMl: z.number().positive("totalMl must be positive"),
  costPrice: z.number().nonnegative("costPrice must be ≥ 0"),
  purchaseDate: z.string().min(1),
});

export const importSchema = z.object({
  brands: z.array(importBrandSchema).optional(),
  perfumes: z.array(importPerfumeSchema).optional(),
});

export type ImportPayload = z.infer<typeof importSchema>;
export type ImportBrand = z.infer<typeof importBrandSchema>;
export type ImportPerfume = z.infer<typeof importPerfumeSchema>;

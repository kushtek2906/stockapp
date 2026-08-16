import { z } from "zod";

export const importBrandSchema = z.object({
  name: z.string().min(1, "Brand name is required"),
  brandCode: z.string().min(1).max(6, "Brand code max 6 chars"),
});

const bottleMlField = z.number().positive("bottleMl must be positive");
const bottleCostField = z.number().nonnegative("bottleCost must be ≥ 0");

/**
 * `totalMl` / `costPrice` are the pre-unification field names, still accepted so
 * previously exported files keep importing. New files should use `bottleMl` and
 * `bottleCost` — the size and cost of ONE bottle.
 */
export const importPerfumeSchema = z
  .object({
    brandCode: z.string().min(1),
    name: z.string().min(1, "Perfume name is required"),
    bottleMl: bottleMlField.optional(),
    totalMl: bottleMlField.optional(),
    bottleCost: bottleCostField.optional(),
    costPrice: bottleCostField.optional(),
    purchaseDate: z.string().min(1),
  })
  .transform((p, ctx) => {
    const bottleMl = p.bottleMl ?? p.totalMl;
    const bottleCost = p.bottleCost ?? p.costPrice;
    if (bottleMl === undefined) {
      ctx.addIssue({ code: "custom", message: '"bottleMl" is required' });
      return z.NEVER;
    }
    if (bottleCost === undefined) {
      ctx.addIssue({ code: "custom", message: '"bottleCost" is required' });
      return z.NEVER;
    }
    return {
      brandCode: p.brandCode,
      name: p.name,
      bottleMl,
      bottleCost,
      purchaseDate: p.purchaseDate,
    };
  });

export const importSchema = z.object({
  brands: z.array(importBrandSchema).optional(),
  perfumes: z.array(importPerfumeSchema).optional(),
});

export type ImportPayload = z.infer<typeof importSchema>;
export type ImportBrand = z.infer<typeof importBrandSchema>;
export type ImportPerfume = z.infer<typeof importPerfumeSchema>;

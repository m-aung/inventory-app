import { z } from "zod";

export const units = [
  "pcs",
  "bottles",
  "bags",
  "boxes",
  "kg",
  "g",
  "L",
  "mL",
] as const;
export const itemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter an item name.")
    .max(100, "Use at most 100 characters."),
  quantity: z
    .string()
    .trim()
    .regex(
      /^\d+(?:[.,]\d{1,3})?$/,
      "Use zero or a positive number, with up to 3 decimal places.",
    )
    .transform((v) => Number(v.replace(",", ".")))
    .refine(
      (v) => Number.isFinite(v) && v <= 999999,
      "Quantity cannot exceed 999,999.",
    ),
  unit: z.enum(units),
  notes: z.string().max(500, "Keep notes under 500 characters."),
});
export const emailSchema = z
  .email("Enter a valid email address.")
  .max(254)
  .transform((v) => v.toLowerCase());
export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128, "Use at most 128 characters.");
export const inventoryNameSchema = z
  .string()
  .trim()
  .min(1, "Enter an inventory name.")
  .max(80, "Use at most 80 characters.");
export type ItemInput = z.output<typeof itemSchema>;
export type ItemDraft = z.input<typeof itemSchema>;

import { z } from "zod";
import { publicIdSchema, shareIdSchema } from "./public-card.js";

export const employeeCardResponseSchema = z.object({
  card_id: z.string(),
  public_id: publicIdSchema,
  display_name: z.string(),
  title: z.string().nullable(),
  company: z.string().nullable(),
  avatar_url: z.string().url().nullable(),
  fields: z.object({
    mobile: z.string().nullable(),
    email: z.string().email().nullable(),
    wechat_id: z.string().nullable()
  }),
  status: z.enum(["active", "disabled"]),
  privacy: z.object({
    show_mobile: z.boolean(),
    show_email: z.boolean(),
    show_wechat: z.boolean()
  })
});

export const employeeShareResponseSchema = z.object({
  public_id: publicIdSchema,
  share_id: shareIdSchema,
  scene: shareIdSchema,
  path: z.string().min(1)
});

export const updateEmployeeCardRequestSchema = z.object({
  display_name: z.string().min(1).max(128).optional(),
  title: z.string().max(128).nullable().optional(),
  fields: z
    .object({
      mobile: z.string().max(32).nullable().optional(),
      email: z.string().email().nullable().optional(),
      wechat_id: z.string().max(128).nullable().optional()
    })
    .optional(),
  privacy: z
    .object({
      show_mobile: z.boolean().optional(),
      show_email: z.boolean().optional(),
      show_wechat: z.boolean().optional()
    })
    .optional()
});

export type EmployeeCardResponse = z.infer<typeof employeeCardResponseSchema>;
export type EmployeeShareResponse = z.infer<typeof employeeShareResponseSchema>;
export type UpdateEmployeeCardRequest = z.infer<typeof updateEmployeeCardRequestSchema>;

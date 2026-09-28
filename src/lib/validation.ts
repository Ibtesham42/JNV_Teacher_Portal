import { z } from "zod";
import { WEEKDAYS } from "./time";

export const weekdayEnum = z.enum(WEEKDAYS);
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date");
export const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24 hour)");

const text = (max: number) => z.string().trim().max(max);

export const teacherInput = z.object({
  name: text(120).min(2, "Name is required"),
  code: text(40).nullish().transform((v) => v || null),
  designation: text(80).nullish().transform((v) => v || null),
  phone: text(30).nullish().transform((v) => v || null),
  aliases: z.array(text(120)).max(10).default([]),
  active: z.boolean().default(true),
});
export const teacherPatch = teacherInput.partial();

export const accountInput = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9._-]+$/, "Letters, numbers, dot, dash and underscore only"),
  password: z.string().min(8, "At least 8 characters").max(100),
  mustChangePassword: z.boolean().default(true),
});

export const passwordChange = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8, "At least 8 characters").max(100),
});

export const modInput = z.object({
  dates: z.array(isoDate).min(1).max(62),
  teacherIds: z.array(z.string().min(1)).min(1).max(30),
  dutyDescription: text(300).nullish().transform((v) => v || null),
  dutyType: z.enum(["MOD", "HOLIDAY"]).default("MOD"),
});

export const weeklyOffInput = z.object({
  teacherId: z.string().min(1),
  day: weekdayEnum.nullable(),
});

export const noticeInput = z.object({
  title: text(160).min(2, "Title is required"),
  description: text(5000).min(1, "Description is required"),
  date: isoDate,
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
});
export const noticePatch = noticeInput.partial().extend({ archived: z.boolean().optional() });

export const clubInput = z.object({
  name: text(120).min(2),
  members: z.array(text(160)).max(60).default([]),
  activities: z.array(text(300)).max(60).default([]),
});

export const remedialInput = z.object({
  category: z.enum(["REMEDIAL", "LIFE_SKILL", "ENRICHMENT", "OTHER"]).default("REMEDIAL"),
  className: text(10).min(1),
  section: text(3).default(""),
  day: weekdayEnum.nullable().default(null),
  startTime: clock.nullable().default(null),
  endTime: clock.nullable().default(null),
  activity: text(200).min(1),
  teacherId: z.string().nullable().default(null),
});

export const periodPatch = z.object({
  subject: text(120).optional(),
  teacherId: z.string().nullable().optional(),
  startTime: clock.nullable().optional(),
  endTime: clock.nullable().optional(),
  room: text(40).nullable().optional(),
});

export const uploadFields = z.object({
  kind: z.enum(["ROUTINE", "REMEDIAL", "CLUB", "NOTICE", "OTHER"]),
  title: text(160).optional(),
});

export const searchQuery = z.object({ q: z.string().trim().min(1).max(80) });

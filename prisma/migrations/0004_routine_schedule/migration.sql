-- routines can be published for a future date and switch on automatically
ALTER TYPE "RoutineStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED';

ALTER TABLE "Routine" ADD COLUMN "effectiveFrom" DATE NOT NULL DEFAULT CURRENT_DATE;
UPDATE "Routine" SET "effectiveFrom" = "publishedAt"::date;

-- MOD and Sunday/Holiday duty share one table; the type tells them apart.
CREATE TYPE "DutyType" AS ENUM ('MOD', 'HOLIDAY');

ALTER TABLE "MODDuty"
  ADD COLUMN "dutyType" "DutyType" NOT NULL DEFAULT 'MOD',
  ADD COLUMN "house" TEXT,
  ADD COLUMN "classes" TEXT,
  ADD COLUMN "offDate" DATE;

DROP INDEX "MODDuty_date_teacherId_key";
CREATE UNIQUE INDEX "MODDuty_date_teacherId_dutyType_key" ON "MODDuty"("date", "teacherId", "dutyType");

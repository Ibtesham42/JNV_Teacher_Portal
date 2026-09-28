-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'TEACHER');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('ROUTINE', 'REMEDIAL', 'CLUB', 'NOTICE', 'OTHER');

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('NOT_APPLICABLE', 'QUEUED', 'PROCESSING', 'REVIEW', 'FAILED', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RoutineStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ScheduleCategory" AS ENUM ('REMEDIAL', 'LIFE_SKILL', 'ENRICHMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "NoticePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'TEACHER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "teacherId" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Teacher" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "designation" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolDay" (
    "day" "Weekday" NOT NULL,
    "isWorking" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SchoolDay_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "UploadedDocument" (
    "id" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "title" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "pageCount" INTEGER,
    "ocrUsed" BOOLEAN NOT NULL DEFAULT false,
    "extractionStatus" "ExtractionStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionDraft" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" "ExtractionStatus" NOT NULL DEFAULT 'QUEUED',
    "stage" TEXT NOT NULL DEFAULT 'Queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT,
    "data" JSONB,
    "rawText" TEXT,
    "ocrConfidence" DOUBLE PRECISION,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtractionDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionLog" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "level" "LogLevel" NOT NULL DEFAULT 'INFO',
    "stage" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Routine" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "session" TEXT,
    "status" "RoutineStatus" NOT NULL DEFAULT 'ACTIVE',
    "documentId" TEXT,
    "uploadedById" TEXT,
    "notes" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Routine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineClass" (
    "id" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "section" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "RoutineClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutinePeriod" (
    "id" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "routineClassId" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "section" TEXT NOT NULL DEFAULT '',
    "day" "Weekday" NOT NULL,
    "slot" INTEGER NOT NULL,
    "periodNumber" INTEGER,
    "isBreak" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT,
    "startTime" TEXT,
    "endTime" TEXT,
    "subject" TEXT NOT NULL DEFAULT '',
    "subjectId" TEXT,
    "teacherId" TEXT,
    "teacherName" TEXT NOT NULL DEFAULT '',
    "room" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutinePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MODDuty" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "day" "Weekday" NOT NULL,
    "teacherId" TEXT NOT NULL,
    "teacherName" TEXT NOT NULL,
    "dutyDescription" TEXT,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MODDuty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyOff" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "day" "Weekday" NOT NULL,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priority" "NoticePriority" NOT NULL DEFAULT 'NORMAL',
    "documentId" TEXT,
    "createdById" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemedialSchedule" (
    "id" TEXT NOT NULL,
    "category" "ScheduleCategory" NOT NULL DEFAULT 'REMEDIAL',
    "className" TEXT NOT NULL,
    "section" TEXT NOT NULL DEFAULT '',
    "day" "Weekday",
    "startTime" TEXT,
    "endTime" TEXT,
    "activity" TEXT NOT NULL,
    "teacherId" TEXT,
    "teacherName" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemedialSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubActivity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "members" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "activities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_teacherId_key" ON "User"("teacherId");

-- CreateIndex
CREATE INDEX "Teacher_name_idx" ON "Teacher"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_name_key" ON "Subject"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UploadedDocument_storageKey_key" ON "UploadedDocument"("storageKey");

-- CreateIndex
CREATE INDEX "UploadedDocument_kind_createdAt_idx" ON "UploadedDocument"("kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractionDraft_documentId_key" ON "ExtractionDraft"("documentId");

-- CreateIndex
CREATE INDEX "ExtractionLog_documentId_createdAt_idx" ON "ExtractionLog"("documentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Routine_version_key" ON "Routine"("version");

-- CreateIndex
CREATE INDEX "Routine_status_idx" ON "Routine"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineClass_routineId_className_section_key" ON "RoutineClass"("routineId", "className", "section");

-- CreateIndex
CREATE INDEX "RoutinePeriod_routineId_className_section_day_idx" ON "RoutinePeriod"("routineId", "className", "section", "day");

-- CreateIndex
CREATE INDEX "RoutinePeriod_routineId_teacherId_day_idx" ON "RoutinePeriod"("routineId", "teacherId", "day");

-- CreateIndex
CREATE INDEX "MODDuty_date_idx" ON "MODDuty"("date");

-- CreateIndex
CREATE UNIQUE INDEX "MODDuty_date_teacherId_key" ON "MODDuty"("date", "teacherId");

-- CreateIndex
CREATE INDEX "WeeklyOff_day_idx" ON "WeeklyOff"("day");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyOff_teacherId_day_key" ON "WeeklyOff"("teacherId", "day");

-- CreateIndex
CREATE INDEX "Notice_archived_date_idx" ON "Notice"("archived", "date");

-- CreateIndex
CREATE INDEX "RemedialSchedule_active_className_idx" ON "RemedialSchedule"("active", "className");

-- CreateIndex
CREATE INDEX "ClubActivity_active_idx" ON "ClubActivity"("active");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedDocument" ADD CONSTRAINT "UploadedDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionDraft" ADD CONSTRAINT "ExtractionDraft_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "UploadedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionLog" ADD CONSTRAINT "ExtractionLog_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "UploadedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "UploadedDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineClass" ADD CONSTRAINT "RoutineClass_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutinePeriod" ADD CONSTRAINT "RoutinePeriod_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutinePeriod" ADD CONSTRAINT "RoutinePeriod_routineClassId_fkey" FOREIGN KEY ("routineClassId") REFERENCES "RoutineClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutinePeriod" ADD CONSTRAINT "RoutinePeriod_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutinePeriod" ADD CONSTRAINT "RoutinePeriod_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MODDuty" ADD CONSTRAINT "MODDuty_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyOff" ADD CONSTRAINT "WeeklyOff_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "UploadedDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemedialSchedule" ADD CONSTRAINT "RemedialSchedule_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemedialSchedule" ADD CONSTRAINT "RemedialSchedule_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "UploadedDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubActivity" ADD CONSTRAINT "ClubActivity_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "UploadedDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;


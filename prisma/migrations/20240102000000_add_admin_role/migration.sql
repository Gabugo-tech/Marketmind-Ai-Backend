-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- AlterTable: add role column defaulting to USER
ALTER TABLE "users" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';

-- CreateTable: login_attempts for brute-force tracking
CREATE TABLE "login_attempts" (
    "id"         TEXT NOT NULL,
    "ip"         TEXT NOT NULL,
    "email"      TEXT NOT NULL,
    "success"    BOOLEAN NOT NULL DEFAULT false,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "login_attempts_ip_created_at_idx" ON "login_attempts"("ip", "created_at");
CREATE INDEX "login_attempts_email_created_at_idx" ON "login_attempts"("email", "created_at");

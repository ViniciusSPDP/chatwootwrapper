/*
  Warnings:

  - A unique constraint covering the columns `[chatwootUrl]` on the table `Tenant` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Tenant_email_key";

-- AlterTable
ALTER TABLE "Tenant" ALTER COLUMN "name" DROP NOT NULL,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_chatwootUrl_key" ON "Tenant"("chatwootUrl");

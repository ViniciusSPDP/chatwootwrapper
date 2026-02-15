/*
  Warnings:

  - A unique constraint covering the columns `[chatwootUrl,accountId]` on the table `Tenant` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Tenant_chatwootUrl_key";

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_chatwootUrl_accountId_key" ON "Tenant"("chatwootUrl", "accountId");

-- CreateTable
CREATE TABLE "InventoryMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "variantTitle" TEXT NOT NULL,
    "available" INTEGER NOT NULL,
    "unitCost" REAL,
    "sales30d" INTEGER NOT NULL,
    "sales60d" INTEGER NOT NULL,
    "sales90d" INTEGER NOT NULL,
    "lastCalculated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMetric_shopDomain_variantId_key" ON "InventoryMetric"("shopDomain", "variantId");

-- CreateIndex
CREATE INDEX "InventoryMetric_shopDomain_lastCalculated_idx" ON "InventoryMetric"("shopDomain", "lastCalculated");

-- CreateIndex
CREATE INDEX "SyncLog_shopDomain_createdAt_idx" ON "SyncLog"("shopDomain", "createdAt");

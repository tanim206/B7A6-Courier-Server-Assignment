/*
  Warnings:

  - A unique constraint covering the columns `[hubCode]` on the table `hubs` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `hubCode` to the `hubs` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "hubs" ADD COLUMN     "hubCode" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "hubs_hubCode_key" ON "hubs"("hubCode");

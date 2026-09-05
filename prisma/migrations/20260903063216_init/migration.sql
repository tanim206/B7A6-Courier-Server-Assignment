/*
  Warnings:

  - You are about to drop the column `hubCode` on the `hubs` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "hubs_hubCode_key";

-- AlterTable
ALTER TABLE "hubs" DROP COLUMN "hubCode";

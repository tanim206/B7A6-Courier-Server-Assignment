/*
  Warnings:

  - The `additionalFiles` column on the `HubApplication` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "HubApplication" DROP COLUMN "additionalFiles",
ADD COLUMN     "additionalFiles" JSONB;

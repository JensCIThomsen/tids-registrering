-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isDepartmentLeader" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "managerId" TEXT;

-- CreateIndex
CREATE INDEX "User_companyId_isDepartmentLeader_idx" ON "User"("companyId", "isDepartmentLeader");

-- CreateIndex
CREATE INDEX "User_managerId_idx" ON "User"("managerId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

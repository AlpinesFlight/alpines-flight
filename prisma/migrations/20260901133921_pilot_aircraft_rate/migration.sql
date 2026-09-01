-- CreateTable
CREATE TABLE "PilotAircraftRate" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "aircraftId" TEXT NOT NULL,
    "customRateCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "setById" TEXT,

    CONSTRAINT "PilotAircraftRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PilotAircraftRate_studentId_aircraftId_key" ON "PilotAircraftRate"("studentId", "aircraftId");

-- AddForeignKey
ALTER TABLE "PilotAircraftRate" ADD CONSTRAINT "PilotAircraftRate_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotAircraftRate" ADD CONSTRAINT "PilotAircraftRate_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PilotAircraftRate" ADD CONSTRAINT "PilotAircraftRate_setById_fkey" FOREIGN KEY ("setById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

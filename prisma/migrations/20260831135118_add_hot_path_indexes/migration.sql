-- CreateIndex
CREATE INDEX "AccountTransaction_status_idx" ON "AccountTransaction"("status");

-- CreateIndex
CREATE INDEX "AccountTransaction_confirmedAt_idx" ON "AccountTransaction"("confirmedAt");

-- CreateIndex
CREATE INDEX "FlightLog_date_idx" ON "FlightLog"("date");

-- CreateIndex
CREATE INDEX "MaintenanceIssue_status_idx" ON "MaintenanceIssue"("status");

-- CreateIndex
CREATE INDEX "MaintenanceIssue_reportedById_idx" ON "MaintenanceIssue"("reportedById");

-- CreateIndex
CREATE INDEX "MaintenanceRecord_status_idx" ON "MaintenanceRecord"("status");

-- CreateIndex
CREATE INDEX "Reservation_aircraftId_startTime_endTime_idx" ON "Reservation"("aircraftId", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "Reservation_instructorId_startTime_endTime_idx" ON "Reservation"("instructorId", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "Reservation_status_startTime_idx" ON "Reservation"("status", "startTime");

-- CreateIndex
CREATE INDEX "queue_calls_created_at_id_idx" ON "queue_calls"("created_at", "id");

-- CreateIndex
CREATE INDEX "queue_calls_sector_id_created_at_idx" ON "queue_calls"("sector_id", "created_at");

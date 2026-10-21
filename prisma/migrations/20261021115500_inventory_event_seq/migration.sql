-- Strict order of inventory events, so "the last event" (for undo) is unambiguous even within one millisecond.
-- AlterTable
ALTER TABLE "inventory_events" ADD COLUMN     "seq" BIGSERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "inventory_events_seq_key" ON "inventory_events"("seq");


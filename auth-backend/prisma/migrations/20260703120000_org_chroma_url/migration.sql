-- Remote ChromaDB endpoint for the org's centrally synced shared memory.
ALTER TABLE "Organization" ADD COLUMN "chromaUrl" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "chapters" ADD COLUMN "document_chapter_id" TEXT;
ALTER TABLE "chapters" ADD COLUMN "document_work_id" TEXT;

-- CreateTable
CREATE TABLE "document_works" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'text',
    "status" TEXT NOT NULL DEFAULT 'importing',
    "source_storage_key" TEXT NOT NULL,
    "source_sha256" TEXT NOT NULL,
    "source_bytes" INTEGER NOT NULL,
    "source_encoding" TEXT,
    "chapter_count" INTEGER NOT NULL DEFAULT 0,
    "unassigned_count" INTEGER NOT NULL DEFAULT 0,
    "import_error" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "document_chapters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "work_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "group_label" TEXT NOT NULL,
    "start_offset" INTEGER NOT NULL,
    "end_offset" INTEGER NOT NULL,
    "char_count" INTEGER NOT NULL,
    "anomalies_json" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "document_chapters_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "document_works" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

-- CreateIndex
CREATE INDEX "ix_document_works_status_created" ON "document_works"("status" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "ix_document_chapters_work_order" ON "document_chapters"("work_id" ASC, "order" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_document_chapters_work_order" ON "document_chapters"("work_id", "order");


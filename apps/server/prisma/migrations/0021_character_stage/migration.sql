-- 角色图生成与阶段管理（CharacterStage 表 + Character.anchorAssetId）。
-- 新增角色阶段表，用于管理角色的阶段性变化（年龄/衣着/气质）；
-- Character 增加定妆照锚点字段（nullable），旧数据无需迁移，
-- 读取时 anchor_asset_id 为 null 则降级使用 preview/primary 参考图。

-- AlterTable
ALTER TABLE "characters" ADD COLUMN "anchor_asset_id" TEXT;

-- CreateTable
CREATE TABLE "character_stages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "character_id" TEXT NOT NULL,
    "stage_order" INTEGER NOT NULL,
    "name" TEXT,
    "from_chapter_id" TEXT,
    "to_chapter_id" TEXT,
    "visual_delta" TEXT NOT NULL,
    "preview_asset_id" TEXT,
    "final_asset_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "fk_character_stages_character_id__characters" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "fk_character_stages_project_id__projects" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "ck_character_stages_stage_order" CHECK (typeof("stage_order") = 'integer' AND "stage_order" >= 1),
    CONSTRAINT "ck_character_stages_visual_delta" CHECK (length(trim("visual_delta")) > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_character_stages_character_order" ON "character_stages"("character_id", "stage_order");
CREATE INDEX "ix_character_stages_project" ON "character_stages"("project_id");
CREATE INDEX "ix_character_stages_character" ON "character_stages"("character_id");

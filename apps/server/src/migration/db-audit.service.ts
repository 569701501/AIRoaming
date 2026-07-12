import { PrismaService } from "../persistence/prisma.service.js";
import { MigrationAuditService, type ComicFormatAuditResult } from "./migration-audit.service.js";
import { PrismaMigrationLedgerRepository } from "./prisma-migration-ledger.repository.js";

export class DatabaseMigrationAuditService {
  constructor(private readonly prisma: PrismaService) {}

  auditComicFormats(snapshotPath: string, options: { runId?: string; startedAt?: string } = {}): Promise<ComicFormatAuditResult> {
    return new MigrationAuditService().auditComicFormats(snapshotPath, new PrismaMigrationLedgerRepository(this.prisma), { ...options, importerVersion: "g3-m3-a1" });
  }
}

import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";

import { assertProjectPurgeRuntimeMigrationReadyV1 } from "./project-purge-runtime-migration-ledger.js";
import { assertFileModeBridgeAllowed } from "./file-mode-guard.js";

export type AiroamingPersistenceMode = "file" | "db";

function readPersistenceMode(): AiroamingPersistenceMode {
  const raw = process.env.AIROAMING_PERSISTENCE_MODE?.trim();
  if (raw === undefined || raw === "" || raw === "file") return "file";
  if (raw === "db") return "db";
  throw new Error(`AIROAMING_PERSISTENCE_MODE_UNSUPPORTED:${raw}`);
}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly mode = readPersistenceMode();
  private readonly client: PrismaClient | null;

  constructor() {
    if (this.mode === "db" && !process.env.DATABASE_URL?.trim()) {
      throw new Error("DB_PERSISTENCE_DATABASE_URL_REQUIRED");
    }
    this.client = this.mode === "db"
      ? new PrismaClient({ errorFormat: "minimal" })
      : null;
  }

  isDatabaseMode(): boolean {
    return this.mode === "db";
  }

  database(): PrismaClient {
    if (this.client === null) {
      throw new Error("DB_PERSISTENCE_NOT_ENABLED");
    }
    return this.client;
  }

  /**
   * The single business-write boundary used by DB-mode repositories.
   * PersistenceState is read and (when appropriate) marked in the same
   * SQLite transaction as the business mutation, so a rollback cannot leave
   * a false firstBusinessWriteAt timestamp behind.
   */
  async runBusinessTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (this.client === null) throw new Error("DB_PERSISTENCE_NOT_ENABLED");
    return this.client.$transaction(async (tx) => {
      const state = await tx.persistenceState.findUnique({ where: { id: "primary" } });
      if (state?.activationState === "ready_for_activation" || state?.activationState === "recovery_required") {
        throw new Error("DB_PERSISTENCE_NOT_ACTIVE");
      }
      const result = await operation(tx);
      if (state?.activationState === "db_only" && state.firstBusinessWriteAt === null) {
        await tx.persistenceState.update({
          where: { id: "primary" },
          data: { firstBusinessWriteAt: new Date() },
        });
      }
      return result;
    });
  }

  async onModuleInit(): Promise<void> {
    if (this.client === null) {
      const bridgeDatabaseUrl = process.env.AIROAMING_FILE_BRIDGE_DATABASE_URL?.trim();
      if (bridgeDatabaseUrl) await assertFileModeBridgeAllowed(bridgeDatabaseUrl);
      return;
    }
    try {
      await this.client.$connect();
      await assertProjectPurgeRuntimeMigrationReadyV1(this.client);
    } catch (error) {
      await this.client.$disconnect().catch(() => undefined);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.$disconnect();
  }
}

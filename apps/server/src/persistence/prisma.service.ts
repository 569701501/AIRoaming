import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

import { assertG1RuntimeMigrationReadyV1 } from "./g1-runtime-migration-ledger.js";

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

  async onModuleInit(): Promise<void> {
    if (this.client === null) return;
    try {
      await this.client.$connect();
      await assertG1RuntimeMigrationReadyV1(this.client);
    } catch (error) {
      await this.client.$disconnect().catch(() => undefined);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.$disconnect();
  }
}

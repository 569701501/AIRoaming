import { PrismaClient } from "@prisma/client";

/**
 * Optional bridge-release fence. Normal file mode has no DB connection; the
 * bridge explicitly opts in with AIROAMING_FILE_BRIDGE_DATABASE_URL so a
 * DB-only database can refuse an unsafe file-only restart after first write.
 */
export async function assertFileModeBridgeAllowed(databaseUrl: string): Promise<void> {
  if (!databaseUrl.startsWith("file:") || !databaseUrl.slice("file:".length).startsWith("/")) throw new Error("FILE_MODE_DATABASE_URL_INVALID");
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } }, errorFormat: "minimal" });
  try {
    await client.$connect();
    const state = await client.persistenceState.findUnique({ where: { id: "primary" } });
    if (state?.firstBusinessWriteAt !== null && state?.firstBusinessWriteAt !== undefined) throw new Error("FILE_MODE_FORBIDDEN_AFTER_FIRST_WRITE");
    if (state?.activationState === "db_only" && state.activatedAt !== null) {
      // db_only before the first business write remains a documented bridge
      // rollback window; once first write exists the check above rejects it.
      return;
    }
  } finally {
    await client.$disconnect();
  }
}


import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../persistence/prisma.service.js";

export const G2_TRANSACTION_RETRY_DELAYS_MS = [10, 30, 90] as const;

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name}:${error.message}`;
  return String(error);
}

export function isRetryableVersionTransactionError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return true;
    if (error.code === "P2028") return /busy|locked|timeout/i.test(error.message);
  }
  return /SQLITE_BUSY|SQLITE_LOCKED|database is locked|database table is locked|unique constraint failed/i.test(
    errorText(error),
  );
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

/** Only transaction orchestration lives here; no version-domain decisions. */
@Injectable()
export class VersionTransactionRunner {
  constructor(@Inject(PrismaService) private readonly prismaService: PrismaService) {}

  async run<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= G2_TRANSACTION_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        return await this.prismaService.database().$transaction(operation);
      } catch (error) {
        lastError = error;
        if (!isRetryableVersionTransactionError(error) || attempt === G2_TRANSACTION_RETRY_DELAYS_MS.length) {
          throw error;
        }
        await wait(G2_TRANSACTION_RETRY_DELAYS_MS[attempt]);
      }
    }
    throw lastError;
  }
}

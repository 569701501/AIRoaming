import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../persistence/prisma.service.js";
import { PersistentTaskRepository } from "./persistent-task.repository.js";

/**
 * Startup-only recovery seam for F2. The future provider worker can reuse the
 * repository's claim/finish APIs; recovery itself remains deterministic and
 * does not invent provider output.
 */
@Injectable()
export class PersistentTaskRecoveryService implements OnModuleInit {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(PersistentTaskRepository) private readonly repository: PersistentTaskRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.prismaService.isDatabaseMode()) return;
    await this.repository.recoverExpired();
  }
}

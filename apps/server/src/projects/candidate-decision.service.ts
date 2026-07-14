import { HttpException, Inject, Injectable } from "@nestjs/common";
import {
  CandidateLockContractError,
  parseCommitCandidateLockRequest,
  parsePreviewCandidateLockRequest,
  type CandidateLockCommitResponse,
  type CandidateLockHistoryPage,
  type CandidateLockImpactPreviewResponse,
  type CandidatePreferenceResponse,
} from "@airoaming/shared";
import { CandidateLockRepository } from "./candidate-lock.repository.js";
import { CandidateLockServiceError } from "./candidate-lock-error.js";

@Injectable()
export class CandidateDecisionService {
  constructor(@Inject(CandidateLockRepository) private readonly repository: CandidateLockRepository) {}

  workbench(projectId: string, chapterId: string) {
    return this.execute(() => this.repository.workbench({
      projectId: exactId(projectId),
      chapterId: exactId(chapterId),
    }));
  }

  preview(
    projectId: string,
    chapterId: string,
    shotId: string,
    body: unknown,
  ): Promise<CandidateLockImpactPreviewResponse> {
    return this.execute(() => this.repository.preview(
      { projectId: exactId(projectId), chapterId: exactId(chapterId) },
      exactId(shotId),
      parsePreviewCandidateLockRequest(body),
    ));
  }

  commit(
    projectId: string,
    chapterId: string,
    shotId: string,
    body: unknown,
  ): Promise<CandidateLockCommitResponse> {
    return this.execute(() => this.repository.commit(
      { projectId: exactId(projectId), chapterId: exactId(chapterId) },
      exactId(shotId),
      parseCommitCandidateLockRequest(body),
    ));
  }

  history(
    projectId: string,
    chapterId: string,
    shotId: string,
    rawLimit?: string,
    rawBeforeRevision?: string,
  ): Promise<CandidateLockHistoryPage> {
    return this.execute(() => this.repository.history(
      { projectId: exactId(projectId), chapterId: exactId(chapterId) },
      exactId(shotId),
      boundedInteger(rawLimit, 20, 1, 100),
      rawBeforeRevision === undefined ? null : boundedInteger(rawBeforeRevision, 0, 1, Number.MAX_SAFE_INTEGER),
    ));
  }

  favorite(
    projectId: string,
    chapterId: string,
    candidateId: string,
    favorite: boolean,
  ): Promise<CandidatePreferenceResponse> {
    return this.execute(() => this.repository.setFavorite(
      { projectId: exactId(projectId), chapterId: exactId(chapterId) },
      exactId(candidateId),
      favorite,
    ));
  }

  rejection(
    projectId: string,
    chapterId: string,
    candidateId: string,
    rejected: boolean,
  ): Promise<CandidatePreferenceResponse> {
    return this.execute(() => this.repository.setRejected(
      { projectId: exactId(projectId), chapterId: exactId(chapterId) },
      exactId(candidateId),
      rejected,
    ));
  }

  complete(projectId: string, chapterId: string) {
    return this.execute(() => this.repository.completeChapter({
      projectId: exactId(projectId),
      chapterId: exactId(chapterId),
    }));
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof CandidateLockContractError) {
        throw new HttpException({ success: false, error: { code: error.code, message: error.message } }, 400);
      }
      if (error instanceof CandidateLockServiceError) {
        throw new HttpException({
          success: false,
          error: { code: error.code, message: error.message, details: error.details },
        }, error.status);
      }
      throw error;
    }
  }
}

function exactId(value: string): string {
  if (!value || value.trim() !== value) {
    throw new CandidateLockContractError("CANDIDATE_LOCK_BODY_INVALID");
  }
  return value;
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) return fallback;
  if (!/^[0-9]+$/.test(value)) throw new CandidateLockContractError("CANDIDATE_LOCK_BODY_INVALID");
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw new CandidateLockContractError("CANDIDATE_LOCK_BODY_INVALID");
  }
  return result;
}

export type LayoutPublicationProgressStatus =
  | "queued"
  | "rendering"
  | "ready"
  | "failed"
  | "cancelled";

const publicationProgressRank: Record<LayoutPublicationProgressStatus, number> = {
  queued: 0,
  rendering: 1,
  ready: 2,
  failed: 2,
  cancelled: 2,
};

export function mergeLayoutPublicationSnapshot<
  T extends { id: string; status: LayoutPublicationProgressStatus },
>(current: T | null, incoming: T): T {
  if (!current || current.id !== incoming.id) return incoming;
  return publicationProgressRank[incoming.status] < publicationProgressRank[current.status]
    ? current
    : incoming;
}

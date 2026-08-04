import type {
  LayoutPreflightIssueV1,
  LayoutPreflightIssueV2,
} from "@airoaming/shared";

export type LayoutExportDialogStage = "checking" | "blocked" | "review" | "publishing" | "failed";
export type LayoutExportPreflightIssue = LayoutPreflightIssueV1 | LayoutPreflightIssueV2;

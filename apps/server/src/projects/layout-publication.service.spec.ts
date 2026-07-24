import {
  LayoutPublicationProfileCodecV1,
  type CreateLayoutPublicationRequestV1,
  type CreateLayoutPublicationRequestV2,
  type LayoutDigest,
} from "@airoaming/shared";
import { describe, expect, it } from "vitest";

import { layoutPublicationIntentMatchesRequest } from "./layout-publication.service.js";

const digest = (character: string): LayoutDigest =>
  `sha256:${character.repeat(64)}` as LayoutDigest;

const profile = {
  schemaVersion: 1,
  kind: "vertical_publication",
  outputScale: 1,
  maxSliceHeightPx: 2_048,
  cutPolicy: "prefer_section_boundary_then_exact",
  includeLongPng: true,
} as const;

const base = {
  requestId: "request-1",
  layoutRevisionId: "layout-revision-1",
  expectedCurrentLayoutRevisionId: "layout-revision-1",
  profile,
  profileDigest: LayoutPublicationProfileCodecV1.encode(profile).digest,
  preflightDigest: digest("a"),
  acknowledgedIssueKeys: [],
};

const requestV1: CreateLayoutPublicationRequestV1 = {
  schemaVersion: 1,
  ...base,
};

const requestV2: CreateLayoutPublicationRequestV2 = {
  schemaVersion: 2,
  ...base,
  expectedRevisionDocumentDigest: digest("b"),
  expectedVisibleDocumentDigest: digest("c"),
};

describe("layout publication idempotent intent", () => {
  it("never reuses a V2 task for an otherwise matching V1 request", () => {
    expect(layoutPublicationIntentMatchesRequest({
      inputSchemaVersion: 2,
      inputJson: {
        schemaVersion: 2,
        kind: "layout_publication_task_v2",
        layoutRevisionId: requestV1.layoutRevisionId,
        profileDigest: requestV1.profileDigest,
        preflightDigest: requestV1.preflightDigest,
      },
    }, requestV1)).toBe(false);
  });

  it("requires the V2 task kind as well as both document digests", () => {
    const matchingIntent = {
      schemaVersion: 2,
      layoutRevisionId: requestV2.layoutRevisionId,
      profileDigest: requestV2.profileDigest,
      preflightDigest: requestV2.preflightDigest,
      revisionDocumentDigest: requestV2.expectedRevisionDocumentDigest,
      visibleDocumentDigest: requestV2.expectedVisibleDocumentDigest,
      acknowledgedIssueKeys: [],
    };
    expect(layoutPublicationIntentMatchesRequest({
      inputSchemaVersion: 2,
      inputJson: matchingIntent,
    }, requestV2)).toBe(false);
    expect(layoutPublicationIntentMatchesRequest({
      inputSchemaVersion: 2,
      inputJson: {
        ...matchingIntent,
        kind: "layout_publication_task_v2",
      },
    }, requestV2)).toBe(true);
    expect(layoutPublicationIntentMatchesRequest({
      inputSchemaVersion: 2,
      inputJson: {
        ...matchingIntent,
        kind: "layout_publication_task_v2",
        visibleDocumentDigest: digest("d"),
      },
    }, requestV2)).toBe(false);
  });

  it("does not replay a V2 task when warning acknowledgements are missing or different", () => {
    const intent = {
      schemaVersion: 2,
      kind: "layout_publication_task_v2",
      layoutRevisionId: requestV2.layoutRevisionId,
      profileDigest: requestV2.profileDigest,
      preflightDigest: requestV2.preflightDigest,
      revisionDocumentDigest: requestV2.expectedRevisionDocumentDigest,
      visibleDocumentDigest: requestV2.expectedVisibleDocumentDigest,
    };
    const requestWithAcknowledgements: CreateLayoutPublicationRequestV2 = {
      ...requestV2,
      acknowledgedIssueKeys: ["issue_a", "issue_b"],
    };
    expect(layoutPublicationIntentMatchesRequest({
      inputSchemaVersion: 2,
      inputJson: intent,
    }, requestWithAcknowledgements)).toBe(false);
    expect(layoutPublicationIntentMatchesRequest({
      inputSchemaVersion: 2,
      inputJson: {
        ...intent,
        acknowledgedIssueKeys: ["issue_a"],
      },
    }, requestWithAcknowledgements)).toBe(false);
    expect(layoutPublicationIntentMatchesRequest({
      inputSchemaVersion: 2,
      inputJson: {
        ...intent,
        acknowledgedIssueKeys: ["issue_b", "issue_a"],
      },
    }, requestWithAcknowledgements)).toBe(true);
    expect(layoutPublicationIntentMatchesRequest({
      inputSchemaVersion: 2,
      inputJson: {
        ...intent,
        acknowledgedIssueKeys: ["issue_a", "issue_b"],
      },
    }, {
      ...requestWithAcknowledgements,
      acknowledgedIssueKeys: ["issue_b", "issue_a"],
    })).toBe(true);
  });
});

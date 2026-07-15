export const E2E_TEST_MATRIX = Object.freeze([
  Object.freeze({
    id: "file",
    persistenceMode: "file",
    testFiles: Object.freeze([
      "tests/e2e/api/workflow-api.smoke.spec.ts",
      "tests/e2e/support/browser-path-runtime.spec.ts",
      "tests/e2e/support/harness-lifecycle.spec.ts",
      "tests/e2e/web/project-library-and-stage-rail.spec.ts",
    ]),
  }),
  Object.freeze({
    id: "db",
    persistenceMode: "db",
    testFiles: Object.freeze([
      "tests/e2e/api/g2-db-web-gate.spec.ts",
      "tests/e2e/web/candidate-decision-workbench.spec.ts",
      "tests/e2e/web/layout-editor-m4.spec.ts",
      "tests/e2e/web/layout-editor-m5.spec.ts",
      "tests/e2e/web/layout-editor-m6.spec.ts",
      "tests/e2e/web/layout-publication-m7.spec.ts",
      "tests/e2e/web/layout-mobile-ai-m8.spec.ts",
    ]),
  }),
]);

export function selectE2ETestMatrix(mode) {
  if (mode === undefined) return E2E_TEST_MATRIX;
  const selected = E2E_TEST_MATRIX.find((entry) => entry.id === mode);
  if (!selected) throw new Error(`E2E_MATRIX_MODE_INVALID:${mode}`);
  return Object.freeze([selected]);
}

export function createE2EModeEnvironment(entry, inherited = process.env) {
  return {
    ...inherited,
    AIROAMING_E2E_PERSISTENCE_MODE: entry.persistenceMode,
  };
}

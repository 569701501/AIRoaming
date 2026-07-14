export interface E2ETestMatrixEntry {
  readonly id: "file" | "db";
  readonly persistenceMode: "file" | "db";
  readonly testFiles: readonly string[];
}

export const E2E_TEST_MATRIX: readonly E2ETestMatrixEntry[];

export function selectE2ETestMatrix(
  mode?: string,
): readonly E2ETestMatrixEntry[];

export function createE2EModeEnvironment(
  entry: E2ETestMatrixEntry,
  inherited?: Record<string, string | undefined>,
): Record<string, string | undefined>;

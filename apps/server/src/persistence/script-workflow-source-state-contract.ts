export const SCRIPT_WORKFLOW_SOURCE_STATE_MIGRATION_NAME =
  "0017_script_dual_flow_source_state" as const;

export const SCRIPT_WORKFLOW_SOURCE_STATE_TABLES = [
  "script_raw_source_versions",
  "script_raw_source_documents",
  "script_raw_source_blocks",
  "script_import_analysis_candidates",
  "script_chapter_maps",
  "script_import_batches",
  "script_import_batch_items",
  "script_import_fidelity_reports",
  "chapter_script_pending_source_bindings",
] as const;

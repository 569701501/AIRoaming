上一次输出未通过 `creative.ideation/1.0` 格式校验。只修复格式，不改变三套创意的语义。

只返回严格 JSON；顶层只能有 `seeds`；`seeds` 必须恰好 {{SEED_COUNT}} 项；每项只含 `title`、`genreTags`、`logline`、`keyConflict`、`visualHook`、`firstChapterDirection`。不要代码块或解释。

校验错误：{{VALIDATION_ERROR}}

待修复输出：
{{INVALID_OUTPUT}}

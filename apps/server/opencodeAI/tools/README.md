# AI漫游 OpenCode 工具占位

该目录用于后续放置暴露给 OpenCode runtime 的受控业务工具封装。

第一阶段不直接搬 Aurora 的工具。AI漫游工具应转发到本项目后端 API，并遵守以下边界：

- 不暴露本地物理路径。
- 不允许 agent 直接写 `workspace/projects/*`。
- 所有写入必须返回 AI漫游标准工具结果，包含 `threadId`、`messageId`、`toolCallId` 和影响范围。

计划中的剧本阶段工具：

| 工具 | 职责 |
| --- | --- |
| `analyze_script_import` | 分析上传/粘贴文本是否适合导入章节 |
| `import_script_to_chapters` | 在分析通过后写入章节草稿 |
| `read_current_chapter` | 读取当前章节草稿 |
| `generate_inspiration_seeds` | 调用 `script-inspiration-seeding` 生成 3 个可选灵感方向，不写章节 |
| `generate_script_outline_from_seed` | 用户选中灵感方向后，调用 `script-outline-drafting` 生成项目级剧本大纲并保存到项目下 |
| `generate_script_from_outline` | 用户确认项目级剧本大纲后，调用 `script-chapter-drafting` 只生成当前一章并记录来源 |
| `update_chapter_draft` | 用户要求章节内改写时，调用 `script-chapter-editing` 更新当前章节草稿并记录来源 |

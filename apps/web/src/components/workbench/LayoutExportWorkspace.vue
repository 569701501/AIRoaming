<template>
  <section class="layout-editor" data-testid="layout-editor-shell" aria-label="成稿编辑器">
    <header class="editor-topbar">
      <div class="chapter-picker">
        <LayoutTemplate :size="17" />
        <select :value="chapterId ?? ''" :disabled="loading" @change="selectChapter">
          <option v-for="chapter in chapters" :key="chapter.id" :value="chapter.id">
            {{ chapter.title }}
          </option>
        </select>
        <span class="format-badge">{{ formatLabel }}</span>
      </div>

      <div class="editor-status" :class="`is-${session.saveState.value}`">
        <span class="status-dot" />
        {{ saveStateLabel }}
        <small v-if="session.server.value">v{{ session.server.value.rowVersion }}</small>
      </div>

      <div class="top-actions">
        <button type="button" :disabled="!session.canUndo.value" title="撤销" aria-label="撤销" @click="session.undo">
          <Undo2 :size="16" />
        </button>
        <button type="button" :disabled="!session.canRedo.value" title="重做" aria-label="重做" @click="session.redo">
          <Redo2 :size="16" />
        </button>
        <button type="button" :disabled="!session.isDirty.value || session.isReadOnly.value" @click="session.flush">
          <CloudUpload :size="16" />
          立即保存
        </button>
        <button
          type="button"
          :disabled="session.isReadOnly.value || !canBatchInitialize"
          title="按当前 G4 定稿批量建立页面或条漫段落"
          @click="batchInitializeFromSources"
        >生成排版</button>
        <button type="button" :disabled="session.isReadOnly.value || !session.server.value || m6Busy" @click="prepareRevision">保存版本</button>
        <button type="button" :disabled="session.isReadOnly.value || session.isDirty.value || !currentLayoutRevisionId || publicationBusy" @click="preparePublication">正式出版</button>
        <button type="button" :disabled="!session.server.value" title="打开独立手机只读预览" @click="openMobilePreview"><Smartphone :size="16" />手机预览</button>
        <button
          type="button"
          :aria-expanded="aiDrawerOpen"
          aria-controls="layout-ai-drawer"
          :disabled="session.isReadOnly.value || !session.server.value"
          title="打开 AI 成稿建议"
          @click="openAiDrawer"
        ><Sparkles :size="16" />AI 建议</button>
        <button
          type="button"
          :aria-expanded="m6PanelOpen"
          aria-controls="layout-m6-control-center"
          :disabled="!session.server.value"
          title="版本、预检与出版管理"
          @click="m6PanelOpen = !m6PanelOpen"
        ><History :size="16" />版本与出版</button>
      </div>
    </header>

    <aside
      v-if="aiDrawerOpen"
      id="layout-ai-drawer"
      class="layout-ai-drawer"
      data-testid="layout-ai-drawer"
      aria-label="AI 成稿建议"
    >
      <header>
        <div><Sparkles :size="18" /><strong>AI 成稿建议</strong></div>
        <button type="button" aria-label="关闭 AI 成稿建议" @click="aiDrawerOpen = false">×</button>
      </header>
      <p>建议只读取最近一次成功保存的草稿。应用前会再次核对行版本、文档摘要和来源摘要；AI 不能保存正式版本或发起出版。</p>
      <div v-if="aiBusy" class="ai-pending-state"><LoaderCircle class="spin" :size="18" />正在核对建议…</div>
      <section v-else-if="session.pendingCommand.value" class="ai-command-preview" data-testid="layout-ai-command-preview">
        <strong>{{ session.pendingCommand.value.payload.summary }}</strong>
        <small>before {{ shortDigest(session.pendingCommand.value.payload.baseDocumentDigest) }} → after {{ shortDigest(session.pendingCommand.value.payload.resultDocumentDigest) }}</small>
        <p>影响对象：{{ session.pendingCommand.value.payload.changedElementIds.join('、') || '无' }}</p>
        <ul v-if="session.pendingCommand.value.payload.warnings.length">
          <li v-for="warning in session.pendingCommand.value.payload.warnings" :key="warning">{{ warning }}</li>
        </ul>
        <div>
          <button type="button" :disabled="aiBusy" @click="discardAiSuggestion">放弃建议</button>
          <button class="primary-action" type="button" :disabled="aiBusy" @click="applyAiSuggestion">应用为一次可撤销操作</button>
        </div>
      </section>
      <section v-else class="ai-empty-state">
        <strong>没有待确认建议</strong>
        <p>先选择一个未锁定对象，可生成一次小幅构图微调的受控命令预览。来源换图不会走这里，必须使用来源返修预览。</p>
        <button type="button" :disabled="!canSuggestCenter || aiBusy" @click="previewCenterSuggestion">预览构图微调建议</button>
      </section>
    </aside>

    <section
      v-if="sourceAttention"
      class="layout-source-attention"
      data-testid="candidate-source-status"
      aria-label="候选来源状态"
    >
      <AlertTriangle :size="19" />
      <div>
        <strong>{{ sourceAttention.title }}</strong>
        <p>{{ sourceAttention.message }}</p>
        <small>旧排版、旧版本和旧导出保持不变；可在下方先预览换图及裁切，再显式提交到当前草稿。</small>
      </div>
      <button type="button" :disabled="loading" @click="$emit('goCandidates')">查看候选定稿</button>
      <button
        v-if="replaceableImageElementIds.length"
        type="button"
        :disabled="session.isReadOnly.value || m6Busy"
        @click="previewStaleReplacement(false)"
      >预览全部替换</button>
    </section>

    <div v-if="session.isReadOnly.value" class="mobile-readonly">
      <Smartphone :size="22" />
      <div>
        <strong>手机端只读</strong>
        <p>当前宽度只展示最近一次数据库保存结果，不会发送初始化或保存请求。请使用至少 1024px 宽的窗口编辑。</p>
      </div>
    </div>

    <div v-if="session.saveState.value === 'conflict'" class="conflict-banner" role="alert">
      <AlertTriangle :size="20" />
      <div>
        <strong>检测到另一个标签页更新了草稿</strong>
        <p>自动保存已暂停，本地内容没有覆盖服务端。请先下载恢复副本，再选择处理方式。</p>
      </div>
      <button type="button" @click="session.downloadRecovery">下载本地恢复副本</button>
      <button type="button" @click="session.reloadServer">重新加载服务端</button>
      <button class="danger-action" type="button" @click="session.keepLocalAndRetry">明确保留本地</button>
    </div>

    <div v-if="session.errorMessage.value || actionError || fontLoader.loadError.value" class="error-banner" role="alert">
      {{ actionError || session.errorMessage.value || fontLoader.loadError.value }}
    </div>

    <section v-if="session.server.value && m6PanelOpen" class="m6-control-center" data-testid="layout-m6-control-center" aria-label="来源返修与版本管理">
      <div class="m6-panel-head">
        <strong>版本与出版管理</strong>
        <button type="button" aria-label="收起版本与出版管理" @click="m6PanelOpen = false"><X :size="15" /></button>
      </div>
      <article class="m6-card source-repair-card">
        <header>
          <div><strong>来源返修</strong><small>{{ replaceableImageElementIds.length ? `${replaceableImageElementIds.length} 个图片待处理` : '来源已是当前定稿' }}</small></div>
          <span :class="`tone-${sourceResolutionTone}`">{{ sourceStateLabel }}</span>
        </header>
        <label>
          裁切处理
          <select v-model="replacementCropMode" :disabled="m6Busy || session.isReadOnly.value">
            <option value="preserve_normalized_crop">保留现有裁切并自动补足覆盖</option>
            <option value="reset_cover">重置为居中覆盖</option>
          </select>
        </label>
        <div class="m6-actions">
          <button type="button" :disabled="!selectedStaleImageId || m6Busy || session.isReadOnly.value" @click="previewStaleReplacement(true)">预览所选</button>
          <button type="button" :disabled="!replaceableImageElementIds.length || m6Busy || session.isReadOnly.value" @click="previewStaleReplacement(false)">预览全部</button>
        </div>
        <div v-if="session.sourceReplacementPreview.value" class="replacement-preview" data-testid="source-replacement-preview">
          <strong>不会改写旧版本：确认后只更新当前草稿</strong>
          <p>共 {{ session.sourceReplacementPreview.value.items.length }} 项，结果摘要 {{ shortDigest(session.sourceReplacementPreview.value.resultDocumentDigest) }}</p>
          <ul>
            <li v-for="item in session.sourceReplacementPreview.value.items" :key="item.imageElementId">
              {{ item.imageElementId }} · {{ item.cropMode === 'reset_cover' ? '重置裁切' : '保留裁切' }}
              <span v-if="item.warningCodes.length">· {{ item.warningCodes.map(replacementWarningLabel).join('、') }}</span>
            </li>
          </ul>
          <button class="primary-action" type="button" :disabled="m6Busy || session.isReadOnly.value" @click="commitStaleReplacement">确认提交替换</button>
        </div>
      </article>

      <article class="m6-card preflight-card">
        <header>
          <div><strong>正式版本预检</strong><small>存在错误时无法保存；警告需逐项确认</small></div>
          <span v-if="session.preflight.value" :class="`tone-${session.preflight.value.status}`">{{ preflightStatusLabel }}</span>
        </header>
        <button type="button" :disabled="m6Busy || session.isReadOnly.value" @click="prepareRevision">重新预检</button>
        <div v-if="session.preflight.value" class="preflight-result" data-testid="layout-preflight-result">
          <p v-if="!session.preflight.value.issues.length">未发现阻断项或警告，可以保存正式版本。</p>
          <label v-for="issue in session.preflight.value.issues" :key="issue.issueKey" class="issue-row" :class="`severity-${issue.severity}`">
            <input
              v-if="issue.requiresAcknowledgement"
              v-model="acknowledgedIssueKeys"
              type="checkbox"
              :value="issue.issueKey"
              :disabled="m6Busy || session.isReadOnly.value"
            />
            <span v-else class="issue-marker">{{ issue.severity === 'error' ? '×' : '·' }}</span>
            <span><strong>{{ preflightIssueLabel(issue.code) }}</strong><small>{{ issue.elementId || issue.shotId || issue.canvasId || '文档级检查' }}</small></span>
          </label>
          <button class="primary-action" type="button" :disabled="!canCreateRevision || m6Busy || session.isReadOnly.value" @click="saveRevision">
            {{ missingAcknowledgementCount ? `还需确认 ${missingAcknowledgementCount} 项警告` : '保存不可变版本' }}
          </button>
        </div>
      </article>

      <article class="m6-card history-card">
        <header>
          <div><strong>版本历史</strong><small>恢复只覆盖当前草稿，不影响正式版本</small></div>
          <span>{{ session.revisionHistory.value?.items.length ?? 0 }}</span>
        </header>
        <p v-if="!session.revisionHistory.value?.items.length" class="muted-copy">尚无正式版本。</p>
        <div v-else class="revision-list" data-testid="layout-revision-history">
          <section v-for="revision in session.revisionHistory.value.items" :key="revision.id">
            <div>
              <strong>版本 {{ revision.revision }}</strong>
              <small>{{ revision.sourceResolution === 'current' ? '来源当前' : revision.sourceResolution === 'stale' ? '来源已更新' : '来源不可解析' }} · {{ revision.saveReason === 'legacy_import' ? '旧版导入' : '用户保存' }}</small>
            </div>
            <span v-if="revision.id === session.revisionHistory.value.currentLayoutRevisionId">当前正式</span>
            <button type="button" :disabled="m6Busy || session.isReadOnly.value" @click="restoreRevision(revision.id, revision.revision)">恢复到草稿</button>
          </section>
        </div>
      </article>

      <article class="m6-card publication-card" data-testid="layout-publication-center">
        <header>
          <div><strong>正式出版</strong><small>{{ isPaged ? '逐页 PNG + PDF' : '条漫切片 + 条件长图' }}；只读取当前不可变版本</small></div>
          <span v-if="publicationPreflight" :class="`tone-${publicationPreflight.status}`">{{ publicationStatusLabel }}</span>
        </header>
        <button type="button" :disabled="publicationBusy || session.isReadOnly.value || !currentLayoutRevisionId" @click="preparePublication">运行导出预检</button>
        <div v-if="publicationPreflight" class="preflight-result" data-testid="layout-publication-preflight">
          <p v-if="!publicationPreflight.issues.length">导出门禁已通过，可以提交持久出版任务。</p>
          <label v-for="issue in publicationPreflight.issues" :key="issue.issueKey" class="issue-row" :class="`severity-${issue.severity}`">
            <input
              v-if="issue.requiresAcknowledgement"
              v-model="publicationAcknowledgedIssueKeys"
              type="checkbox"
              :value="issue.issueKey"
              :disabled="publicationBusy || session.isReadOnly.value"
            />
            <span v-else class="issue-marker">{{ issue.severity === 'error' ? '×' : '·' }}</span>
            <span><strong>{{ preflightIssueLabel(issue.code) }}</strong><small>{{ issue.elementId || issue.shotId || issue.canvasId || '文档级检查' }}</small></span>
          </label>
          <button class="primary-action" type="button" :disabled="!canPublish || publicationBusy || session.isReadOnly.value" @click="publishCurrentRevision">
            {{ publicationMissingAcknowledgementCount ? `还需确认 ${publicationMissingAcknowledgementCount} 项警告` : publicationBusy ? '正在提交…' : '开始正式出版' }}
          </button>
        </div>
        <p v-if="!publicationHistory?.items.length" class="muted-copy">尚无正式出版记录。</p>
        <div v-else class="revision-list publication-list" data-testid="layout-publication-history">
          <section v-for="publication in publicationHistory.items" :key="publication.id">
            <div>
              <strong>出版 {{ publication.revision }} · {{ publicationStateLabel(publication.status) }}</strong>
              <small>版面 v{{ revisionNumber(publication.layoutRevisionId) }} · {{ publication.completionApplicability === 'historical' ? '历史结果' : publication.revisionPosition === 'current' ? '当前成品' : '等待完成' }}</small>
              <nav v-if="publication.status === 'ready'" class="publication-artifacts" aria-label="出版产物">
                <a v-for="artifact in publication.artifacts" :key="artifact.assetId" :href="publicationArtifactUrl(publication.id, artifact.assetId)" target="_blank" rel="noopener">{{ artifactLabel(artifact.role, artifact.order) }}</a>
              </nav>
            </div>
            <span v-if="publication.revisionPosition === 'current'">当前</span>
            <button v-if="publication.status === 'queued' || publication.status === 'rendering'" type="button" :disabled="publicationBusy" @click="cancelPublication(publication.id)">取消</button>
          </section>
        </div>
      </article>
    </section>

    <section v-if="session.saveState.value === 'loading'" class="center-state">
      <LoaderCircle class="spin" :size="28" />
      <strong>正在读取数据库草稿</strong>
    </section>

    <section v-else-if="session.saveState.value === 'missing'" class="create-draft">
      <div v-if="session.legacyStatus.value" class="create-card legacy-cutover-card" data-testid="layout-legacy-cutover">
        <AlertTriangle :size="30" />
        <h2>{{ session.legacyStatus.value.state === 'legacy_convertible' ? '发现可转换的旧排版' : '旧排版来源无法完整解析' }}</h2>
        <p v-if="session.legacyStatus.value.state === 'legacy_convertible'">系统会保留旧页面尺寸、顺序和已核对来源，把内容转换为 V1 数据库草稿；不会自动创建正式版本。</p>
        <p v-else>系统不会把缺失的旧候选来源猜成当前来源。只有你明确确认后，才会使用当前 G4 定稿重新建立草稿；旧 metadata 与迁移 provenance 继续保留。</p>
        <small>旧摘要：{{ session.legacyStatus.value.legacyDocumentDigest ? shortDigest(session.legacyStatus.value.legacyDocumentDigest) : '无' }} · provenance {{ session.legacyStatus.value.provenancePreserved ? '已保留' : '待核对' }}</small>
        <button
          v-if="session.legacyStatus.value.state === 'legacy_convertible'"
          class="primary-action"
          type="button"
          :disabled="session.isReadOnly.value || legacyCutoverBusy"
          @click="convertLegacyDraft"
        >转换为 V1 草稿</button>
        <button
          v-else
          class="primary-action"
          type="button"
          :disabled="session.isReadOnly.value || legacyCutoverBusy || !canInitialize"
          @click="rebuildLegacyDraft"
        >明确使用当前定稿重建</button>
        <button type="button" @click="$emit('goCandidates')">返回候选图核对来源</button>
      </div>
      <div v-else class="create-card">
        <LayoutPanelTop :size="30" />
        <h2>创建成稿草稿</h2>
        <p>草稿只保存在目标数据库，不会生成正式版本，也不会写入旧 layout.json。</p>
        <label>
          初始内容
          <select v-model="initializationMode" :disabled="session.isReadOnly.value">
            <option value="default_storyboard_layout">按当前分镜建立基础排版</option>
            <option value="blank">创建空白草稿</option>
          </select>
        </label>
        <div class="profile-grid">
          <label>
            宽度
            <input v-model.number="profileWidth" type="number" min="320" max="8192" :disabled="session.isReadOnly.value" />
          </label>
          <label>
            {{ isPaged ? '高度' : '默认段高' }}
            <input v-model.number="profileHeight" type="number" min="320" max="16384" :disabled="session.isReadOnly.value" />
          </label>
        </div>
        <button class="primary-action" type="button" :disabled="session.isReadOnly.value || !canInitialize" @click="initializeDraft">
          创建数据库草稿
        </button>
        <button type="button" @click="$emit('goCandidates')">返回候选图检查来源</button>
      </div>
    </section>

    <div v-else-if="session.document.value && session.currentCanvas.value" class="editor-shell" :class="{ 'is-readonly': session.isReadOnly.value }">
      <nav class="tool-rail" aria-label="画布工具">
        <button :class="{ 'is-active': activeTool === 'select' }" type="button" title="选择" aria-label="选择工具" @click="activeTool = 'select'"><MousePointer2 :size="18" /></button>
        <button type="button" title="平移" aria-label="平移工具"><Hand :size="18" /></button>
        <span />
        <button type="button" :disabled="session.isReadOnly.value" title="添加空画格" aria-label="添加空画格" @click="addPanel"><SquareDashed :size="18" /></button>
        <button type="button" :disabled="session.isReadOnly.value || !selectedSource" title="添加所选镜头为自由图片" aria-label="添加所选镜头为自由图片" @click="selectedSource && addFreeImage(selectedSource)"><ImageIcon :size="18" /></button>
        <button type="button" :class="{ 'is-active': activeTool === 'text' }" :disabled="session.isReadOnly.value" title="添加文字" aria-label="添加文字" @click="addText"><Type :size="18" /></button>
        <button type="button" :disabled="session.isReadOnly.value" title="添加气泡" aria-label="添加气泡" @click="addBalloon"><MessageCircle :size="18" /></button>
      </nav>

      <aside class="canvas-navigation">
        <div class="panel-heading">
          <strong>{{ isPaged ? '页面' : '条漫段落' }}</strong>
          <small>{{ session.document.value.canvases.length }}</small>
        </div>
        <div
          v-for="(canvas, index) in session.document.value.canvases"
          :key="canvas.id"
          class="canvas-nav-item"
          :class="{ 'is-active': canvas.id === session.selectedCanvasId.value }"
          @click="session.selectCanvas(canvas.id)"
        >
          <span>{{ index + 1 }}</span>
          <div>
            <strong>{{ canvas.name }}</strong>
            <small>{{ canvas.width }} × {{ canvas.height }}</small>
          </div>
          <div class="canvas-nav-actions">
            <button type="button" :disabled="session.isReadOnly.value" :aria-label="`复制${canvas.name}`" title="复制画布" @click.stop="duplicateCanvas(canvas.id)">＋</button>
            <button type="button" :disabled="session.isReadOnly.value || index === 0" :aria-label="`${canvas.name}前移`" title="前移" @click.stop="moveCanvas(canvas.id, 'up')"><ChevronUp :size="13" /></button>
            <button type="button" :disabled="session.isReadOnly.value || index === session.document.value.canvases.length - 1" :aria-label="`${canvas.name}后移`" title="后移" @click.stop="moveCanvas(canvas.id, 'down')"><ChevronDown :size="13" /></button>
          </div>
        </div>
        <div class="canvas-list-actions">
          <button type="button" :disabled="session.isReadOnly.value" @click="addCanvas">新增{{ isPaged ? '页面' : '段落' }}</button>
          <button type="button" :disabled="session.isReadOnly.value || !canBatchInitialize" @click="batchInitializeFromSources">按镜头排版</button>
        </div>

        <section class="shot-tray" data-testid="shot-tray" aria-label="镜头素材栏">
          <div class="panel-heading">
            <strong>镜头素材</strong>
            <small>{{ sourceCatalogItems.length }}</small>
          </div>
          <p v-if="!sourceCatalogItems.length">当前定稿来源不可用；旧 lock 不会被恢复使用。</p>
          <article
            v-for="item in sourceCatalogItems"
            :key="item.source.shotId"
            :class="{ 'is-selected': selectedSource?.source.shotId === item.source.shotId }"
            @click="selectedSourceShotId = item.source.shotId"
          >
            <img :src="api.projectAssetFileUrl(snapshot.project.id, item.source.assetId)" :alt="`镜头 ${item.order}`" />
            <div>
              <strong>镜头 {{ item.order }}</strong>
              <small>{{ placementCount(item.source.shotId) ? `已放置 ${placementCount(item.source.shotId)} 处` : '未放置' }}</small>
            </div>
            <div class="shot-actions">
              <button type="button" :disabled="session.isReadOnly.value || !emptyTargetPanel" @click.stop="attachSourceToPanel(item)">放入画格</button>
              <button type="button" :disabled="session.isReadOnly.value" @click.stop="addFreeImage(item)">自由图</button>
              <button type="button" :disabled="session.isReadOnly.value || !canReplacePrimarySource" @click.stop="replacePrimarySource(item)">替换</button>
            </div>
          </article>
        </section>
        <div class="source-summary">
          <strong>来源状态</strong>
          <span>{{ sourceStateLabel }}</span>
          <button v-if="sourceNeedsAttention" type="button" @click="$emit('goCandidates')">查看候选定稿</button>
        </div>
      </aside>

      <main class="canvas-workspace">
        <div class="canvas-toolbar">
          <div>
            <button type="button" :disabled="session.selectedElementIds.value.length < 2 || session.isReadOnly.value" @click="alignSelected('left')">左对齐</button>
            <button type="button" :disabled="session.selectedElementIds.value.length < 2 || session.isReadOnly.value" @click="alignSelected('center')">水平居中</button>
            <button type="button" :disabled="session.selectedElementIds.value.length < 2 || session.isReadOnly.value" @click="alignSelected('top')">顶对齐</button>
            <button type="button" :disabled="session.selectedElementIds.value.length < 3 || session.isReadOnly.value" @click="distributeHorizontal">水平分布</button>
            <button type="button" :disabled="!primaryElement || session.isReadOnly.value" @click="duplicatePrimaryElement">复制对象</button>
          </div>
          <label>
            缩放
            <input v-model.number="session.zoom.value" type="range" min="0.1" max="0.6" step="0.02" />
            <span>{{ Math.round(session.zoom.value * 100) }}%</span>
          </label>
        </div>
        <div
          class="stage-scroll"
          @pointermove="moveDrag"
          @pointerup="finishDrag"
          @pointercancel="cancelDrag"
        >
          <div
            class="document-canvas"
            :style="canvasStyle"
            @pointerdown.self="session.selectedElementIds.value = []"
          >
            <article
              v-for="element in visibleElements"
              :key="element.id"
              class="canvas-element"
              :class="[`type-${element.type}`, { 'is-selected': isSelected(element.id), 'is-locked': element.locked, 'has-text-overflow': textIssueElementIds.has(element.id) }]"
              :style="[elementStyle(element), panelFrameStyle(element)]"
              :aria-label="`${element.name}${element.locked ? '，已锁定' : ''}${element.hidden ? '，已隐藏' : ''}`"
              tabindex="0"
              @pointerdown.stop="startDrag($event, element)"
              @keydown.enter.stop="session.selectElement(element.id, $event.shiftKey)"
              @keydown.space.prevent.stop="session.selectElement(element.id, $event.shiftKey)"
            >
              <template v-if="element.type === 'panel_frame'">
                <img
                  v-if="element.contentImage && !element.contentImage.hidden"
                  :src="api.projectAssetFileUrl(snapshot.project.id, element.contentImage.source.assetId)"
                  :alt="element.contentImage.name"
                  :style="imagePreviewStyle(element)"
                  draggable="false"
                />
                <span v-else>空画格</span>
              </template>
              <img
                v-else-if="element.type === 'free_image'"
                :src="api.projectAssetFileUrl(snapshot.project.id, element.source.assetId)"
                :alt="element.name"
                :style="imagePreviewStyle(element)"
                draggable="false"
              />
              <LayoutElementTextPreview
                v-else-if="element.type === 'text' || element.type === 'balloon'"
                :element="element"
                :fallback-font-asset-ids="session.document.value.fontPolicy.fallbackFontAssetIds"
                :scale="session.zoom.value"
                :overflow="textIssueElementIds.has(element.id)"
              />
              <span v-if="element.locked" class="lock-mark"><Lock :size="12" /></span>
            </article>
          </div>
        </div>
      </main>

      <aside class="inspector">
        <div class="inspector-tabs">
          <button type="button" :class="{ 'is-active': inspectorTab === 'properties' }" @click="inspectorTab = 'properties'">属性</button>
          <button type="button" :class="{ 'is-active': inspectorTab === 'layers' }" @click="inspectorTab = 'layers'">图层</button>
        </div>

        <div v-if="inspectorTab === 'properties'" class="property-panel">
          <section class="special-properties profile-resize" data-testid="layout-profile-resize-preview" aria-label="画布尺寸预览">
            <div class="section-heading">
              <strong>画布尺寸</strong>
              <small>先预览，再作为一次可撤销命令应用</small>
            </div>
            <div class="number-grid">
              <label>宽度 <input v-model.number="resizeWidth" type="number" min="320" :max="isPaged ? 8192 : 4096" :disabled="session.isReadOnly.value" /></label>
              <label>{{ isPaged ? '高度' : '新段默认高' }} <input v-model.number="resizeHeight" type="number" min="320" max="8192" :disabled="session.isReadOnly.value" /></label>
            </div>
            <label>已有内容处理
              <select v-model="resizeMode" :disabled="session.isReadOnly.value">
                <option value="keep_coordinates">保留坐标</option>
                <option value="scale_uniform">等比缩放</option>
              </select>
            </label>
            <p v-if="profileResizeResult.preview" aria-live="polite">
              {{ profileResizeResult.preview.mode === 'scale_uniform' ? '已有内容将等比缩放' : '已有内容坐标不变' }}；
              {{ isPaged ? `全部页面变为 ${resizeWidth} × ${resizeHeight}` : `已有段落保持独立文档坐标，新段默认高 ${resizeHeight}` }}。
            </p>
            <p v-else role="alert">{{ profileResizeResult.error }}</p>
            <button type="button" :disabled="session.isReadOnly.value || !profileResizeResult.preview" @click="applyProfileResize">应用尺寸调整（可撤销）</button>
            <template v-if="!isPaged">
              <label>当前段高度
                <input v-model.number="currentSectionHeight" type="number" min="320" max="8192" :disabled="session.isReadOnly.value" />
              </label>
              <button type="button" :disabled="session.isReadOnly.value || currentSectionHeight < 320" @click="applyCurrentSectionHeight">调整当前段高（可撤销）</button>
            </template>
          </section>

          <section class="preset-picker" data-testid="layout-preset-picker">
            <div class="section-heading">
              <strong>画格模板</strong>
              <small>不删除文字、气泡或自由图</small>
            </div>
            <div class="preset-grid">
              <button
                v-for="preset in presetOptions"
                :key="preset.id"
                type="button"
                :class="{ 'is-active': selectedPresetId === preset.id }"
                :disabled="session.isReadOnly.value"
                @click="selectedPresetId = preset.id"
              >{{ preset.label }}<small>{{ preset.count }} 格</small></button>
            </div>
            <p>{{ presetPreviewLabel }}</p>
            <button type="button" :disabled="session.isReadOnly.value || !canApplyPreset" @click="applySelectedPreset">应用到当前画布</button>
          </section>

          <template v-if="primaryElement">
            <div class="selection-title">
              <strong>{{ primaryElement.name }}</strong>
              <small>{{ primaryElement.type }}</small>
            </div>
            <div class="number-grid">
              <label>X <input :value="primaryElement.transform.x" type="number" :disabled="cannotEditPrimary" @change="updateTransform('x', $event)" /></label>
              <label>Y <input :value="primaryElement.transform.y" type="number" :disabled="cannotEditPrimary" @change="updateTransform('y', $event)" /></label>
              <label>宽 <input :value="primaryElement.transform.width" type="number" min="1" :disabled="cannotEditPrimary" @change="updateTransform('width', $event)" /></label>
              <label>高 <input :value="primaryElement.transform.height" type="number" min="1" :disabled="cannotEditPrimary" @change="updateTransform('height', $event)" /></label>
              <label>旋转 <input :value="primaryElement.transform.rotation" type="number" :disabled="cannotEditPrimary" @change="updateTransform('rotation', $event)" /></label>
              <label>透明 <input :value="primaryElement.transform.opacity" type="number" min="0" max="1" step="0.05" :disabled="cannotEditPrimary" @change="updateTransform('opacity', $event)" /></label>
            </div>
            <div class="property-actions">
              <button type="button" :disabled="session.isReadOnly.value" @click="setSelectedLocked(!primaryElement.locked)">
                {{ primaryElement.locked ? '解除锁定' : '锁定对象' }}
              </button>
              <button type="button" :disabled="session.isReadOnly.value || primaryElement.locked" @click="setSelectedHidden(true)">隐藏对象</button>
              <button type="button" :disabled="session.isReadOnly.value || primaryElement.locked" @click="deletePrimaryElement">删除对象</button>
            </div>

            <section v-if="primaryElement.type === 'panel_frame'" class="special-properties">
              <div class="section-heading"><strong>画格</strong><small>图片内嵌于画格</small></div>
              <label>形状
                <select :value="primaryElement.shape.kind" :disabled="cannotEditPrimary" @change="setPanelShape($event)">
                  <option value="rect">直角</option>
                  <option value="rounded_rect">圆角</option>
                </select>
              </label>
              <div class="number-grid">
                <label>圆角 <input :value="primaryElement.shape.cornerRadius" type="number" min="0" :disabled="cannotEditPrimary || primaryElement.shape.kind === 'rect'" @change="setPanelCornerRadius($event)" /></label>
                <label>边框 <input :value="primaryElement.border.width" type="number" min="0" :disabled="cannotEditPrimary" @change="setPanelBorderWidth($event)" /></label>
              </div>
              <div class="property-actions">
                <button type="button" :disabled="session.isReadOnly.value || primaryElement.locked || !primaryElement.contentImage" @click="detachPanelImage">分离为自由图</button>
                <button type="button" :disabled="session.isReadOnly.value || !canAttachSelectedFreeToPanel" @click="attachSelectedFreeToPanel">自由图放回画格</button>
              </div>
            </section>

            <section v-if="primaryImage" class="special-properties" data-testid="crop-controls">
              <div class="section-heading"><strong>图片与裁切</strong><small>源文件不会改写</small></div>
              <label v-if="primaryElement.type === 'free_image'">显示方式
                <select :value="primaryElement.display.mode" :disabled="cannotEditPrimary" @change="setFreeImageDisplay($event)">
                  <option value="contain">完整显示</option>
                  <option value="cover">铺满裁切</option>
                </select>
              </label>
              <template v-if="primaryCrop">
                <div class="number-grid">
                  <label>缩放 <input :value="primaryCrop.zoom" type="number" min="1" step="0.05" :disabled="cannotEditPrimary" @change="updateCropNumber('zoom', $event)" /></label>
                  <label>旋转 <input :value="primaryCrop.rotation" type="number" step="1" :disabled="cannotEditPrimary" @change="updateCropNumber('rotation', $event)" /></label>
                  <label>水平偏移 <input :value="primaryCrop.offsetX" type="number" step="1" :disabled="cannotEditPrimary" @change="updateCropNumber('offsetX', $event)" /></label>
                  <label>垂直偏移 <input :value="primaryCrop.offsetY" type="number" step="1" :disabled="cannotEditPrimary" @change="updateCropNumber('offsetY', $event)" /></label>
                </div>
                <div class="property-actions">
                  <button type="button" :disabled="cannotEditPrimary" @click="toggleCropFlip('flipX')">{{ primaryCrop.flipX ? '取消水平翻转' : '水平翻转' }}</button>
                  <button type="button" :disabled="cannotEditPrimary" @click="toggleCropFlip('flipY')">{{ primaryCrop.flipY ? '取消垂直翻转' : '垂直翻转' }}</button>
                  <button type="button" :disabled="cannotEditPrimary" @click="resetCrop">重置铺满</button>
                </div>
                <p>{{ cropCoverageLabel }}</p>
              </template>
              <button
                v-if="primaryElement.type === 'free_image'"
                type="button"
                :disabled="session.isReadOnly.value || primaryElement.locked || !emptyTargetPanel"
                @click="attachPrimaryFreeToPanel"
              >放入空画格</button>
            </section>

            <LayoutRichTextEditor
              v-if="primaryElement.type === 'text' || primaryElement.type === 'balloon'"
              :model-value="primaryElement.richText"
              :font-catalog="session.fontCatalog.value?.items ?? []"
              :fallback-font-asset-ids="session.document.value.fontPolicy.fallbackFontAssetIds"
              :disabled="cannotEditPrimary"
              @replace-range="replaceSelectedTextRange"
              @apply-style="applySelectedTextStyle"
              @replace-document="replaceSelectedRichText"
              @set-paragraph-style="setSelectedParagraphStyle"
            />

            <section v-if="primaryElement.type === 'balloon'" class="special-properties" data-testid="balloon-controls">
              <div class="section-heading"><strong>气泡</strong><small>固定四种形状；只允许一个受控尾巴</small></div>
              <label>类型
                <select :value="primaryElement.balloonKind" :disabled="cannotEditPrimary" @change="setBalloonKind">
                  <option value="speech">对白</option>
                  <option value="thought">思考</option>
                  <option value="shout">喊叫</option>
                  <option value="caption">旁白框</option>
                </select>
              </label>
              <label class="check-row"><input :checked="primaryElement.tail.enabled" type="checkbox" :disabled="cannotEditPrimary || primaryElement.balloonKind === 'caption'" @change="updateBalloonTailBoolean" />显示尾巴</label>
              <div class="number-grid">
                <label>根位置 <input :value="primaryElement.tail.rootRatio" type="number" min="0" max="1" step="0.05" :disabled="cannotEditPrimary" @change="updateBalloonTailNumber('rootRatio', $event)" /></label>
                <label>根宽 <input :value="primaryElement.tail.baseWidth" type="number" min="1" max="1024" :disabled="cannotEditPrimary" @change="updateBalloonTailNumber('baseWidth', $event)" /></label>
                <label>目标 X <input :value="primaryElement.tail.targetX" type="number" :disabled="cannotEditPrimary" @change="updateBalloonTailNumber('targetX', $event)" /></label>
                <label>目标 Y <input :value="primaryElement.tail.targetY" type="number" :disabled="cannotEditPrimary" @change="updateBalloonTailNumber('targetY', $event)" /></label>
              </div>
              <p>文字模式只编辑内部文字，不会拖动气泡；切回选择工具后才移动完整对象。</p>
            </section>

            <section v-if="primaryElement.type === 'text' || primaryElement.type === 'balloon'" class="text-preflight-summary" data-testid="text-preflight-summary">
              <strong>文字预检</strong>
              <p v-if="!primaryTextIssues.length">当前字体、glyph 与文本框容量通过。</p>
              <p v-for="(issue, index) in primaryTextIssues" :key="`${issue.code}-${index}`">{{ textIssueLabel(issue) }}</p>
            </section>

            <section v-if="currentPanels.length" class="reading-order">
              <div class="section-heading"><strong>阅读顺序</strong><small>独立于图层顺序</small></div>
              <article v-for="(panelId, index) in session.currentCanvas.value.panelReadingOrder" :key="panelId">
                <span>{{ index + 1 }} · {{ panelName(panelId) }}</span>
                <div>
                  <button type="button" :disabled="session.isReadOnly.value || index === 0" @click="moveReadingOrder(panelId, 'up')"><ChevronUp :size="13" /></button>
                  <button type="button" :disabled="session.isReadOnly.value || index === session.currentCanvas.value.panelReadingOrder.length - 1" @click="moveReadingOrder(panelId, 'down')"><ChevronDown :size="13" /></button>
                </div>
              </article>
            </section>
          </template>
          <p v-else>选择画布对象后，可在这里精确调整位置、尺寸、旋转、锁定和隐藏。</p>
        </div>

        <div v-else class="layer-panel">
          <article
            v-for="(element, index) in reversedLayers"
            :key="element.id"
            :class="{ 'is-selected': isSelected(element.id) }"
            @click="session.selectElement(element.id, false)"
          >
            <span>{{ element.name }}</span>
            <div>
              <button type="button" :disabled="session.isReadOnly.value" :title="element.hidden ? '显示' : '隐藏'" @click.stop="setElementHidden(element.id, !element.hidden)">
                <EyeOff v-if="element.hidden" :size="14" /><Eye v-else :size="14" />
              </button>
              <button type="button" :disabled="session.isReadOnly.value" :title="element.locked ? '解锁' : '锁定'" @click.stop="setElementLocked(element.id, !element.locked)">
                <Unlock v-if="element.locked" :size="14" /><Lock v-else :size="14" />
              </button>
              <button type="button" :disabled="session.isReadOnly.value || index === 0" title="上移" @click.stop="moveLayer(element.id, 'up')"><ChevronUp :size="14" /></button>
              <button type="button" :disabled="session.isReadOnly.value || index === reversedLayers.length - 1" title="下移" @click.stop="moveLayer(element.id, 'down')"><ChevronDown :size="14" /></button>
            </div>
          </article>
          <div v-if="hiddenCount" class="hidden-summary">另有 {{ hiddenCount }} 个隐藏对象，可在图层中恢复显示。</div>
        </div>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CloudUpload,
  Eye,
  EyeOff,
  Hand,
  History,
  Image as ImageIcon,
  LayoutPanelTop,
  LayoutTemplate,
  LoaderCircle,
  Lock,
  MessageCircle,
  MousePointer2,
  Redo2,
  Sparkles,
  Smartphone,
  SquareDashed,
  Type,
  Undo2,
  Unlock,
  X,
} from "lucide-vue-next";
import type {
  CandidateLockErrorCode,
  CoverCropV1,
  EditorCommandBatchV1,
  EditorCommandPayloadMapV1,
  EditorCommandTypeV1,
  EditorCommandV1,
  LayoutCanvasV1,
  LayoutPresetIdV1,
  LayoutProfileV1,
  LayoutPreflightCodeV1,
  LayoutPreflightReportV1,
  LayoutProfileResizeModeV1,
  LayoutPublicationHistoryResponseV1,
  LayoutPublicationProfileV1,
  LayoutSourceCatalogItemV1,
  LayoutSourceReplacementCropModeV1,
  LayoutTextIssueV1,
  LayoutTopLevelElementV1,
  RichTextDocumentV1,
  RichTextRangeV1,
  RichTextRunStylePatchV1,
  PanelFrameElementV1,
  PanelImageElementV1,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import {
  evaluateCoverCropV1,
  applyRichTextRangeStyle,
  collectLayoutTextIssuesV1,
  generateLayoutPresetV1,
  initializeLayoutCanvasesFromSourcesV1,
  projectVisibleShotPlacementsV1,
  replaceRichTextRange,
  LayoutPublicationProfileCodecV1,
  previewLayoutProfileResizeV1,
} from "@airoaming/shared";

import { useLayoutEditorSession } from "../../composables/layout-editor-session";
import { useLayoutFontLoader } from "../../composables/layout-font-loader";
import { api } from "../../services/api";
import LayoutElementTextPreview from "./LayoutElementTextPreview.vue";
import LayoutRichTextEditor from "./LayoutRichTextEditor.vue";

const props = defineProps<{
  snapshot: WorkbenchSnapshot;
  loading: boolean;
}>();

const emit = defineEmits<{
  selectChapter: [chapterId: string];
  goCandidates: [];
}>();

const projectId = computed(() => props.snapshot.project.id);
const chapterId = computed(() => props.snapshot.currentChapter?.id ?? null);
const session = useLayoutEditorSession({ projectId, chapterId });
const chapters = computed(() => props.snapshot.chapters ?? []);
const isPaged = computed(() => props.snapshot.project.comicFormat === "paged_comic");
const formatLabel = computed(() => isPaged.value ? "页漫" : "条漫");
const initializationMode = ref<"default_storyboard_layout" | "blank">("default_storyboard_layout");
const profileWidth = ref(isPaged.value ? 1800 : 1080);
const profileHeight = ref(isPaged.value ? 2400 : 1920);
const resizeWidth = ref(isPaged.value ? 1800 : 1080);
const resizeHeight = ref(isPaged.value ? 2400 : 1920);
const resizeMode = ref<LayoutProfileResizeModeV1>("keep_coordinates");
const currentSectionHeight = ref(1920);
const inspectorTab = ref<"properties" | "layers">("properties");
const selectedSourceShotId = ref<string | null>(null);
const selectedPresetId = ref<LayoutPresetIdV1>(isPaged.value ? "four_panel" : "single");
const actionError = ref<string | null>(null);
const m6Busy = ref(false);
const m6PanelOpen = ref(false);
const replacementCropMode = ref<LayoutSourceReplacementCropModeV1>("preserve_normalized_crop");
const acknowledgedIssueKeys = ref<string[]>([]);
const publicationPreflight = ref<LayoutPreflightReportV1 | null>(null);
const publicationHistory = ref<LayoutPublicationHistoryResponseV1 | null>(null);
const publicationAcknowledgedIssueKeys = ref<string[]>([]);
const publicationRequestId = ref<string | null>(null);
const publicationBusy = ref(false);
const activeTool = ref<"select" | "text">("select");
const aiDrawerOpen = ref(false);
const aiBusy = ref(false);
const legacyCutoverBusy = ref(false);
let publicationPollTimer: ReturnType<typeof setInterval> | null = null;
const fontLoader = useLayoutFontLoader({
  projectId,
  chapterId,
  catalog: session.fontCatalog,
});

const presetOptions: Array<{ id: LayoutPresetIdV1; label: string; count: number }> = [
  { id: "single", label: "单格", count: 1 },
  { id: "two_vertical", label: "上下双格", count: 2 },
  { id: "two_horizontal", label: "左右双格", count: 2 },
  { id: "three_focus", label: "一大两小", count: 3 },
  { id: "four_panel", label: "四格", count: 4 },
  { id: "dialogue_two", label: "对话双格", count: 2 },
  { id: "action_focus", label: "动作聚焦", count: 3 },
];

interface DragState {
  elementId: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  dx: number;
  dy: number;
}

const drag = ref<DragState | null>(null);
const currentElements = computed(() => session.currentCanvas.value?.elements ?? []);
const currentPanels = computed(() => currentElements.value.filter((element): element is PanelFrameElementV1 => element.type === "panel_frame"));
const visibleElements = computed(() => currentElements.value.filter((element) => !element.hidden));
const reversedLayers = computed(() => [...currentElements.value].reverse());
const hiddenCount = computed(() => currentElements.value.filter((element) => element.hidden).length);
const primaryElement = computed(() => session.selectedElements.value[0] ?? null);
const sourceCatalogItems = computed(() => session.sourceCatalog.value?.items ?? []);
const selectedSource = computed(() => sourceCatalogItems.value.find((item) => item.source.shotId === selectedSourceShotId.value) ?? sourceCatalogItems.value[0] ?? null);
const visiblePlacements = computed(() => session.document.value ? projectVisibleShotPlacementsV1(session.document.value) : {});
const emptyTargetPanel = computed(() => {
  const selected = session.selectedElements.value.find((element): element is PanelFrameElementV1 => element.type === "panel_frame" && !element.contentImage && !element.locked);
  return selected ?? currentPanels.value.find((panel) => !panel.contentImage && !panel.locked) ?? null;
});
const canReplacePrimarySource = computed(() => primaryElement.value?.type === "free_image" || (primaryElement.value?.type === "panel_frame" && Boolean(primaryElement.value.contentImage)));
const selectedFreeImage = computed(() => session.selectedElements.value.find((element) => element.type === "free_image") ?? null);
const selectedEmptyPanel = computed(() => session.selectedElements.value.find((element): element is PanelFrameElementV1 => element.type === "panel_frame" && !element.contentImage) ?? null);
const canAttachSelectedFreeToPanel = computed(() => Boolean(selectedFreeImage.value && selectedEmptyPanel.value && !selectedFreeImage.value.locked && !selectedEmptyPanel.value.locked));
const primaryImage = computed(() => {
  const element = primaryElement.value;
  if (element?.type === "panel_frame") return element.contentImage;
  return element?.type === "free_image" ? element : null;
});
const primaryCrop = computed<CoverCropV1 | null>(() => {
  const element = primaryElement.value;
  if (element?.type === "panel_frame") return element.contentImage?.crop ?? null;
  if (element?.type === "free_image" && element.display.mode === "cover") return element.display.crop;
  return null;
});
const selectedPreset = computed(() => presetOptions.find((preset) => preset.id === selectedPresetId.value)!);
const occupiedPanelCount = computed(() => currentPanels.value.filter((panel) => panel.contentImage).length);
const canApplyPreset = computed(() => selectedPreset.value.count >= occupiedPanelCount.value && Boolean(session.currentCanvas.value));
const presetPreviewLabel = computed(() => canApplyPreset.value
  ? `将 ${occupiedPanelCount.value} 张已放置图片按阅读顺序映射到 ${selectedPreset.value.count} 个正式画格。`
  : `当前有 ${occupiedPanelCount.value} 个已占用画格，${selectedPreset.value.count} 格模板会丢图，已阻止应用。`);
const canBatchInitialize = computed(() => {
  if (!session.document.value || !sourceCatalogItems.value.length) return false;
  return session.document.value.canvases.every((canvas) => canvas.elements.every((element) => element.type === "panel_frame"));
});
const cannotEditPrimary = computed(() => session.isReadOnly.value || Boolean(primaryElement.value?.locked));
const canSuggestCenter = computed(() => Boolean(primaryElement.value && !primaryElement.value.locked && session.server.value && session.currentCanvas.value));
const textIssues = computed(() => session.document.value
  ? collectLayoutTextIssuesV1(session.document.value, session.fontCatalog.value?.items ?? [])
  : []);
const textIssueElementIds = computed(() => new Set(textIssues.value.filter((issue) => issue.code === "LAYOUT_TEXT_OVERFLOW").map((issue) => issue.elementId)));
const primaryTextIssues = computed(() => primaryElement.value ? textIssues.value.filter((issue) => issue.elementId === primaryElement.value!.id) : []);
const canInitialize = computed(() => Boolean(chapterId.value) && profileWidth.value >= 320 && profileHeight.value >= 320);
const profileResizeResult = computed(() => {
  if (!session.document.value) return { preview: null, error: "排版草稿尚未加载。" };
  try {
    return {
      preview: previewLayoutProfileResizeV1({
        document: session.document.value,
        width: resizeWidth.value,
        height: resizeHeight.value,
        mode: resizeMode.value,
      }),
      error: null,
    };
  } catch (error) {
    return { preview: null, error: error instanceof Error ? error.message : "尺寸预览失败" };
  }
});
const sourceAttention = computed(() => {
  if (session.server.value?.sourceEvaluation.sourceResolution === "current") return null;
  const sources = props.snapshot.candidateSources;
  if (!sources) return null;
  if (sources.gates.buildLayoutWorkingCopy.allowed) return null;
  const primary = sources.gates.buildLayoutWorkingCopy.reasonCodes[0];
  return {
    title: getSourceAttentionTitle(primary),
    message: getSourceReasonLabel(primary),
  };
});
const sourceNeedsAttention = computed(() => session.server.value?.sourceEvaluation.sourceResolution !== "current");
const replaceableImageElementIds = computed(() => [...new Set([
  ...(session.server.value?.sourceEvaluation.staleElementIds ?? []),
  ...(session.server.value?.sourceEvaluation.unresolvedElementIds ?? []),
])]);
const selectedStaleImageId = computed(() => {
  const imageId = primaryImage.value?.id ?? null;
  return imageId && replaceableImageElementIds.value.includes(imageId) ? imageId : null;
});
const sourceResolutionTone = computed(() => {
  const resolution = session.server.value?.sourceEvaluation.sourceResolution;
  return resolution === "current" ? "ready" : resolution === "stale" ? "warning" : "blocked";
});
const sourceStateLabel = computed(() => {
  const source = session.server.value?.sourceEvaluation;
  if (!source) return "尚未建立草稿";
  if (source.sourceResolution === "current") return "当前定稿";
  if (source.sourceResolution === "stale") return "候选已更新";
  return "来源待处理";
});
const saveStateLabel = computed(() => ({
  loading: "读取中",
  missing: "尚未创建",
  saved: "已保存",
  unsaved: "有未保存修改",
  saving: "保存中",
  conflict: "保存冲突",
  error: "读取失败",
}[session.saveState.value]));
const preflightStatusLabel = computed(() => ({
  ready: "可保存",
  warning: "需要确认",
  blocked: "存在阻断",
}[session.preflight.value?.status ?? "blocked"]));
const revisionBlockingIssueCount = computed(() => session.preflight.value?.issues.filter((issue) =>
  issue.blockingScopes.includes("revision")).length ?? 0);
const missingAcknowledgementCount = computed(() => session.preflight.value?.issues.filter((issue) =>
  issue.requiresAcknowledgement && !acknowledgedIssueKeys.value.includes(issue.issueKey)).length ?? 0);
const canCreateRevision = computed(() => Boolean(session.preflight.value)
  && revisionBlockingIssueCount.value === 0
  && missingAcknowledgementCount.value === 0
  && !session.isDirty.value
  && session.saveState.value === "saved");
const currentLayoutRevisionId = computed(() => session.revisionHistory.value?.currentLayoutRevisionId ?? null);
const publicationProfile = computed<LayoutPublicationProfileV1>(() => isPaged.value
  ? { schemaVersion: 1, kind: "paged_publication", outputScale: 1, includePdf: true, pdfPixelDpi: 96 }
  : { schemaVersion: 1, kind: "vertical_publication", outputScale: 1, maxSliceHeightPx: 8192, cutPolicy: "prefer_section_boundary_then_exact", includeLongPng: true });
const publicationBlockingIssueCount = computed(() => publicationPreflight.value?.issues.filter((issue) => issue.blockingScopes.includes("export")).length ?? 0);
const publicationMissingAcknowledgementCount = computed(() => publicationPreflight.value?.issues.filter((issue) =>
  issue.requiresAcknowledgement && !publicationAcknowledgedIssueKeys.value.includes(issue.issueKey)).length ?? 0);
const canPublish = computed(() => Boolean(publicationPreflight.value)
  && publicationPreflight.value?.target.kind === "layout_revision"
  && publicationPreflight.value.target.id === currentLayoutRevisionId.value
  && publicationBlockingIssueCount.value === 0
  && publicationMissingAcknowledgementCount.value === 0);
const publicationStatusLabel = computed(() => ({ ready: "可出版", warning: "需要确认", blocked: "存在阻断" }[publicationPreflight.value?.status ?? "blocked"]));
const canvasStyle = computed(() => ({
  width: `${session.currentCanvas.value!.width * session.zoom.value}px`,
  height: `${session.currentCanvas.value!.height * session.zoom.value}px`,
  backgroundColor: session.currentCanvas.value!.backgroundColor.slice(0, 7),
}));
const cropCoverageLabel = computed(() => {
  const crop = primaryCrop.value;
  const element = primaryElement.value;
  const image = primaryImage.value;
  if (!crop || !element || !image) return "";
  const catalog = sourceCatalogItems.value.find((item) => item.source.assetId === image.source.assetId);
  if (!catalog) return "当前来源尺寸不可用，服务端仍会在保存时严格复核。";
  const evaluation = evaluateCoverCropV1({
    sourceWidth: catalog.width,
    sourceHeight: catalog.height,
    frameWidth: element.transform.width,
    frameHeight: element.transform.height,
    crop,
  });
  return evaluation.covered ? "裁切覆盖完整" : "裁切会暴露空洞，已阻止保存";
});

function selectChapter(event: Event): void {
  const id = (event.target as HTMLSelectElement).value;
  if (id) emit("selectChapter", id);
}

function initializeDraft(): void {
  const profile: LayoutProfileV1 = isPaged.value
    ? {
        kind: "paged",
        presetId: profileWidth.value === 1800 && profileHeight.value === 2400 ? "portrait_3_4" : "custom",
        width: profileWidth.value,
        height: profileHeight.value,
        safeArea: { top: 72, right: 72, bottom: 72, left: 72 },
        panelReadingDirection: "ltr_ttb",
      }
    : {
        kind: "vertical_strip",
        presetId: profileWidth.value === 1080 ? "webtoon_1080" : "custom",
        width: profileWidth.value,
        defaultSectionHeight: profileHeight.value,
        safeInsetX: 64,
      };
  const currentLayoutId = props.snapshot.candidateSources?.currentLayout?.id ?? null;
  void session.initialize(profile, initializationMode.value, currentLayoutId);
}

function currentProfile(): LayoutProfileV1 {
  return isPaged.value
    ? {
        kind: "paged",
        presetId: profileWidth.value === 1800 && profileHeight.value === 2400 ? "portrait_3_4" : "custom",
        width: profileWidth.value,
        height: profileHeight.value,
        safeArea: { top: 72, right: 72, bottom: 72, left: 72 },
        panelReadingDirection: "ltr_ttb",
      }
    : {
        kind: "vertical_strip",
        presetId: profileWidth.value === 1080 ? "webtoon_1080" : "custom",
        width: profileWidth.value,
        defaultSectionHeight: profileHeight.value,
        safeInsetX: 64,
      };
}

async function convertLegacyDraft(): Promise<void> {
  legacyCutoverBusy.value = true;
  actionError.value = null;
  try {
    await session.convertLegacy();
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : "旧排版转换失败，请明确重建";
  } finally {
    legacyCutoverBusy.value = false;
  }
}

async function rebuildLegacyDraft(): Promise<void> {
  if (!window.confirm("将使用当前定稿重新建立 V1 草稿。旧排版证据仍保留，但不会被猜测为 current。确认继续？")) return;
  legacyCutoverBusy.value = true;
  actionError.value = null;
  try {
    await session.rebuildLegacy(currentProfile(), initializationMode.value, props.snapshot.candidateSources?.currentLayout?.id ?? null);
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : "旧排版重建失败";
  } finally {
    legacyCutoverBusy.value = false;
  }
}

function openMobilePreview(): void {
  if (!chapterId.value) return;
  const url = `/projects/${encodeURIComponent(projectId.value)}/layout/preview?chapterId=${encodeURIComponent(chapterId.value)}&source=working_copy`;
  window.open(url, "_blank", "noopener,noreferrer");
}

async function openAiDrawer(): Promise<void> {
  aiDrawerOpen.value = true;
  aiBusy.value = true;
  actionError.value = null;
  try {
    await session.loadPendingCommand();
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : "AI 建议读取失败";
  } finally {
    aiBusy.value = false;
  }
}

async function previewCenterSuggestion(): Promise<void> {
  const element = primaryElement.value;
  const canvas = session.currentCanvas.value;
  const server = session.server.value;
  if (!element || !canvas || !server || element.locked) return;
  aiBusy.value = true;
  actionError.value = null;
  try {
    const maxX = Math.max(0, canvas.width - element.transform.width);
    const shiftedX = element.transform.x + 8 <= maxX
      ? element.transform.x + 8
      : Math.max(0, element.transform.x - 8);
    const transform = { ...element.transform, x: Math.round(shiftedX * 1_000) / 1_000 };
    const suggestion = command("element.set_transform", "微调所选对象留白", {
      canvasId: canvas.id,
      elementId: element.id,
      transform,
    });
    await session.previewPendingCommand({
      schemaVersion: 1,
      expectedWorkingCopyRowVersion: server.rowVersion,
      expectedDocumentDigest: server.documentDigest,
      selectionElementIds: [element.id],
      summary: `将「${element.name}」横向微调 8 像素`,
      warnings: [],
      commandBatch: {
        schemaVersion: 1,
        batchId: newId("ai_batch"),
        label: "AI 建议：微调所选对象留白",
        commands: [suggestion],
      },
    });
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : "AI 建议预览失败";
  } finally {
    aiBusy.value = false;
  }
}

async function applyAiSuggestion(): Promise<void> {
  aiBusy.value = true;
  actionError.value = null;
  try {
    await session.applyPendingCommand();
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : "AI 建议已过期，请重新生成";
    await session.loadPendingCommand().catch(() => null);
  } finally {
    aiBusy.value = false;
  }
}

async function discardAiSuggestion(): Promise<void> {
  aiBusy.value = true;
  actionError.value = null;
  try {
    await session.discardPendingCommand();
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : "AI 建议放弃失败";
  } finally {
    aiBusy.value = false;
  }
}

async function prepareRevision(): Promise<void> {
  m6PanelOpen.value = true;
  m6Busy.value = true;
  actionError.value = null;
  try {
    const report = await session.runPreflight();
    if (!report) throw new Error("请先完成当前草稿保存，再运行正式版本预检。");
    acknowledgedIssueKeys.value = acknowledgedIssueKeys.value.filter((issueKey) =>
      report.issues.some((issue) => issue.issueKey === issueKey && issue.requiresAcknowledgement));
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : "正式版本预检失败";
  } finally {
    m6Busy.value = false;
  }
}

async function previewStaleReplacement(selectedOnly: boolean): Promise<void> {
  const ids = selectedOnly && selectedStaleImageId.value
    ? [selectedStaleImageId.value]
    : replaceableImageElementIds.value;
  if (!ids.length) return;
  m6PanelOpen.value = true;
  m6Busy.value = true;
  actionError.value = null;
  try {
    const preview = await session.previewSourceReplacement(ids, replacementCropMode.value);
    if (!preview) throw new Error("请先完成当前草稿保存，再预览来源替换。");
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : "来源替换预览失败";
  } finally {
    m6Busy.value = false;
  }
}

async function commitStaleReplacement(): Promise<void> {
  m6Busy.value = true;
  actionError.value = null;
  try {
    const result = await session.commitSourceReplacement();
    if (!result) throw new Error("来源替换预览已失效，请重新预览。");
    acknowledgedIssueKeys.value = [];
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : "来源替换提交失败";
  } finally {
    m6Busy.value = false;
  }
}

async function saveRevision(): Promise<void> {
  if (!canCreateRevision.value) return;
  m6Busy.value = true;
  actionError.value = null;
  try {
    await session.createRevision(acknowledgedIssueKeys.value);
    acknowledgedIssueKeys.value = [];
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : "正式版本保存失败";
  } finally {
    m6Busy.value = false;
  }
}

async function restoreRevision(revisionId: string, revision: number): Promise<void> {
  if (!window.confirm(`将版本 ${revision} 的内容恢复到当前草稿。当前正式版本不会改变，是否继续？`)) return;
  m6Busy.value = true;
  actionError.value = null;
  try {
    await session.restoreRevision(revisionId);
    acknowledgedIssueKeys.value = [];
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : "版本恢复失败";
  } finally {
    m6Busy.value = false;
  }
}

async function refreshPublicationHistory(): Promise<void> {
  const id = chapterId.value;
  if (!id) {
    publicationHistory.value = null;
    return;
  }
  publicationHistory.value = await api.listLayoutPublications(projectId.value, id);
}

async function preparePublication(): Promise<void> {
  const id = chapterId.value;
  const revisionId = currentLayoutRevisionId.value;
  if (!id || !revisionId) return;
  m6PanelOpen.value = true;
  publicationBusy.value = true;
  actionError.value = null;
  try {
    await session.flush();
    if (session.isDirty.value) throw new Error("请先完成当前草稿保存。");
    const report = await api.runLayoutPreflight(projectId.value, id, {
      schemaVersion: 1,
      target: { kind: "layout_revision", layoutRevisionId: revisionId },
      profile: publicationProfile.value,
    });
    publicationPreflight.value = report;
    publicationAcknowledgedIssueKeys.value = publicationAcknowledgedIssueKeys.value.filter((issueKey) =>
      report.issues.some((issue) => issue.issueKey === issueKey && issue.requiresAcknowledgement));
    publicationRequestId.value = null;
    await refreshPublicationHistory();
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : "导出预检失败";
  } finally {
    publicationBusy.value = false;
  }
}

async function publishCurrentRevision(): Promise<void> {
  const id = chapterId.value;
  const revisionId = currentLayoutRevisionId.value;
  const report = publicationPreflight.value;
  if (!id || !revisionId || !report || !canPublish.value) return;
  publicationBusy.value = true;
  actionError.value = null;
  try {
    publicationRequestId.value ??= globalThis.crypto?.randomUUID?.() ?? `publication_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const profile = LayoutPublicationProfileCodecV1.encode(publicationProfile.value);
    await api.createLayoutPublication(projectId.value, id, {
      schemaVersion: 1,
      requestId: publicationRequestId.value,
      layoutRevisionId: revisionId,
      expectedCurrentLayoutRevisionId: revisionId,
      profile: profile.value,
      profileDigest: profile.digest,
      preflightDigest: report.preflightDigest,
      acknowledgedIssueKeys: [...publicationAcknowledgedIssueKeys.value],
    });
    await refreshPublicationHistory();
    publicationRequestId.value = null;
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : "正式出版提交失败";
  } finally {
    publicationBusy.value = false;
  }
}

async function cancelPublication(exportRevisionId: string): Promise<void> {
  const id = chapterId.value;
  if (!id) return;
  publicationBusy.value = true;
  actionError.value = null;
  try {
    await api.cancelLayoutPublication(projectId.value, id, exportRevisionId);
    await refreshPublicationHistory();
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : "取消出版失败";
  } finally {
    publicationBusy.value = false;
  }
}

function publicationArtifactUrl(exportRevisionId: string, assetId: string): string {
  return api.layoutPublicationArtifactUrl(projectId.value, chapterId.value!, exportRevisionId, assetId);
}

function publicationStateLabel(status: string): string {
  return ({ queued: "排队中", rendering: "渲染中", ready: "已完成", failed: "失败", cancelled: "已取消" } as Record<string, string>)[status] ?? status;
}

function artifactLabel(role: string, order: number): string {
  const label = ({ page_png: "页面 PNG", document_pdf: "PDF", strip_slice_png: "条漫切片", long_png: "长图", publication_manifest: "清单" } as Record<string, string>)[role] ?? role;
  return role === "page_png" || role === "strip_slice_png" ? `${label} ${order}` : label;
}

function revisionNumber(revisionId: string): number | string {
  return session.revisionHistory.value?.items.find((revision) => revision.id === revisionId)?.revision ?? "—";
}

function shortDigest(digest: string): string {
  return `${digest.slice(0, 14)}…${digest.slice(-8)}`;
}

function replacementWarningLabel(code: string): string {
  if (code === "CROP_ZOOM_ADJUSTED") return "已自动补足覆盖";
  if (code === "CROP_REVIEW_RECOMMENDED") return "建议复核裁切";
  return code;
}

function preflightIssueLabel(code: LayoutPreflightCodeV1): string {
  const labels: Partial<Record<LayoutPreflightCodeV1, string>> = {
    ACTIVE_SHOT_UNPLACED: "当前镜头尚未放入画布",
    ACTIVE_SHOT_NOT_VISIBLE: "当前镜头不可见",
    SOURCE_LOCK_SET_INCOMPLETE: "来源集合不完整",
    SOURCE_STALE: "图片仍引用旧定稿",
    SOURCE_UNRESOLVED: "图片来源不可解析",
    SOURCE_DIGEST_MISMATCH: "图片来源摘要不一致",
    IMAGE_ASSET_MISSING_OR_NOT_READY: "图片素材未就绪",
    IMAGE_SHA_MISMATCH: "图片素材摘要不一致",
    IMAGE_ORIENTATION_UNNORMALIZED: "图片 EXIF 方向尚未规范",
    IMAGE_COLORSPACE_UNSUPPORTED: "图片色彩空间不是 sRGB",
    IMAGE_ANIMATION_UNSUPPORTED: "动画图片不能用于正式成稿",
    FONT_ASSET_MISSING_OR_NOT_READY: "字体素材未就绪",
    FONT_EMBEDDING_FORBIDDEN: "字体不允许嵌入",
    FONT_GLYPH_MISSING: "字体缺少字符",
    TEXT_OVERFLOW: "文字发生溢出",
    IMAGE_EFFECTIVE_RESOLUTION_CRITICAL: "图片有效分辨率不足",
    IMAGE_EFFECTIVE_RESOLUTION_LOW: "图片有效分辨率偏低",
    ELEMENT_FULLY_OUTSIDE_CANVAS: "对象完全位于画布外",
    ELEMENT_PARTLY_OUTSIDE_SAFE_AREA: "对象超出安全区",
    CANVAS_EMPTY: "存在空画布",
    HIDDEN_ELEMENT_PRESENT: "存在隐藏对象",
    WORKING_COPY_AHEAD_OF_REVISION: "草稿领先于该版本",
  };
  return labels[code] ?? code;
}

function command<T extends EditorCommandTypeV1>(
  type: T,
  label: string,
  payload: EditorCommandPayloadMapV1[T],
): EditorCommandV1<T> {
  return {
    schemaVersion: 1,
    commandId: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    label,
    payload,
  } as EditorCommandV1<T>;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function defaultCrop(): CoverCropV1 {
  return { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, flipX: false, flipY: false };
}

function defaultRichText(text: string): RichTextDocumentV1 {
  const fontAssetId = session.document.value?.fontPolicy.defaultFontAssetId
    ?? session.fontCatalog.value?.items.find((item) => item.metadata.face.weight === 400)?.assetId
    ?? "missing_font";
  return {
    schemaVersion: 1,
    writingMode: "horizontal-tb",
    textOrientation: "mixed",
    paragraphs: [{
      align: "start",
      lineHeight: 1.2,
      runs: [{
        text,
        fontAssetId,
        fontSize: 64,
        fontWeight: 400,
        fontStyle: "normal",
        color: "#111827FF",
        letterSpacing: 0,
        stroke: null,
      }],
    }],
  };
}

function imageForSource(item: LayoutSourceCatalogItemV1): PanelImageElementV1 {
  return {
    id: newId("panel_image"),
    type: "image",
    placement: "panel_content",
    name: `镜头 ${item.order}`,
    locked: false,
    hidden: false,
    source: structuredClone(item.source),
    crop: defaultCrop(),
  };
}

function placementCount(shotId: string): number {
  return visiblePlacements.value[shotId]?.length ?? 0;
}

function addPanel(): void {
  const canvas = session.currentCanvas.value;
  if (!canvas) return;
  actionError.value = null;
  const index = currentPanels.value.length + 1;
  const panel: PanelFrameElementV1 = {
    id: newId("panel"),
    type: "panel_frame",
    name: `画格 ${index}`,
    transform: {
      x: Math.round(canvas.width * 0.12),
      y: Math.round(canvas.height * 0.12),
      width: Math.round(canvas.width * 0.76),
      height: Math.round(canvas.height * 0.32),
      rotation: 0,
      opacity: 1,
    },
    locked: false,
    hidden: false,
    shape: { kind: "rect", cornerRadius: 0 },
    border: { visible: true, color: "#111827FF", width: 8 },
    contentImage: null,
  };
  session.execute(command("element.add", "添加画格", {
    canvasId: canvas.id,
    element: panel,
    beforeElementId: null,
  }));
  session.selectElement(panel.id);
}

function addFreeImage(item: LayoutSourceCatalogItemV1): void {
  const canvas = session.currentCanvas.value;
  if (!canvas) return;
  actionError.value = null;
  selectedSourceShotId.value = item.source.shotId;
  const width = Math.round(canvas.width * 0.5);
  const height = Math.min(Math.round(width * item.height / item.width), Math.round(canvas.height * 0.75));
  const element: LayoutTopLevelElementV1 = {
    id: newId("free_image"),
    type: "free_image",
    name: `镜头 ${item.order} 自由图`,
    transform: {
      x: Math.round((canvas.width - width) / 2),
      y: Math.round((canvas.height - height) / 2),
      width,
      height,
      rotation: 0,
      opacity: 1,
    },
    locked: false,
    hidden: false,
    source: structuredClone(item.source),
    display: { mode: "contain" },
  };
  session.execute(command("element.add", "添加自由图片", {
    canvasId: canvas.id,
    element,
    beforeElementId: null,
  }));
  session.selectElement(element.id);
}

function addText(): void {
  const canvas = session.currentCanvas.value;
  if (!canvas) return;
  const width = Math.round(canvas.width * 0.42);
  const height = Math.round(canvas.height * 0.18);
  const element: LayoutTopLevelElementV1 = {
    id: newId("text"),
    type: "text",
    name: "文字",
    transform: {
      x: Math.round((canvas.width - width) / 2),
      y: Math.round(canvas.height * 0.12),
      width,
      height,
      rotation: 0,
      opacity: 1,
    },
    locked: false,
    hidden: false,
    semantic: "custom",
    verticalAlign: "start",
    richText: defaultRichText("输入文字"),
  };
  session.execute(command("element.add", "添加文字", { canvasId: canvas.id, element, beforeElementId: null }));
  session.selectElement(element.id);
  activeTool.value = "text";
}

function addBalloon(): void {
  const canvas = session.currentCanvas.value;
  if (!canvas) return;
  const width = Math.round(canvas.width * 0.34);
  const height = Math.round(canvas.height * 0.2);
  const element: LayoutTopLevelElementV1 = {
    id: newId("balloon"),
    type: "balloon",
    name: "对白气泡",
    transform: {
      x: Math.round((canvas.width - width) / 2),
      y: Math.round(canvas.height * 0.18),
      width,
      height,
      rotation: 0,
      opacity: 1,
    },
    locked: false,
    hidden: false,
    balloonKind: "speech",
    sourceShotId: null,
    speakerCharacterId: null,
    fillColor: "#FFFFFFFF",
    strokeColor: "#111827FF",
    strokeWidth: 8,
    padding: { top: 48, right: 56, bottom: 48, left: 56 },
    verticalAlign: "center",
    tail: { enabled: true, rootRatio: 0.6, targetX: width * 0.68, targetY: height + 120, baseWidth: 80 },
    richText: defaultRichText("对白"),
  };
  session.execute(command("element.add", "添加气泡", { canvasId: canvas.id, element, beforeElementId: null }));
  session.selectElement(element.id);
  activeTool.value = "text";
}

function replaceSelectedTextRange(value: RichTextRangeV1 & { text: string }): void {
  const element = primaryElement.value;
  const canvas = session.currentCanvas.value;
  if (!element || !canvas || (element.type !== "text" && element.type !== "balloon")) return;
  if (element.type === "text") {
    session.execute(command("text.replace_range", "编辑文字", {
      canvasId: canvas.id,
      elementId: element.id,
      ...value,
    }));
  } else {
    const richText = replaceRichTextRange(element.richText, value);
    session.execute(command("balloon.replace_text_document", "编辑气泡文字", { canvasId: canvas.id, elementId: element.id, richText }));
  }
}

function applySelectedTextStyle(value: RichTextRangeV1 & { style: RichTextRunStylePatchV1 }): void {
  const element = primaryElement.value;
  const canvas = session.currentCanvas.value;
  if (!element || !canvas || (element.type !== "text" && element.type !== "balloon")) return;
  if (element.type === "text") {
    session.execute(command("text.apply_range_style", "应用范围文字样式", {
      canvasId: canvas.id,
      elementId: element.id,
      ...value,
    }));
  } else {
    const richText = applyRichTextRangeStyle(element.richText, value, value.style);
    session.execute(command("balloon.replace_text_document", "应用气泡文字样式", { canvasId: canvas.id, elementId: element.id, richText }));
  }
}

function replaceSelectedRichText(richText: RichTextDocumentV1): void {
  const element = primaryElement.value;
  const canvas = session.currentCanvas.value;
  if (!element || !canvas || (element.type !== "text" && element.type !== "balloon")) return;
  session.execute(element.type === "text"
    ? command("text.replace_document", "调整文字排版", { canvasId: canvas.id, elementId: element.id, richText })
    : command("balloon.replace_text_document", "调整气泡文字排版", { canvasId: canvas.id, elementId: element.id, richText }));
}

function setSelectedParagraphStyle(value: { paragraphIndexes: number[]; align: "start" | "center" | "end"; lineHeight: number }): void {
  const element = primaryElement.value;
  const canvas = session.currentCanvas.value;
  if (!element || !canvas || (element.type !== "text" && element.type !== "balloon")) return;
  if (element.type === "text") {
    executeBatch("调整段落样式", value.paragraphIndexes.map((paragraphIndex) => command("text.set_paragraph_style", "调整段落样式", {
      canvasId: canvas.id,
      elementId: element.id,
      paragraphIndex,
      align: value.align,
      lineHeight: value.lineHeight,
    })));
  } else {
    const richText = structuredClone(element.richText);
    for (const paragraphIndex of value.paragraphIndexes) {
      const paragraph = richText.paragraphs[paragraphIndex];
      if (paragraph) {
        paragraph.align = value.align;
        paragraph.lineHeight = value.lineHeight;
      }
    }
    replaceSelectedRichText(richText);
  }
}

function setBalloonKind(event: Event): void {
  const element = primaryElement.value;
  const canvas = session.currentCanvas.value;
  if (element?.type !== "balloon" || !canvas) return;
  const balloonKind = (event.target as HTMLSelectElement).value as "speech" | "thought" | "shout" | "caption";
  session.execute(command("balloon.set_kind", "调整气泡类型", { canvasId: canvas.id, elementId: element.id, balloonKind }));
  if (balloonKind === "caption" && element.tail.enabled) {
    session.execute(command("balloon.set_tail", "关闭旁白框尾巴", { canvasId: canvas.id, elementId: element.id, tail: { ...element.tail, enabled: false } }));
  }
}

function updateBalloonTailBoolean(event: Event): void {
  const element = primaryElement.value;
  const canvas = session.currentCanvas.value;
  if (element?.type !== "balloon" || !canvas) return;
  session.execute(command("balloon.set_tail", "调整气泡尾巴", {
    canvasId: canvas.id,
    elementId: element.id,
    tail: { ...element.tail, enabled: (event.target as HTMLInputElement).checked },
  }));
}

function updateBalloonTailNumber(field: "rootRatio" | "targetX" | "targetY" | "baseWidth", event: Event): void {
  const element = primaryElement.value;
  const canvas = session.currentCanvas.value;
  if (element?.type !== "balloon" || !canvas) return;
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  const normalized = field === "rootRatio" ? Math.max(0, Math.min(1, value))
    : field === "baseWidth" ? Math.max(1, Math.min(1024, value))
      : value;
  session.execute(command("balloon.set_tail", "调整气泡尾巴", {
    canvasId: canvas.id,
    elementId: element.id,
    tail: { ...element.tail, [field]: normalized },
  }));
}

function textIssueLabel(issue: LayoutTextIssueV1): string {
  if (issue.code === "LAYOUT_TEXT_OVERFLOW") return `文字溢出：第 ${(issue.paragraphIndex ?? 0) + 1} 段、第 ${issue.graphemeOffset ?? 0} 个字素处超出${issue.axis === "width" ? "宽度" : "高度"}。`;
  if (issue.code === "LAYOUT_FONT_GLYPH_MISSING") return `字体缺少字符：${(issue.missingCodePoints ?? []).map((value) => `U+${value.toString(16).toUpperCase()}`).join("、")}，不会回退到系统 emoji。`;
  if (issue.code === "LAYOUT_FONT_EMBEDDING_FORBIDDEN") return "该字体许可证禁止嵌入，正式版本与导出将被阻止。";
  return "字体 Asset 缺失，已阻止继续形成正式输出。";
}

function attachSourceToPanel(item: LayoutSourceCatalogItemV1): void {
  const panel = emptyTargetPanel.value;
  const canvas = session.currentCanvas.value;
  if (!panel || !canvas) return;
  actionError.value = null;
  selectedSourceShotId.value = item.source.shotId;
  session.execute(command("panel.attach_image", "镜头放入画格", {
    canvasId: canvas.id,
    elementId: panel.id,
    image: imageForSource(item),
  }));
  session.selectElement(panel.id);
}

function replacePrimarySource(item: LayoutSourceCatalogItemV1): void {
  const element = primaryElement.value;
  const canvas = session.currentCanvas.value;
  if (!element || !canvas || !canReplacePrimarySource.value) return;
  actionError.value = null;
  selectedSourceShotId.value = item.source.shotId;
  session.execute(command("image.replace_source", "替换图片来源", {
    canvasId: canvas.id,
    elementId: element.id,
    source: structuredClone(item.source),
    crop: element.type === "free_image" && element.display.mode === "contain" ? null : defaultCrop(),
  }));
}

function detachPanelImage(): void {
  const panel = primaryElement.value;
  const canvas = session.currentCanvas.value;
  if (!canvas || panel?.type !== "panel_frame" || !panel.contentImage) return;
  const freeId = newId("free_image");
  session.execute(command("panel.detach_image_to_free", "图片分离为自由图", {
    canvasId: canvas.id,
    elementId: panel.id,
    beforeElementId: null,
    freeImage: {
      id: freeId,
      type: "free_image",
      name: `${panel.contentImage.name} 自由图`,
      transform: structuredClone(panel.transform),
      locked: false,
      hidden: false,
      source: structuredClone(panel.contentImage.source),
      display: { mode: "cover", crop: structuredClone(panel.contentImage.crop) },
    },
  }));
  session.selectElement(freeId);
}

function attachSelectedFreeToPanel(): void {
  const free = selectedFreeImage.value;
  const panel = selectedEmptyPanel.value;
  if (!free || !panel || !canAttachSelectedFreeToPanel.value) return;
  attachFreeToPanel(free, panel);
}

function attachPrimaryFreeToPanel(): void {
  const free = primaryElement.value;
  const panel = emptyTargetPanel.value;
  if (free?.type !== "free_image" || !panel || free.locked || panel.locked) return;
  attachFreeToPanel(free, panel);
}

function attachFreeToPanel(
  free: Extract<LayoutTopLevelElementV1, { type: "free_image" }>,
  panel: PanelFrameElementV1,
): void {
  const canvas = session.currentCanvas.value;
  if (!canvas) return;
  const crop = free.display.mode === "cover" ? structuredClone(free.display.crop) : defaultCrop();
  executeBatch("自由图放回画格", [
    command("panel.attach_image", "自由图放回画格", {
      canvasId: canvas.id,
      elementId: panel.id,
      image: {
        id: newId("panel_image"),
        type: "image",
        placement: "panel_content",
        name: free.name,
        locked: false,
        hidden: false,
        source: structuredClone(free.source),
        crop,
      },
    }),
    command("element.delete", "删除已放回的自由图", {
      canvasId: canvas.id,
      elementId: free.id,
    }),
  ]);
  session.selectElement(panel.id);
}

function presetInset() {
  const profile = session.document.value!.profile;
  return profile.kind === "paged"
    ? profile.safeArea
    : { top: 64, right: profile.safeInsetX, bottom: 64, left: profile.safeInsetX };
}

function buildPresetPanels(
  canvas: LayoutCanvasV1,
  presetId: LayoutPresetIdV1,
  images: PanelImageElementV1[],
): PanelFrameElementV1[] {
  const count = presetOptions.find((preset) => preset.id === presetId)!.count;
  const panels = generateLayoutPresetV1({
    presetId,
    presetVersion: 1,
    width: canvas.width,
    height: canvas.height,
    inset: presetInset(),
    gap: session.document.value!.profile.kind === "paged" ? 48 : 24,
    panelIds: Array.from({ length: count }, () => newId("panel")),
  });
  return panels.map((panel, index) => ({
    ...panel,
    name: `画格 ${index + 1}`,
    contentImage: images[index] ? structuredClone(images[index]) : null,
  }));
}

function applySelectedPreset(): void {
  const canvas = session.currentCanvas.value;
  if (!canvas || !canApplyPreset.value) return;
  const images = currentPanels.value.flatMap((panel) => panel.contentImage ? [panel.contentImage] : []);
  const panels = buildPresetPanels(canvas, selectedPresetId.value, images);
  session.execute(command("layout.apply_preset", "应用画格模板", {
    canvasId: canvas.id,
    panels,
    panelReadingOrder: panels.map((panel) => panel.id),
  }));
  session.selectedElementIds.value = [];
}

function batchInitializeFromSources(): void {
  const document = session.document.value;
  if (!document || !canBatchInitialize.value) return;
  if (!window.confirm("将按当前 G4 定稿重新建立画格与页面；现有画格布局会被替换。是否继续？")) return;
  actionError.value = null;
  const canvases = initializeLayoutCanvasesFromSourcesV1({
    profile: document.profile,
    sources: sourceCatalogItems.value,
    createId: (kind) => newId(kind),
  });
  session.execute(command("layout.resize_profile", "按镜头批量建立排版", {
    profile: structuredClone(document.profile),
    canvases,
  }));
  if (canvases[0]) session.selectCanvas(canvases[0].id);
}

function addCanvas(): void {
  const document = session.document.value;
  if (!document) return;
  const index = document.canvases.length;
  const canvas: LayoutCanvasV1 = {
    id: newId(document.profile.kind === "paged" ? "page" : "section"),
    kind: document.profile.kind === "paged" ? "page" : "strip_section",
    name: document.profile.kind === "paged" ? `第 ${index + 1} 页` : `第 ${index + 1} 段`,
    width: document.profile.width,
    height: document.profile.kind === "paged" ? document.profile.height : document.profile.defaultSectionHeight,
    backgroundColor: "#FFFFFFFF",
    panelReadingOrder: [],
    elements: [],
  };
  session.execute(command("canvas.add", "新增画布", { canvas, beforeCanvasId: null }));
  session.selectCanvas(canvas.id);
}

function cloneElementWithNewIds(element: LayoutTopLevelElementV1): LayoutTopLevelElementV1 {
  const cloned = structuredClone(element);
  cloned.id = newId(element.type);
  cloned.name = `${element.name} 副本`;
  if (cloned.type === "panel_frame" && cloned.contentImage) cloned.contentImage.id = newId("image");
  return cloned;
}

function duplicatePrimaryElement(): void {
  const canvas = session.currentCanvas.value;
  const element = primaryElement.value;
  if (!canvas || !element) return;
  const cloned = cloneElementWithNewIds(element);
  cloned.transform = { ...cloned.transform, x: cloned.transform.x + 24, y: cloned.transform.y + 24 };
  session.execute(command("element.duplicate", `复制${element.name}`, {
    canvasId: canvas.id,
    sourceElementId: element.id,
    element: cloned,
    beforeElementId: null,
  }));
  session.selectElement(cloned.id);
}

function duplicateCanvas(canvasId: string): void {
  const document = session.document.value;
  const source = document?.canvases.find((canvas) => canvas.id === canvasId);
  if (!document || !source) return;
  const cloned = structuredClone(source);
  cloned.id = newId(source.kind);
  cloned.name = `${source.name} 副本`;
  const idMap = new Map<string, string>();
  cloned.elements = source.elements.map((element) => {
    const copied = cloneElementWithNewIds(element);
    idMap.set(element.id, copied.id);
    return copied;
  });
  cloned.panelReadingOrder = source.panelReadingOrder.map((id) => idMap.get(id)!).filter(Boolean);
  const sourceIndex = document.canvases.findIndex((canvas) => canvas.id === source.id);
  const beforeCanvasId = document.canvases[sourceIndex + 1]?.id ?? null;
  session.execute(command("canvas.duplicate", `复制${source.name}`, {
    sourceCanvasId: source.id,
    canvas: cloned,
    beforeCanvasId,
  }));
  session.selectCanvas(cloned.id);
}

function applyProfileResize(): void {
  const preview = profileResizeResult.value.preview;
  const selectedCanvasId = session.currentCanvas.value?.id ?? null;
  if (!preview) return;
  session.execute(command("layout.resize_profile", resizeMode.value === "scale_uniform" ? "等比调整画布尺寸" : "保坐标调整画布尺寸", {
    profile: preview.profile,
    canvases: preview.canvases,
  }));
  if (selectedCanvasId) session.selectCanvas(selectedCanvasId);
}

function applyCurrentSectionHeight(): void {
  const canvas = session.currentCanvas.value;
  if (!canvas || isPaged.value || currentSectionHeight.value < 320 || currentSectionHeight.value > 8192) return;
  session.execute(command("canvas.resize", "调整当前段高", {
    canvasId: canvas.id,
    canvas: { ...structuredClone(canvas), height: currentSectionHeight.value },
  }));
}

function moveCanvas(canvasId: string, direction: "up" | "down"): void {
  const canvases = session.document.value?.canvases ?? [];
  const index = canvases.findIndex((canvas) => canvas.id === canvasId);
  if (index < 0) return;
  const beforeCanvasId = direction === "up"
    ? canvases[index - 1]?.id ?? null
    : canvases[index + 2]?.id ?? null;
  session.execute(command("canvas.reorder", direction === "up" ? "画布前移" : "画布后移", { canvasId, beforeCanvasId }));
}

function moveReadingOrder(panelId: string, direction: "up" | "down"): void {
  const canvas = session.currentCanvas.value;
  if (!canvas) return;
  const order = [...canvas.panelReadingOrder];
  const index = order.indexOf(panelId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= order.length) return;
  [order[index], order[target]] = [order[target]!, order[index]!];
  session.execute(command("layout.apply_preset", "调整画格阅读顺序", {
    canvasId: canvas.id,
    panels: currentPanels.value.map((panel) => structuredClone(panel)),
    panelReadingOrder: order,
  }));
}

function panelName(panelId: string): string {
  return currentPanels.value.find((panel) => panel.id === panelId)?.name ?? panelId;
}

function isSelected(elementId: string): boolean {
  return session.selectedElementIds.value.includes(elementId);
}

function elementStyle(element: LayoutTopLevelElementV1) {
  const delta = drag.value?.elementId === element.id ? drag.value : null;
  const zoom = session.zoom.value;
  return {
    left: `${element.transform.x * zoom + (delta?.dx ?? 0)}px`,
    top: `${element.transform.y * zoom + (delta?.dy ?? 0)}px`,
    width: `${element.transform.width * zoom}px`,
    height: `${element.transform.height * zoom}px`,
    opacity: element.transform.opacity,
    transform: `rotate(${element.transform.rotation}deg)`,
    zIndex: currentElements.value.indexOf(element) + 1,
  };
}

function panelFrameStyle(element: LayoutTopLevelElementV1) {
  if (element.type !== "panel_frame") return {};
  const zoom = session.zoom.value;
  return {
    borderWidth: element.border.visible ? `${element.border.width * zoom}px` : "0",
    borderColor: element.border.color.slice(0, 7),
    borderRadius: element.shape.kind === "rounded_rect" ? `${element.shape.cornerRadius * zoom}px` : "0",
  };
}

function imagePreviewStyle(element: LayoutTopLevelElementV1) {
  const source = element.type === "panel_frame"
    ? element.contentImage?.source ?? null
    : element.type === "free_image"
      ? element.source
      : null;
  const crop = element.type === "panel_frame"
    ? element.contentImage?.crop ?? null
    : element.type === "free_image" && element.display.mode === "cover"
      ? element.display.crop
      : null;
  if (!crop) return { objectFit: "contain" as const };
  const catalog = sourceCatalogItems.value.find((item) => item.source.assetId === source?.assetId);
  if (catalog) {
    const evaluation = evaluateCoverCropV1({
      sourceWidth: catalog.width,
      sourceHeight: catalog.height,
      frameWidth: element.transform.width,
      frameHeight: element.transform.height,
      crop,
    });
    return {
      position: "absolute" as const,
      left: `calc(50% + ${crop.offsetX * session.zoom.value}px)`,
      top: `calc(50% + ${crop.offsetY * session.zoom.value}px)`,
      width: `${catalog.width * evaluation.baseScale * crop.zoom * session.zoom.value}px`,
      height: `${catalog.height * evaluation.baseScale * crop.zoom * session.zoom.value}px`,
      maxWidth: "none",
      maxHeight: "none",
      objectFit: "fill" as const,
      transform: `translate(-50%, -50%) rotate(${crop.rotation}deg) scale(${crop.flipX ? -1 : 1}, ${crop.flipY ? -1 : 1})`,
    };
  }
  return {
    objectFit: "cover" as const,
    transform: `translate(${crop.offsetX * session.zoom.value}px, ${crop.offsetY * session.zoom.value}px) rotate(${crop.rotation}deg) scale(${crop.flipX ? -crop.zoom : crop.zoom}, ${crop.flipY ? -crop.zoom : crop.zoom})`,
  };
}

function setPanelShape(event: Event): void {
  const panel = primaryElement.value;
  if (panel?.type !== "panel_frame") return;
  const kind = (event.target as HTMLSelectElement).value as "rect" | "rounded_rect";
  session.execute(command("panel.set_shape", "调整画格形状", {
    canvasId: session.currentCanvas.value!.id,
    elementId: panel.id,
    shape: { kind, cornerRadius: kind === "rect" ? 0 : Math.min(panel.shape.cornerRadius || 32, panel.transform.width / 2, panel.transform.height / 2) },
  }));
}

function setPanelCornerRadius(event: Event): void {
  const panel = primaryElement.value;
  if (panel?.type !== "panel_frame" || panel.shape.kind !== "rounded_rect") return;
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  session.execute(command("panel.set_shape", "调整画格圆角", {
    canvasId: session.currentCanvas.value!.id,
    elementId: panel.id,
    shape: { kind: "rounded_rect", cornerRadius: Math.max(0, Math.min(value, panel.transform.width / 2, panel.transform.height / 2)) },
  }));
}

function setPanelBorderWidth(event: Event): void {
  const panel = primaryElement.value;
  if (panel?.type !== "panel_frame") return;
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  session.execute(command("panel.set_border", "调整画格边框", {
    canvasId: session.currentCanvas.value!.id,
    elementId: panel.id,
    border: { ...panel.border, width: Math.max(0, Math.min(value, 512)) },
  }));
}

function setFreeImageDisplay(event: Event): void {
  const image = primaryElement.value;
  if (image?.type !== "free_image") return;
  const mode = (event.target as HTMLSelectElement).value;
  session.execute(command("image.set_display", "调整图片显示方式", {
    canvasId: session.currentCanvas.value!.id,
    elementId: image.id,
    display: mode === "cover" ? { mode: "cover", crop: defaultCrop() } : { mode: "contain" },
  }));
}

function coveredCrop(candidate: CoverCropV1): CoverCropV1 | null {
  const element = primaryElement.value;
  const image = primaryImage.value;
  if (!element || !image) return null;
  const catalog = sourceCatalogItems.value.find((item) => item.source.assetId === image.source.assetId);
  if (!catalog) return candidate;
  const evaluation = evaluateCoverCropV1({
    sourceWidth: catalog.width,
    sourceHeight: catalog.height,
    frameWidth: element.transform.width,
    frameHeight: element.transform.height,
    crop: candidate,
  });
  if (evaluation.covered) return candidate;
  const requiredZoom = evaluation.requiredScaleWithOffset / evaluation.baseScale;
  if (!Number.isFinite(requiredZoom)) return null;
  return { ...candidate, zoom: Math.max(candidate.zoom, Math.ceil((requiredZoom + 0.001) * 1000) / 1000) };
}

function applyCrop(candidate: CoverCropV1, label: string): void {
  const element = primaryElement.value;
  if (!element) return;
  const safe = coveredCrop(candidate);
  if (!safe) {
    actionError.value = "该裁切无法完整覆盖画格，已阻止修改。";
    return;
  }
  actionError.value = null;
  session.execute(command("image.set_crop", label, {
    canvasId: session.currentCanvas.value!.id,
    elementId: element.id,
    crop: safe,
  }));
}

function updateCropNumber(field: "zoom" | "offsetX" | "offsetY" | "rotation", event: Event): void {
  if (!primaryCrop.value) return;
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  applyCrop({ ...primaryCrop.value, [field]: field === "zoom" ? Math.max(1, value) : value }, "调整图片裁切");
}

function toggleCropFlip(field: "flipX" | "flipY"): void {
  if (!primaryCrop.value) return;
  applyCrop({ ...primaryCrop.value, [field]: !primaryCrop.value[field] }, "翻转图片");
}

function resetCrop(): void {
  applyCrop(defaultCrop(), "重置图片裁切");
}

function deletePrimaryElement(): void {
  const element = primaryElement.value;
  const canvas = session.currentCanvas.value;
  if (!element || !canvas) return;
  if (
    element.type === "panel_frame"
    && element.contentImage
    && !window.confirm("删除此画格会让对应镜头回到“未放置”。是否继续？")
  ) return;
  session.execute(command("element.delete", "删除对象", { canvasId: canvas.id, elementId: element.id }));
  session.selectedElementIds.value = [];
}

function startDrag(event: PointerEvent, element: LayoutTopLevelElementV1): void {
  session.selectElement(element.id, event.metaKey || event.ctrlKey || event.shiftKey);
  if (activeTool.value === "text" && (element.type === "text" || element.type === "balloon")) return;
  if (session.isReadOnly.value || element.locked) return;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  drag.value = {
    elementId: element.id,
    startX: event.clientX,
    startY: event.clientY,
    originX: element.transform.x,
    originY: element.transform.y,
    dx: 0,
    dy: 0,
  };
}

function moveDrag(event: PointerEvent): void {
  if (!drag.value) return;
  drag.value = {
    ...drag.value,
    dx: event.clientX - drag.value.startX,
    dy: event.clientY - drag.value.startY,
  };
}

function finishDrag(): void {
  const state = drag.value;
  if (!state) return;
  const element = currentElements.value.find((item) => item.id === state.elementId);
  drag.value = null;
  if (!element || (state.dx === 0 && state.dy === 0)) return;
  session.execute(session.makeTransformCommand(element.id, {
    ...element.transform,
    x: state.originX + state.dx / session.zoom.value,
    y: state.originY + state.dy / session.zoom.value,
  }));
  void session.flush();
}

function cancelDrag(): void {
  drag.value = null;
}

function updateTransform(field: keyof LayoutTopLevelElementV1["transform"], event: Event): void {
  const element = primaryElement.value;
  if (!element || element.locked) return;
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  if (element.type === "balloon") {
    const minimum = field === "width" ? element.padding.left + element.padding.right + 1
      : field === "height" ? element.padding.top + element.padding.bottom + 1
        : 0;
    if (minimum > 0 && value < minimum) {
      actionError.value = `气泡${field === "width" ? "宽度" : "高度"}必须大于内边距 ${minimum - 1}px。`;
      return;
    }
  }
  actionError.value = null;
  session.execute(session.makeTransformCommand(element.id, { ...element.transform, [field]: value }));
}

function setElementLocked(elementId: string, locked: boolean): void {
  session.execute(command("element.set_locked", locked ? "锁定对象" : "解除锁定", {
    canvasId: session.currentCanvas.value!.id,
    elementId,
    locked,
  }));
}

function setElementHidden(elementId: string, hidden: boolean): void {
  session.execute(command("element.set_hidden", hidden ? "隐藏对象" : "显示对象", {
    canvasId: session.currentCanvas.value!.id,
    elementId,
    hidden,
  }));
}

function setSelectedLocked(locked: boolean): void {
  const commands = session.selectedElements.value.map((element) => command("element.set_locked", "批量锁定", {
    canvasId: session.currentCanvas.value!.id,
    elementId: element.id,
    locked,
  }));
  executeBatch("批量锁定", commands);
}

function setSelectedHidden(hidden: boolean): void {
  const commands = session.selectedElements.value.filter((element) => !element.locked).map((element) => command("element.set_hidden", "批量隐藏", {
    canvasId: session.currentCanvas.value!.id,
    elementId: element.id,
    hidden,
  }));
  executeBatch("批量隐藏", commands);
}

function executeBatch(label: string, commands: EditorCommandV1[]): void {
  if (!commands.length) return;
  const batch: EditorCommandBatchV1 = {
    schemaVersion: 1,
    batchId: `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    label,
    commands,
  };
  session.executeBatch(batch);
}

function alignSelected(axis: "left" | "center" | "top"): void {
  const selected = session.selectedElements.value.filter((element) => !element.locked);
  if (selected.length < 2) return;
  const anchor = selected[0]!.transform;
  const commands = selected.slice(1).map((element) => {
    const transform = { ...element.transform };
    if (axis === "left") transform.x = anchor.x;
    else if (axis === "center") transform.x = anchor.x + (anchor.width - transform.width) / 2;
    else transform.y = anchor.y;
    return command("element.set_transform", "对齐对象", {
      canvasId: session.currentCanvas.value!.id,
      elementId: element.id,
      transform,
    });
  });
  executeBatch("对齐对象", commands);
}

function distributeHorizontal(): void {
  const selected = [...session.selectedElements.value].filter((element) => !element.locked).sort((a, b) => a.transform.x - b.transform.x);
  if (selected.length < 3) return;
  const left = selected[0]!.transform.x;
  const right = selected.at(-1)!.transform.x;
  const step = (right - left) / (selected.length - 1);
  executeBatch("水平分布", selected.slice(1, -1).map((element, index) => command("element.set_transform", "水平分布", {
    canvasId: session.currentCanvas.value!.id,
    elementId: element.id,
    transform: { ...element.transform, x: left + step * (index + 1) },
  })));
}

function moveLayer(elementId: string, direction: "up" | "down"): void {
  const elements = currentElements.value;
  const index = elements.findIndex((element) => element.id === elementId);
  if (index < 0) return;
  let beforeElementId: string | null;
  if (direction === "up") beforeElementId = elements[index + 2]?.id ?? null;
  else beforeElementId = elements[index - 1]?.id ?? null;
  session.execute(command("element.reorder", direction === "up" ? "上移图层" : "下移图层", {
    canvasId: session.currentCanvas.value!.id,
    elementId,
    beforeElementId,
  }));
}

function getSourceAttentionTitle(code?: CandidateLockErrorCode): string {
  if (code === "CANDIDATE_LOCK_SET_INCOMPLETE") return "候选定稿尚未完整";
  if (code === "CANDIDATE_LOCK_SET_SOURCE_NOT_CURRENT" || code === "LAYOUT_SOURCE_UNRESOLVED") return "排版来源无法解析";
  if (code === "LAYOUT_SOURCE_DIGEST_MISMATCH") return "排版来源校验不一致";
  return "候选定稿已变化，当前排版需要处理";
}

function getSourceReasonLabel(code?: CandidateLockErrorCode): string {
  const labels: Partial<Record<CandidateLockErrorCode, string>> = {
    CANDIDATE_LOCK_SET_INCOMPLETE: "本章仍有镜头没有当前定稿，暂时不能生成或导出正式排版。",
    CANDIDATE_LOCK_SET_SOURCE_NOT_CURRENT: "当前候选定稿来自旧版上游内容或存在断链，需要重新确认。",
    LAYOUT_SOURCE_STALE: "排版仍引用更换前的候选定稿，系统已停止继续导出。",
    LAYOUT_SOURCE_UNRESOLVED: "排版引用的候选定稿无法解析，系统已停止继续导出。",
    LAYOUT_SOURCE_DIGEST_MISMATCH: "排版记录与候选定稿校验值不一致，系统已停止继续导出。",
  };
  return code ? labels[code] ?? `当前来源门禁未通过（${code}）。` : "当前来源门禁未通过。";
}

function handleKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
  const commandKey = event.metaKey || event.ctrlKey;
  if (commandKey && event.key.toLowerCase() === "a") {
    event.preventDefault();
    session.selectedElementIds.value = currentElements.value.map((element) => element.id);
    return;
  }
  if (commandKey && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) session.redo(); else session.undo();
    return;
  }
  if (event.key === "Escape") {
    session.selectedElementIds.value = [];
    return;
  }
  const step = event.shiftKey ? 10 : 1;
  const delta = event.key === "ArrowLeft" ? [-step, 0]
    : event.key === "ArrowRight" ? [step, 0]
      : event.key === "ArrowUp" ? [0, -step]
        : event.key === "ArrowDown" ? [0, step]
          : null;
  if (delta && session.selectedElements.value.length) {
    event.preventDefault();
    executeBatch("微移对象", session.selectedElements.value.filter((element) => !element.locked).map((element) => command("element.set_transform", "微移对象", {
      canvasId: session.currentCanvas.value!.id,
      elementId: element.id,
      transform: { ...element.transform, x: element.transform.x + delta[0], y: element.transform.y + delta[1] },
    })));
  }
}

watch(chapterId, () => {
  publicationPreflight.value = null;
  publicationAcknowledgedIssueKeys.value = [];
  publicationRequestId.value = null;
  void refreshPublicationHistory().catch(() => undefined);
});
watch(() => {
  const profile = session.document.value?.profile;
  const canvas = session.currentCanvas.value;
  return profile ? `${profile.kind}:${profile.width}:${profile.kind === "paged" ? profile.height : profile.defaultSectionHeight}:${canvas?.id ?? ""}:${canvas?.height ?? 0}` : "";
}, () => {
  const profile = session.document.value?.profile;
  if (!profile) return;
  resizeWidth.value = profile.width;
  resizeHeight.value = profile.kind === "paged" ? profile.height : profile.defaultSectionHeight;
  currentSectionHeight.value = session.currentCanvas.value?.height ?? resizeHeight.value;
}, { immediate: true });
onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
  void refreshPublicationHistory().catch(() => undefined);
  publicationPollTimer = setInterval(() => {
    if (publicationHistory.value?.items.some((item) => item.status === "queued" || item.status === "rendering")) {
      void refreshPublicationHistory().catch(() => undefined);
    }
  }, 1_000);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
  if (publicationPollTimer) clearInterval(publicationPollTimer);
});
</script>

<style scoped>
.layout-editor {
  position: relative;
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(116, 95, 255, 0.18);
  border-radius: 14px;
  background: #080d19;
  color: #e8edf8;
}

.layout-ai-drawer {
  position: absolute;
  z-index: 40;
  top: 53px;
  right: 0;
  bottom: 0;
  display: grid;
  align-content: start;
  gap: 14px;
  width: min(390px, calc(100% - 24px));
  box-sizing: border-box;
  border-left: 1px solid rgba(116, 95, 255, 0.34);
  background: rgba(9, 15, 28, 0.98);
  box-shadow: -20px 0 50px rgba(0, 0, 0, 0.42);
  padding: 16px;
  overflow: auto;
}

.layout-ai-drawer > header,
.layout-ai-drawer > header > div,
.ai-command-preview > div,
.ai-pending-state {
  display: flex;
  align-items: center;
  gap: 8px;
}

.layout-ai-drawer > header { justify-content: space-between; }
.layout-ai-drawer > header button { width: 32px; padding: 0; font-size: 20px; }
.layout-ai-drawer > p,
.ai-empty-state p,
.ai-command-preview p { margin: 0; color: #9eabc3; font-size: 12px; line-height: 1.65; }
.ai-command-preview,
.ai-empty-state { display: grid; gap: 10px; border: 1px solid rgba(148, 163, 184, 0.16); border-radius: 12px; background: rgba(19, 28, 48, 0.72); padding: 13px; }
.ai-command-preview small { color: #8da0c2; overflow-wrap: anywhere; }
.ai-command-preview ul { margin: 0; padding-left: 18px; color: #fcd34d; font-size: 11px; }
.ai-command-preview > div { justify-content: flex-end; flex-wrap: wrap; }
.ai-pending-state { color: #bdb5ff; }

button,
select,
input {
  font: inherit;
}

button {
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  background: rgba(19, 28, 48, 0.9);
  color: #d9e2f3;
  min-height: 32px;
  padding: 0 10px;
  cursor: pointer;
}

button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.editor-topbar,
.chapter-picker,
.top-actions,
.editor-status,
.canvas-toolbar,
.canvas-toolbar > div,
.canvas-toolbar label,
.property-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.editor-topbar {
  justify-content: space-between;
  min-height: 52px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  padding: 8px 12px;
  background: rgba(12, 18, 33, 0.96);
}

.layout-source-attention {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) repeat(2, auto);
  gap: 12px;
  align-items: start;
  border: 1px solid rgba(251, 146, 60, 0.32);
  border-radius: 12px;
  background: rgba(251, 146, 60, 0.09);
  padding: 13px;
  color: #fed7aa;
}

.layout-source-attention strong,
.layout-source-attention p,
.layout-source-attention small {
  display: block;
}

.layout-source-attention p {
  margin: 4px 0;
  color: #fdba74;
  font-size: 13px;
}

.layout-source-attention small {
  color: #cbd5e1;
  line-height: 1.5;
}

.layout-source-attention button {
  border: 1px solid rgba(251, 146, 60, 0.35);
  border-radius: 9px;
  background: rgba(15, 23, 42, 0.55);
  padding: 8px 10px;
  color: #fed7aa;
  font-weight: 800;
}

.m6-control-center {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  max-height: 286px;
  overflow: auto;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  padding: 10px 12px;
  background: #0a1120;
}

.m6-panel-head {
  display: flex;
  grid-column: 1 / -1;
  align-items: center;
  justify-content: space-between;
  color: #cbd5e1;
  font-size: 12px;
}

.m6-panel-head button {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
}

.m6-panel-head button:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #e2e8f0;
}

.m6-card {
  display: grid;
  align-content: start;
  gap: 9px;
  min-width: 0;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 11px;
  background: rgba(15, 23, 42, 0.76);
  padding: 11px;
}

.m6-card > header,
.revision-list section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.m6-card > header > div,
.revision-list section > div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.m6-card small,
.muted-copy,
.replacement-preview p,
.preflight-result > p {
  margin: 0;
  color: #8d9ab3;
  font-size: 10px;
  line-height: 1.5;
}

.m6-card > header > span,
.revision-list section > span {
  flex: none;
  border-radius: 999px;
  background: rgba(116, 95, 255, 0.14);
  color: #c8c1ff;
  padding: 4px 7px;
  font-size: 9px;
  font-weight: 900;
}

.m6-card .tone-ready { background: rgba(34, 197, 94, 0.14); color: #86efac; }
.m6-card .tone-warning { background: rgba(245, 158, 11, 0.14); color: #fcd34d; }
.m6-card .tone-blocked { background: rgba(244, 63, 94, 0.14); color: #fda4af; }
.m6-card > label { display: grid; gap: 5px; color: #9eabc3; font-size: 10px; font-weight: 800; }
.m6-card select { min-height: 31px; border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 7px; background: #0b1323; color: #dce5f5; padding: 0 7px; }
.m6-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.replacement-preview,
.preflight-result { display: grid; gap: 7px; border-top: 1px solid rgba(148, 163, 184, 0.12); padding-top: 8px; }
.replacement-preview ul { max-height: 66px; overflow: auto; margin: 0; padding-left: 17px; color: #aeb9cc; font-size: 9px; line-height: 1.55; }
.issue-row { display: grid; grid-template-columns: 18px minmax(0, 1fr); align-items: start; gap: 6px; border-radius: 7px; padding: 5px 6px; background: rgba(148, 163, 184, 0.06); }
.issue-row input { width: auto; margin: 2px 0 0; }
.issue-row > span:last-child { display: grid; gap: 2px; font-size: 10px; }
.issue-row.severity-error { color: #fda4af; background: rgba(190, 18, 60, 0.1); }
.issue-marker { text-align: center; font-weight: 900; }
.revision-list { display: grid; gap: 6px; max-height: 175px; overflow: auto; }
.revision-list section { border: 1px solid rgba(148, 163, 184, 0.1); border-radius: 8px; padding: 7px; }
.revision-list section button { min-height: 27px; padding: 0 6px; font-size: 9px; }
.publication-card { grid-column: 1 / -1; }
.publication-list { max-height: 230px; }
.publication-artifacts { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }
.publication-artifacts a { color: #93c5fd; font-size: 9px; font-weight: 800; text-decoration: none; border: 1px solid rgba(96, 165, 250, 0.24); border-radius: 999px; padding: 2px 6px; }
.publication-artifacts a:hover { background: rgba(59, 130, 246, 0.12); }

.chapter-picker select,
.create-card select,
.create-card input,
.property-panel input,
.property-panel select {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 8px;
  background: #0d1526;
  color: #eef3fb;
  min-height: 34px;
  padding: 0 9px;
}

.format-badge,
.editor-status,
.source-summary span {
  border-radius: 999px;
  background: rgba(116, 95, 255, 0.12);
  color: #bdb5ff;
  font-size: 12px;
  font-weight: 800;
  padding: 5px 9px;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c7a9;
}

.editor-status.is-unsaved .status-dot,
.editor-status.is-saving .status-dot { background: #fbbf24; }
.editor-status.is-conflict .status-dot,
.editor-status.is-error .status-dot { background: #fb7185; }
.editor-status small { color: #7f8ca8; }

.mobile-readonly,
.conflict-banner,
.error-banner {
  margin: 10px 12px 0;
  border-radius: 10px;
  padding: 11px 12px;
}

.mobile-readonly,
.conflict-banner {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mobile-readonly {
  border: 1px solid rgba(96, 165, 250, 0.28);
  background: rgba(30, 64, 175, 0.12);
}

.mobile-readonly p,
.conflict-banner p {
  margin: 3px 0 0;
  color: #9aa8c3;
  font-size: 12px;
}

.conflict-banner {
  border: 1px solid rgba(251, 146, 60, 0.32);
  background: rgba(124, 45, 18, 0.18);
  color: #fed7aa;
}

.conflict-banner div { flex: 1; }
.danger-action { border-color: rgba(251, 113, 133, 0.42); color: #fecdd3; }
.error-banner { border: 1px solid rgba(251, 113, 133, 0.32); background: rgba(127, 29, 29, 0.2); color: #fecdd3; }

.center-state,
.create-draft {
  display: grid;
  place-items: center;
  min-height: 440px;
  gap: 12px;
}

.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.create-card {
  display: grid;
  width: min(460px, calc(100% - 32px));
  gap: 14px;
  border: 1px solid rgba(116, 95, 255, 0.26);
  border-radius: 16px;
  background: #10182a;
  padding: 26px;
}

.create-card h2,
.create-card p { margin: 0; }
.create-card p { color: #93a0ba; line-height: 1.6; }
.create-card label { display: grid; gap: 6px; color: #aab5ca; font-size: 12px; font-weight: 800; }
.profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.primary-action { background: linear-gradient(135deg, #22c7a9, #745fff); border-color: transparent; color: white; font-weight: 900; }

.editor-shell {
  display: grid;
  grid-template-columns: 48px 238px minmax(0, 1fr) 320px;
  min-height: 0;
  overflow: hidden;
}

.tool-rail,
.canvas-navigation,
.inspector {
  min-height: 0;
  border-right: 1px solid rgba(148, 163, 184, 0.12);
  background: #0c1322;
}

.tool-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px 7px;
}

.tool-rail button { width: 34px; padding: 0; }
.tool-rail button.is-active { border-color: rgba(34, 199, 169, 0.5); background: rgba(34, 199, 169, 0.16); color: #8df0dc; }
.tool-rail span { height: 1px; width: 26px; background: rgba(148, 163, 184, 0.16); }

.canvas-navigation {
  overflow: auto;
  padding: 12px;
}

.panel-heading,
.selection-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.panel-heading small,
.selection-title small { color: #7f8ca8; }
.canvas-nav-item { display: flex; width: 100%; height: auto; gap: 9px; align-items: center; box-sizing: border-box; border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 8px; background: rgba(19, 28, 48, 0.9); color: #d9e2f3; text-align: left; margin-bottom: 7px; padding: 9px; cursor: pointer; }
.canvas-nav-item > span { display: grid; place-items: center; width: 26px; height: 32px; border-radius: 6px; background: #e9edf5; color: #111827; font-weight: 900; }
.canvas-nav-item > div:not(.canvas-nav-actions) { display: grid; gap: 3px; min-width: 0; flex: 1; }
.canvas-nav-item small { color: #7f8ca8; }
.canvas-nav-item.is-active { border-color: rgba(116, 95, 255, 0.55); background: rgba(116, 95, 255, 0.14); }
.canvas-nav-actions { display: flex; margin-left: auto; }
.canvas-nav-actions button { width: 25px; min-height: 25px; border: 0; padding: 0; background: transparent; }
.canvas-list-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.canvas-list-actions button { min-width: 0; padding: 0 5px; font-size: 11px; }

.shot-tray { margin-top: 18px; border-top: 1px solid rgba(148, 163, 184, 0.12); padding-top: 14px; }
.shot-tray > p { color: #7f8ca8; font-size: 11px; line-height: 1.5; }
.shot-tray article { display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: 8px; border: 1px solid rgba(148, 163, 184, 0.16); border-radius: 9px; padding: 7px; margin-bottom: 8px; cursor: pointer; }
.shot-tray article.is-selected { border-color: rgba(34, 199, 169, 0.48); background: rgba(34, 199, 169, 0.08); }
.shot-tray article > img { width: 54px; height: 54px; border-radius: 6px; object-fit: cover; }
.shot-tray article > div { display: grid; align-content: center; gap: 4px; min-width: 0; }
.shot-tray article small { color: #8491aa; font-size: 10px; }
.shot-actions { grid-column: 1 / -1; display: grid !important; grid-template-columns: repeat(3, 1fr); gap: 4px !important; }
.shot-actions button { min-width: 0; min-height: 27px; padding: 0 3px; font-size: 10px; }

.source-summary { display: grid; gap: 8px; margin-top: 18px; border-top: 1px solid rgba(148, 163, 184, 0.12); padding-top: 14px; }
.source-summary span { justify-self: start; }

.canvas-workspace {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #060a12;
}

.canvas-toolbar {
  justify-content: space-between;
  min-height: 44px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.11);
  padding: 6px 10px;
  background: #0b1220;
}
.canvas-toolbar button { min-height: 28px; font-size: 11px; }
.canvas-toolbar label { color: #8491aa; font-size: 11px; }
.canvas-toolbar input { width: 100px; }

.stage-scroll {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 48px;
  background-image: radial-gradient(rgba(148, 163, 184, 0.12) 1px, transparent 1px);
  background-size: 20px 20px;
}

.document-canvas {
  position: relative;
  margin: 0 auto;
  flex: none;
  overflow: hidden;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.45);
  touch-action: none;
}

.canvas-element {
  position: absolute;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  overflow: hidden;
  color: #657089;
  font-size: 11px;
  user-select: none;
  touch-action: none;
}

.canvas-element.type-panel_frame { border-style: solid; background: #d6dbe5; }
.canvas-element.type-balloon,
.canvas-element.type-text { overflow: visible; color: #111827; }
.canvas-element img { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
.canvas-element.is-selected { outline: 3px solid #22c7a9; outline-offset: 2px; }
.canvas-element.is-locked { cursor: not-allowed; }
.lock-mark { position: absolute; top: 3px; right: 3px; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 4px; background: rgba(8, 13, 25, 0.78); color: white; }
.canvas-element.has-text-overflow { outline: 3px solid #dc2626; outline-offset: 2px; }

.inspector {
  border-right: 0;
  border-left: 1px solid rgba(148, 163, 184, 0.12);
  overflow: hidden;
}
.inspector-tabs { display: grid; grid-template-columns: 1fr 1fr; padding: 8px; border-bottom: 1px solid rgba(148, 163, 184, 0.12); }
.inspector-tabs button { border: 0; background: transparent; }
.inspector-tabs button.is-active { background: rgba(116, 95, 255, 0.16); color: #cbc5ff; }
.property-panel,
.layer-panel { height: calc(100% - 49px); overflow: auto; padding: 12px; }
.property-panel > p { color: #7f8ca8; line-height: 1.6; }
.number-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.number-grid label { display: grid; gap: 5px; color: #8491aa; font-size: 11px; }
.number-grid input { width: 100%; box-sizing: border-box; }
.property-actions { flex-wrap: wrap; margin-top: 14px; }
.preset-picker,
.special-properties,
.reading-order { display: grid; gap: 9px; border-bottom: 1px solid rgba(148, 163, 184, 0.12); padding-bottom: 14px; margin-bottom: 14px; }
.section-heading { display: grid; gap: 3px; }
.section-heading small { color: #7f8ca8; font-size: 10px; }
.preset-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.preset-grid button { display: flex; justify-content: space-between; align-items: center; min-width: 0; padding: 6px 8px; font-size: 11px; }
.preset-grid button.is-active { border-color: rgba(116, 95, 255, 0.55); background: rgba(116, 95, 255, 0.16); }
.preset-grid small { color: #7f8ca8; font-size: 9px; }
.preset-picker > p,
.special-properties > p { margin: 0; color: #8491aa; font-size: 10px; line-height: 1.5; }
.special-properties > label { display: grid; gap: 5px; color: #8491aa; font-size: 11px; }
.special-properties .check-row { display: flex; align-items: center; grid-template-columns: auto 1fr; }
.special-properties .check-row input { width: auto; }
.text-preflight-summary { display: grid; gap: 6px; border: 1px solid rgba(148, 163, 184, 0.14); border-radius: 9px; padding: 10px; margin: 12px 0; }
.text-preflight-summary p { margin: 0; color: #93a4bf; font-size: 10px; line-height: 1.5; }
.reading-order article { display: flex; align-items: center; justify-content: space-between; gap: 6px; border: 1px solid rgba(148, 163, 184, 0.12); border-radius: 7px; padding: 5px 7px; font-size: 11px; }
.reading-order article div { display: flex; }
.reading-order article button { width: 25px; min-height: 25px; padding: 0; border: 0; background: transparent; }
.layer-panel article { display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 1px solid transparent; border-radius: 8px; padding: 7px; margin-bottom: 5px; cursor: pointer; }
.layer-panel article.is-selected { border-color: rgba(34, 199, 169, 0.36); background: rgba(34, 199, 169, 0.09); }
.layer-panel article > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.layer-panel article div { display: flex; }
.layer-panel article button { width: 27px; min-height: 27px; padding: 0; border: 0; background: transparent; }
.hidden-summary { color: #7f8ca8; font-size: 11px; padding: 8px; }

.editor-shell.is-readonly .canvas-element { pointer-events: none; }

@media (max-width: 1260px) {
  .editor-shell { grid-template-columns: 44px 210px minmax(0, 1fr) 280px; }
  .top-actions button:nth-last-child(-n + 2) { display: none; }
  .m6-control-center { grid-template-columns: 1fr 1fr; }
  .history-card { grid-column: 1 / -1; }
}

@media (max-width: 1023px) {
  .layout-editor { min-height: 680px; overflow: visible; }
  .editor-topbar { flex-wrap: wrap; }
  .editor-shell { grid-template-columns: 1fr; overflow: visible; }
  .tool-rail,
  .canvas-navigation,
  .inspector { display: none; }
  .canvas-workspace { min-height: 560px; }
  .m6-control-center { grid-template-columns: 1fr; max-height: none; }
  .history-card { grid-column: auto; }
  .layout-source-attention { grid-template-columns: auto minmax(0, 1fr); }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation: none !important; }
}
</style>

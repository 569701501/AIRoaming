<template>
  <section class="layout-editor" data-testid="layout-editor-shell" aria-label="成稿编辑器">
    <header class="editor-topbar">
      <div class="chapter-picker">
        <LayoutTemplate :size="17" />
        <select :value="chapterId ?? ''" :disabled="loading || mobilePreviewBusy || exportOperationBusy" @change="selectChapter">
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
        <button type="button" :disabled="!session.server.value || mobilePreviewBusy || exportOperationBusy" title="打开独立手机只读预览" aria-label="手机预览" @click="openMobilePreview"><Smartphone :size="16" /></button>
        <button
          class="primary-action"
          data-testid="layout-simple-export"
          type="button"
          :disabled="!session.server.value || session.isReadOnly.value || exportOperationBusy"
          title="检查文字后导出本章"
          @click="startSimpleExport"
        ><Download :size="16" />{{ simpleExportBusy ? '导出中…' : '导出' }}</button>
      </div>
    </header>

    <div
      v-if="mobilePreviewFeedback"
      class="mobile-preview-feedback"
      :class="{ 'is-error': mobilePreviewFallbackUrl }"
      :role="mobilePreviewFallbackUrl ? 'alert' : 'status'"
      aria-live="polite"
      data-testid="mobile-preview-feedback"
    >
      <Smartphone :size="17" />
      <span>{{ mobilePreviewFeedback }}</span>
      <a v-if="mobilePreviewFallbackUrl" :href="mobilePreviewFallbackUrl">在当前页打开手机预览</a>
      <button
        type="button"
        aria-label="关闭手机预览提示"
        @click="mobilePreviewFeedback = null; mobilePreviewFallbackUrl = null"
      ><X :size="14" /></button>
    </div>

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
      </div>
      <button type="button" :disabled="loading" @click="$emit('goCandidates')">查看候选定稿</button>
      <button
        v-if="replaceableImageElementIds.length"
        type="button"
        :disabled="session.isReadOnly.value || sourceSyncBusy"
        @click="syncLatestSources"
      >{{ sourceSyncBusy ? '同步中…' : '同步最新镜头' }}</button>
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

    <div v-if="exportDialogOpen" class="export-dialog-backdrop" @click.self="closeExportDialog">
      <section
        class="export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="layout-export-dialog-title"
        data-testid="layout-export-dialog"
      >
        <header>
          <div>
            <strong id="layout-export-dialog-title">{{ exportDialogTitle }}</strong>
            <small>{{ exportDialogSubtitle }}</small>
          </div>
          <button v-if="!exportOperationBusy" type="button" aria-label="关闭导出提示" @click="closeExportDialog"><X :size="16" /></button>
        </header>

        <template v-if="exportDialogStage === 'blocked'">
          <div class="export-dialog-state is-blocked">
            <AlertTriangle :size="28" />
            <p>这不是可以忽略的提醒。请先修正下面的问题，再重新导出。</p>
          </div>
          <ul class="export-issue-list">
            <li v-for="issue in exportDialogIssues" :key="issue.issueKey">
              <strong>{{ preflightIssueLabel(issue) }}</strong>
              <small>{{ exportIssueLocation(issue) }}</small>
              <p v-if="exportIssueBlockingText(issue)">{{ exportIssueBlockingText(issue) }}</p>
            </li>
          </ul>
          <footer>
            <button class="primary-action" type="button" @click="closeExportDialog">返回修改</button>
          </footer>
        </template>

        <template v-else-if="exportDialogStage === 'review'">
          <p class="export-review-intro">下面是你主动修改、删除或添加的文字。请确认成稿就按当前内容导出。</p>
          <div class="export-review-list">
            <article v-for="issue in exportDialogIssues" :key="issue.issueKey">
              <header>
                <strong>{{ preflightIssueLabel(issue) }}</strong>
                <small>{{ exportIssueLocation(issue) }}</small>
              </header>
              <dl v-if="isTextDifferenceIssue(issue)">
                <div>
                  <dt>原文</dt>
                  <dd>{{ exportIssueText(issue.details.sourceText, '无正式原文') }}</dd>
                </div>
                <div>
                  <dt>当前文字</dt>
                  <dd>{{ exportIssueText(issue.details.currentText, '已删除') }}</dd>
                </div>
              </dl>
              <p v-else>{{ exportIssueDescription(issue) }}</p>
            </article>
          </div>
          <footer>
            <button type="button" @click="closeExportDialog">返回修改</button>
            <button class="primary-action" type="button" @click="confirmSimpleExport">按当前文字导出</button>
          </footer>
        </template>

        <template v-else-if="activeExportPublication?.status === 'ready'">
          <div class="export-dialog-state is-ready">
            <Download :size="30" />
            <strong>导出完成</strong>
            <p>成品已经生成，可以直接下载。</p>
          </div>
          <nav class="export-artifacts" aria-label="导出产物">
            <a
              v-for="artifact in activeExportPublication.artifacts"
              :key="artifact.assetId"
              :href="publicationArtifactUrl(activeExportPublication.id, artifact.assetId)"
              target="_blank"
              rel="noopener"
            >{{ artifactLabel(artifact.role, artifact.order) }}</a>
          </nav>
          <footer>
            <button class="primary-action" type="button" @click="closeExportDialog">完成</button>
          </footer>
        </template>

        <template v-else-if="exportDialogStage === 'failed' || activeExportPublication?.status === 'failed' || activeExportPublication?.status === 'cancelled'">
          <div class="export-dialog-state is-blocked">
            <AlertTriangle :size="28" />
            <strong>导出没有完成</strong>
            <p>{{ exportDialogError || '导出任务失败，请稍后重试。' }}</p>
          </div>
          <footer>
            <button type="button" @click="closeExportDialog">返回修改</button>
            <button class="primary-action" type="button" @click="retrySimpleExport">重新导出</button>
          </footer>
        </template>

        <template v-else>
          <div class="export-dialog-state">
            <LoaderCircle class="spin" :size="30" />
            <strong>{{ activeExportPublication ? publicationStateLabel(activeExportPublication.status) : publicationRequestId ? '正在确认导出状态' : '正在检查成稿' }}</strong>
            <p>{{ activeExportPublication ? '正在生成正式成品，完成后会在这里提供下载。' : exportDialogError || '正在核对文字、图片来源和导出条件。' }}</p>
          </div>
        </template>
      </section>
    </div>

    <section v-if="session.saveState.value === 'loading'" class="center-state">
      <LoaderCircle class="spin" :size="28" />
      <strong>正在读取数据库草稿</strong>
    </section>

    <section v-else-if="session.saveState.value === 'missing'" class="create-draft">
      <div v-if="session.legacyStatus.value" class="create-card legacy-cutover-card" data-testid="layout-legacy-cutover">
        <AlertTriangle :size="30" />
        <h2>{{ session.legacyStatus.value.state === 'legacy_convertible' ? '发现可转换的旧排版' : '旧排版来源无法完整解析' }}</h2>
        <p v-if="session.legacyStatus.value.state === 'legacy_convertible'">系统会保留旧页面尺寸、顺序和已核对来源，把内容转换成可继续编辑的数据库草稿；不会自动创建正式版本。</p>
        <p v-else>系统不会把缺失的旧候选来源猜成当前来源。只有你明确确认后，才会使用当前 G4 定稿重新建立草稿；旧 metadata 与迁移 provenance 继续保留。</p>
        <small>旧摘要：{{ session.legacyStatus.value.legacyDocumentDigest ? shortDigest(session.legacyStatus.value.legacyDocumentDigest) : '无' }} · provenance {{ session.legacyStatus.value.provenancePreserved ? '已保留' : '待核对' }}</small>
        <button
          v-if="session.legacyStatus.value.state === 'legacy_convertible'"
          class="primary-action"
          type="button"
          :disabled="session.isReadOnly.value || legacyCutoverBusy"
          @click="convertLegacyDraft"
        >转换并继续编辑</button>
        <button
          v-else
          class="primary-action"
          type="button"
          :disabled="session.isReadOnly.value || legacyCutoverBusy || !canInitialize"
          @click="rebuildLegacyDraft"
        >明确使用当前定稿重建</button>
        <button type="button" @click="$emit('goCandidates')">返回候选图核对来源</button>
      </div>
      <div v-else class="create-card smart-compose-card" data-testid="layout-smart-compose-state">
        <template v-if="composition.busy.value">
          <LoaderCircle class="spin compose-mark" :size="34" />
          <h2>{{ composition.phaseLabel.value }}</h2>
          <p>系统会一次完成画格布局、图片放置、对白气泡和阅读顺序。完成后直接进入可编辑成稿。</p>
          <div class="compose-progress" role="progressbar" :aria-valuenow="composition.progressPercent.value" aria-valuemin="0" aria-valuemax="100">
            <span :style="{ width: `${composition.progressPercent.value}%` }" />
          </div>
          <small>{{ composition.progressPercent.value }}% · 生成期间不会创建正式版本或直接导出</small>
        </template>
        <template v-else-if="composition.errorMessage.value">
          <AlertTriangle class="compose-mark is-error" :size="34" />
          <h2>这次成稿没有生成完成</h2>
          <p>{{ composition.errorMessage.value }}</p>
          <button class="primary-action" type="button" @click="$emit('goCandidates')">返回候选图检查</button>
        </template>
        <template v-else-if="!sourceReadyForCompose">
          <AlertTriangle class="compose-mark" :size="34" />
          <h2>还差已确认的候选图</h2>
          <p>{{ initialCompositionBlockedReason }}</p>
          <button class="primary-action" type="button" @click="$emit('goCandidates')">去确认候选图</button>
        </template>
        <template v-else>
          <LoaderCircle class="spin compose-mark" :size="34" />
          <h2>正在启动首次排版</h2>
          <p>系统会根据项目类型、分镜、候选图和对白自动完成第一版，你不需要选择模式或参数。</p>
          <button type="button" @click="$emit('goCandidates')">返回候选图检查</button>
        </template>
      </div>
    </section>

    <div v-else-if="session.document.value && session.currentCanvas.value" class="editor-shell" :class="{ 'is-readonly': session.isReadOnly.value }">
      <aside v-if="leftPanelOpen" class="canvas-navigation">
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
            <button
              type="button"
              :title="leftPanelOpen ? '收起页面与素材栏' : '展开页面与素材栏'"
              :aria-label="leftPanelOpen ? '收起页面与素材栏' : '展开页面与素材栏'"
              @click="leftPanelOpen = !leftPanelOpen"
            ><PanelLeftClose v-if="leftPanelOpen" :size="14" /><PanelLeftOpen v-else :size="14" /></button>
            <button type="button" :disabled="session.selectedElementIds.value.length < 2 || session.isReadOnly.value" @click="alignSelected('left')">左对齐</button>
            <button type="button" :disabled="session.selectedElementIds.value.length < 2 || session.isReadOnly.value" @click="alignSelected('center')">水平居中</button>
            <button type="button" :disabled="session.selectedElementIds.value.length < 2 || session.isReadOnly.value" @click="alignSelected('top')">顶对齐</button>
            <button type="button" :disabled="session.selectedElementIds.value.length < 3 || session.isReadOnly.value" @click="distributeHorizontal">水平分布</button>
            <button type="button" :disabled="!primaryElement || session.isReadOnly.value" @click="duplicatePrimaryElement">复制对象</button>
          </div>
          <label>
            缩放
            <input v-model.number="session.zoom.value" type="range" min="0.1" max="0.8" step="0.02" />
            <span>{{ Math.round(session.zoom.value * 100) }}%</span>
          </label>
        </div>
        <div class="stage-wrap">
          <nav class="canvas-tool-float" aria-label="画布工具">
            <button :class="{ 'is-active': activeTool === 'select' }" type="button" title="选择" aria-label="选择工具" @click="activeTool = 'select'"><MousePointer2 :size="16" /></button>
            <button :class="{ 'is-active': activeTool === 'pan' }" type="button" title="平移" aria-label="平移工具" @click="activeTool = 'pan'"><Hand :size="16" /></button>
            <button
              :class="{ 'is-active': activeTool === 'crop' }"
              type="button"
              title="画布内调整图片裁切"
              aria-label="裁切工具"
              :disabled="session.isReadOnly.value || !primaryCrop"
              @click="activeTool = 'crop'"
            ><Crop :size="16" /></button>
            <span />
            <button type="button" :disabled="session.isReadOnly.value" title="添加空画格" aria-label="添加空画格" @click="addPanel"><SquareDashed :size="16" /></button>
            <button type="button" :disabled="session.isReadOnly.value || !selectedSource" title="添加所选镜头为自由图片" aria-label="添加所选镜头为自由图片" @click="selectedSource && addFreeImage(selectedSource)"><ImageIcon :size="16" /></button>
            <button type="button" :disabled="session.isReadOnly.value" title="添加文字" aria-label="添加文字" @click="addText"><Type :size="16" /></button>
            <button type="button" :disabled="session.isReadOnly.value" title="添加气泡" aria-label="添加气泡" @click="addBalloon"><MessageCircle :size="16" /></button>
          </nav>
          <nav
            v-if="canReplacePrimarySource && !session.isReadOnly.value && sourceCatalogItems.length"
            class="shot-replace-strip"
            aria-label="换图镜头条"
          >
            <span>换图</span>
            <button
              v-for="item in sourceCatalogItems"
              :key="item.source.shotId"
              type="button"
              :title="`替换为镜头 ${item.order}`"
              @click="replacePrimarySource(item)"
            >
              <img :src="api.projectAssetFileUrl(snapshot.project.id, item.source.assetId)" :alt="`镜头 ${item.order}`" />
              <small>{{ item.order }}</small>
            </button>
          </nav>
          <div
            ref="stageScroll"
            class="stage-scroll"
          >
          <div
            class="document-canvas"
            :style="canvasStyle"
          >
            <article
              v-for="element in visibleElements"
              :key="element.id"
              class="canvas-element"
              :class="[`type-${element.type}`, { 'is-selected': isSelected(element.id), 'is-locked': element.locked, 'has-text-overflow': textIssueElementIds.has(element.id) }]"
              :style="[elementStyle(element), panelFrameStyle(element)]"
              :aria-label="`${element.name}${element.locked ? '，已锁定' : ''}${element.hidden ? '，已隐藏' : ''}`"
              tabindex="0"
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
                <span class="panel-border-overlay" :style="panelBorderOverlayStyle(element)" aria-hidden="true" />
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
                :font-catalog="session.fontCatalog.value?.items ?? []"
                :scale="session.zoom.value"
                :overflow="textIssueElementIds.has(element.id)"
              />
              <span v-if="element.locked" class="lock-mark"><Lock :size="12" /></span>
            </article>
            <LayoutKonvaInteractionLayer
              :canvas="session.currentCanvas.value"
              :selected-element-ids="session.selectedElementIds.value"
              :zoom="session.zoom.value"
              :active-tool="activeTool"
              :read-only="session.isReadOnly.value"
              @select-element="selectKonvaElement"
              @replace-selection="replaceKonvaSelection"
              @commit-transform="commitKonvaTransforms"
              @commit-tail="commitKonvaTail"
              @commit-crop="commitKonvaCrop"
              @pan="panKonvaViewport"
              @zoom="zoomKonvaViewport"
            />
          </div>
          </div>
        </div>
      </main>

      <aside class="inspector">
        <div class="inspector-tabs">
          <button type="button" :class="{ 'is-active': inspectorTab === 'properties' }" @click="inspectorTab = 'properties'">属性</button>
          <button type="button" :class="{ 'is-active': inspectorTab === 'layers' }" @click="inspectorTab = 'layers'">图层</button>
        </div>

        <div v-if="inspectorTab === 'properties'" class="property-panel">
          <template v-if="primaryElement">
            <div class="selection-title">
              <strong>{{ primaryElement.name }}</strong>
              <small>{{ primaryElement.type }}</small>
            </div>
            <div class="property-actions">
              <button type="button" :disabled="session.isReadOnly.value" @click="setSelectedLocked(!primaryElement.locked)">
                {{ primaryElement.locked ? '解除锁定' : '锁定对象' }}
              </button>
              <button
                type="button"
                :disabled="session.isReadOnly.value || primaryElement.locked"
                @click="setSelectedHidden(!primaryElement.hidden)"
              >{{ primaryElement.hidden ? '显示对象' : '隐藏对象' }}</button>
              <button type="button" :disabled="session.isReadOnly.value || primaryElement.locked" @click="deletePrimaryElement">删除对象</button>
            </div>
            <section class="precision-adjust">
              <button
                type="button"
                class="collapsible-head"
                :aria-expanded="precisionOpen"
                @click="precisionOpen = !precisionOpen"
              ><ChevronDown :size="14" :class="{ 'is-collapsed': !precisionOpen }" />精确调整</button>
              <div v-show="precisionOpen" class="number-grid">
                <label>X <input :value="primaryElement.transform.x" type="number" :disabled="cannotEditPrimary" @change="updateTransform('x', $event)" /></label>
                <label>Y <input :value="primaryElement.transform.y" type="number" :disabled="cannotEditPrimary" @change="updateTransform('y', $event)" /></label>
                <label>宽 <input :value="primaryElement.transform.width" type="number" min="1" :disabled="cannotEditPrimary" @change="updateTransform('width', $event)" /></label>
                <label>高 <input :value="primaryElement.transform.height" type="number" min="1" :disabled="cannotEditPrimary" @change="updateTransform('height', $event)" /></label>
                <label>旋转 <input :value="primaryElement.transform.rotation" type="number" :disabled="cannotEditPrimary" @change="updateTransform('rotation', $event)" /></label>
                <label>对象透明 <input :value="primaryElement.transform.opacity" type="number" min="0.05" max="1" step="0.05" :disabled="cannotEditPrimary" @change="updateTransform('opacity', $event)" /></label>
              </div>
            </section>

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
              <button
                v-if="primaryCrop"
                type="button"
                :disabled="cannotEditPrimary"
                @click="activeTool = 'crop'"
              >在画布上拖调裁切</button>
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

            <section v-if="primaryElement.type === 'text'" class="special-properties" data-testid="text-semantic-controls">
              <div class="section-heading"><strong>文字角色</strong><small>只改变既有 semantic，不改文字、样式或位置</small></div>
              <label>用途
                <select :value="primaryElement.semantic" :disabled="cannotEditPrimary" @change="setTextSemantic">
                  <option value="custom">普通文字</option>
                  <option value="title">标题</option>
                  <option value="caption">说明文字</option>
                  <option value="sfx">拟声字 / SFX</option>
                </select>
              </label>
              <p v-if="primaryElement.semantic === 'sfx'">当前对象已标记为拟声字；几何、富文本与图层仍使用同一正式文字契约。</p>
              <div class="sfx-preset-row" data-testid="sfx-preset-controls">
                <button type="button" :disabled="cannotEditPrimary" @click="applySfxPreset('impact')">冲击拟声</button>
                <button type="button" :disabled="cannotEditPrimary" @click="applySfxPreset('electric')">电光拟声</button>
              </div>
              <p>拟声预设会作为一个命令批应用 semantic、真实字体面、颜色、描边与可选旋转；文字、字号、大小和位置保持不变。</p>
            </section>

            <LayoutRichTextEditor
              v-if="primaryElement.type === 'text' || primaryElement.type === 'balloon'"
              :key="primaryElement.id"
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
                <select :value="resolveLayoutBalloonVisualRoleV1(primaryElement)" :disabled="cannotEditPrimary" @change="setBalloonKind">
                  <option value="speech">对白</option>
                  <option value="thought">思考</option>
                  <option value="shout">喊叫</option>
                  <option value="caption">旁白框</option>
                </select>
              </label>
              <div class="balloon-preset-row" data-testid="balloon-appearance-presets">
                <button
                  v-for="preset in balloonAppearancePresets"
                  :key="preset.id"
                  type="button"
                  :disabled="cannotEditPrimary || Boolean(implicitReservedBalloonRole)"
                  @click="applyBalloonAppearancePreset(preset)"
                >{{ preset.label }}</button>
              </div>
              <p>外观预设只展开为当前气泡的填充、描边与描边宽；不会保存 preset id，也不会改气泡类型、文字或尾巴。</p>
              <div class="number-grid">
                <label>填充 RGBA
                  <input
                    :value="primaryElement.fillColor"
                    type="text"
                    maxlength="9"
                    spellcheck="false"
                    :disabled="cannotEditPrimary || Boolean(implicitReservedBalloonRole)"
                    @change="updateBalloonVisualColor('fillColor', $event)"
                  />
                </label>
                <label>描边 RGBA
                  <input
                    :value="primaryElement.strokeColor"
                    type="text"
                    maxlength="9"
                    spellcheck="false"
                    :disabled="cannotEditPrimary || Boolean(implicitReservedBalloonRole)"
                    @change="updateBalloonVisualColor('strokeColor', $event)"
                  />
                </label>
                <label>描边宽
                  <input :value="primaryElement.strokeWidth" type="number" min="0" max="512" step="1" :disabled="cannotEditPrimary" @change="updateBalloonVisualNumber('strokeWidth', $event)" />
                </label>
                <label>文字垂直
                  <select :value="primaryElement.verticalAlign" :disabled="cannotEditPrimary" @change="updateBalloonVerticalAlign">
                    <option value="start">顶部</option>
                    <option value="center">居中</option>
                    <option value="end">底部</option>
                  </select>
                </label>
                <label>上内边距 <input :value="primaryElement.padding.top" type="number" min="0" :disabled="cannotEditPrimary" @change="updateBalloonPadding('top', $event)" /></label>
                <label>右内边距 <input :value="primaryElement.padding.right" type="number" min="0" :disabled="cannotEditPrimary" @change="updateBalloonPadding('right', $event)" /></label>
                <label>下内边距 <input :value="primaryElement.padding.bottom" type="number" min="0" :disabled="cannotEditPrimary" @change="updateBalloonPadding('bottom', $event)" /></label>
                <label>左内边距 <input :value="primaryElement.padding.left" type="number" min="0" :disabled="cannotEditPrimary" @change="updateBalloonPadding('left', $event)" /></label>
              </div>
              <p v-if="implicitReservedBalloonRole" class="reserved-color-warning">
                这个旧气泡依赖保留色对表达“{{ implicitReservedBalloonRole === 'thought' ? '思考' : '喊叫' }}”轮廓。请先切换为普通对白，再自定义颜色，避免重新渲染时形状漂移。
                <button
                  type="button"
                  data-testid="normalize-reserved-balloon"
                  :disabled="cannotEditPrimary"
                  @click="normalizeReservedBalloonToSpeech"
                >转换为普通对白外观</button>
              </p>
              <p v-else>RGBA 色值控制泡体/描边自身透明度；上方“对象透明”同时作用于气泡与文字。</p>
              <label class="check-row"><input :checked="primaryElement.tail.enabled" type="checkbox" :disabled="cannotEditPrimary || primaryElement.balloonKind === 'caption'" @change="updateBalloonTailBoolean" />显示尾巴</label>
              <div class="number-grid">
                <label>根位置 <input :value="primaryElement.tail.rootRatio" type="number" min="0" max="1" step="0.05" :disabled="cannotEditPrimary" @change="updateBalloonTailNumber('rootRatio', $event)" /></label>
                <label>根宽 <input :value="primaryElement.tail.baseWidth" type="number" min="1" max="1024" :disabled="cannotEditPrimary" @change="updateBalloonTailNumber('baseWidth', $event)" /></label>
                <label>目标 X <input :value="primaryElement.tail.targetX" type="number" :disabled="cannotEditPrimary" @change="updateBalloonTailNumber('targetX', $event)" /></label>
                <label>目标 Y <input :value="primaryElement.tail.targetY" type="number" :disabled="cannotEditPrimary" @change="updateBalloonTailNumber('targetY', $event)" /></label>
              </div>
              <p>在画布上直接拖动即可移动气泡；尾巴端点显示为小圆点时也可拖动。文字内容在上方编辑器中修改。</p>
            </section>

            <section v-if="primaryElement.type === 'text' || primaryElement.type === 'balloon'" class="text-preflight-summary" data-testid="text-preflight-summary">
              <strong>文字预检</strong>
              <p v-if="!primaryTextIssues.length">当前字体、glyph 与文本框容量通过。</p>
              <p v-for="(issue, index) in primaryTextIssues" :key="`${issue.code}-${index}`">{{ textIssueLabel(issue) }}</p>
            </section>

          </template>
          <template v-else>
            <p class="inspector-hint">点选画布中的画格、图片或气泡，这里会出现对应的调整操作。</p>
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

          <section class="page-settings">
            <button
              type="button"
              class="collapsible-head"
              :aria-expanded="pageSettingsOpen"
              @click="pageSettingsOpen = !pageSettingsOpen"
            ><ChevronDown :size="14" :class="{ 'is-collapsed': !pageSettingsOpen }" />页面设置</button>
            <div v-show="pageSettingsOpen" class="page-settings-body">
              <section class="special-properties profile-resize" data-testid="layout-profile-resize-preview" aria-label="画布尺寸预览">
                <div class="section-heading">
                  <strong>画布尺寸</strong>
                  <small>先预览，再一次应用到当前成稿</small>
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
                <button type="button" :disabled="session.isReadOnly.value || !profileResizeResult.preview" @click="applyProfileResize">应用尺寸调整</button>
                <template v-if="!isPaged">
                  <label>当前段高度
                    <input v-model.number="currentSectionHeight" type="number" min="320" max="8192" :disabled="session.isReadOnly.value" />
                  </label>
                  <button type="button" :disabled="session.isReadOnly.value || currentSectionHeight < 320" @click="applyCurrentSectionHeight">调整当前段高</button>
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
            </div>
          </section>
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Crop,
  Download,
  Eye,
  EyeOff,
  Hand,
  Image as ImageIcon,
  LayoutTemplate,
  LoaderCircle,
  Lock,
  MessageCircle,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  Smartphone,
  SquareDashed,
  Type,
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
  LayoutPreflightCodeV2,
  LayoutPreflightIssueV1,
  LayoutPreflightIssueV2,
  LayoutPreflightReportV1,
  LayoutPreflightReportV2,
  LayoutProfileResizeModeV1,
  LayoutPublicationHistoryResponseV1,
  LayoutPublicationHistoryResponseV2,
  LayoutPublicationProfileV1,
  LayoutPublicationSummaryV1,
  LayoutPublicationSummaryV2,
  LayoutRevisionDetailV1OrV2,
  LayoutSourceCatalogItemV1,
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
  layoutBalloonVisualPresetV1,
  resolveLayoutBalloonVisualRoleV1,
  projectVisibleShotPlacementsV1,
  replaceRichTextRange,
  LayoutPublicationProfileCodecV1,
  previewLayoutProfileResizeV1,
} from "@airoaming/shared";

import { useLayoutEditorSession } from "../../composables/layout-editor-session";
import { useLayoutCompositionSession } from "../../composables/layout-composition-session";
import { useLayoutFontLoader } from "../../composables/layout-font-loader";
import { api, ApiClientError } from "../../services/api";
import LayoutElementTextPreview from "./LayoutElementTextPreview.vue";
import LayoutKonvaInteractionLayer from "./LayoutKonvaInteractionLayer.vue";
import LayoutRichTextEditor from "./LayoutRichTextEditor.vue";
import {
  buildBalloonVisualStyleCommandV1,
  buildLayoutSfxPresetBatchV1,
} from "./layout-editor-presets";
import {
  projectKonvaViewportZoomAnchorV1,
  type KonvaTransformCommitV1,
} from "./layout-konva-adapter";
import { layoutImagePreviewStyleV1 } from "./layout-image-preview";
import { mergeLayoutPublicationSnapshot } from "./layout-publication-state";
import { openDetachedPreviewWindowAfterPreparation } from "./layout-preview-window";

type LayoutPreflightIssue = LayoutPreflightIssueV1 | LayoutPreflightIssueV2;
type ExportDialogStage = "checking" | "blocked" | "review" | "publishing" | "failed";
type ExportResumeTarget = "revision" | "publication";

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
const composition = useLayoutCompositionSession({ projectId, chapterId });
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
const mobilePreviewFeedback = ref<string | null>(null);
const mobilePreviewFallbackUrl = ref<string | null>(null);
const mobilePreviewBusy = ref(false);
const exportOperationBusy = ref(false);
const exportDialogOpen = ref(false);
const exportDialogStage = ref<ExportDialogStage>("checking");
const exportDialogIssues = ref<LayoutPreflightIssue[]>([]);
const exportDialogError = ref<string | null>(null);
const exportResumeTarget = ref<ExportResumeTarget>("revision");
const exportRevisionAcknowledgementKeys = ref<string[]>([]);
const exportReviewedIssueKeys = ref<string[]>([]);
const exportChapterId = ref<string | null>(null);
const exportLayoutRevision = ref<LayoutRevisionDetailV1OrV2 | null>(null);
const activeExportPublicationId = ref<string | null>(null);
const sourceSyncBusy = ref(false);
const publicationPreflight = ref<LayoutPreflightReportV1 | LayoutPreflightReportV2 | null>(null);
const publicationHistory = ref<LayoutPublicationHistoryResponseV1 | LayoutPublicationHistoryResponseV2 | null>(null);
const activeExportPublicationSnapshot = ref<LayoutPublicationSummaryV1 | LayoutPublicationSummaryV2 | null>(null);
const publicationRequestId = ref<string | null>(null);
const publicationBusy = ref(false);
const activeTool = ref<"select" | "pan" | "crop">("select");
const stageScroll = ref<HTMLElement | null>(null);
const leftPanelOpen = ref(true);
const pageSettingsOpen = ref(true);
const precisionOpen = ref(false);
const legacyCutoverBusy = ref(false);
let publicationPollTimer: ReturnType<typeof setInterval> | null = null;
let publicationRefreshGeneration = 0;
let publicationRefreshFlight: { key: string; promise: Promise<void> } | null = null;
let publicationRetryAfter = 0;
let autoCompositionKey: string | null = null;
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

interface BalloonAppearancePreset {
  id: string;
  label: string;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
}

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
const implicitReservedBalloonRole = computed<"thought" | "shout" | null>(() => {
  const element = primaryElement.value;
  if (element?.type !== "balloon" || element.balloonKind !== "speech") return null;
  const role = resolveLayoutBalloonVisualRoleV1(element);
  return role === "thought" || role === "shout" ? role : null;
});
const balloonAppearancePresets = computed<BalloonAppearancePreset[]>(() => {
  const element = primaryElement.value;
  if (element?.type !== "balloon") return [];
  const role = resolveLayoutBalloonVisualRoleV1(element);
  const width = (value: number) => isPaged.value ? value + 1 : value;
  if (role === "thought") {
    return [
      { id: "thought-soft", label: "柔和思绪", fillColor: "#FFFDF5FF", strokeColor: "#374151FF", strokeWidth: width(4) },
      { id: "thought-blue", label: "蓝色思绪", fillColor: "#EFF6FFFF", strokeColor: "#1D4ED8FF", strokeWidth: width(4) },
    ];
  }
  if (role === "shout") {
    return [
      { id: "shout-ember", label: "热烈喊叫", fillColor: "#FFF7EDFF", strokeColor: "#B91C1CFF", strokeWidth: width(6) },
      { id: "shout-ink", label: "黑白冲击", fillColor: "#FFFFFFFF", strokeColor: "#111827FF", strokeWidth: width(8) },
    ];
  }
  if (role === "caption") {
    return [
      { id: "caption-dark", label: "深色旁白", fillColor: "#111827EE", strokeColor: "#111827FF", strokeWidth: width(3) },
      { id: "caption-paper", label: "纸张旁白", fillColor: "#FEF3C7F2", strokeColor: "#78350FFF", strokeWidth: width(3) },
    ];
  }
  return [
    { id: "speech-classic", label: "经典对白", fillColor: "#FFFFFFFF", strokeColor: "#111827FF", strokeWidth: width(4) },
    { id: "speech-teal", label: "青绿对白", fillColor: "#F0FDFAF2", strokeColor: "#0F766EFF", strokeWidth: width(4) },
  ];
});
const selectedPreset = computed(() => presetOptions.find((preset) => preset.id === selectedPresetId.value)!);
const occupiedPanelCount = computed(() => currentPanels.value.filter((panel) => panel.contentImage).length);
const canApplyPreset = computed(() => selectedPreset.value.count >= occupiedPanelCount.value && Boolean(session.currentCanvas.value));
const presetPreviewLabel = computed(() => canApplyPreset.value
  ? `将 ${occupiedPanelCount.value} 张已放置图片按阅读顺序映射到 ${selectedPreset.value.count} 个正式画格。`
  : `当前有 ${occupiedPanelCount.value} 个已占用画格，${selectedPreset.value.count} 格模板会丢图，已阻止应用。`);
const cannotEditPrimary = computed(() => session.isReadOnly.value || Boolean(primaryElement.value?.locked));

watch(() => primaryElement.value?.id ?? null, (id) => {
  pageSettingsOpen.value = !id;
  if (!id) precisionOpen.value = false;
});
const sourceReadyForCompose = computed(() => (
  props.snapshot.candidateSources?.gates.buildLayoutWorkingCopy.allowed === true
));
const initialCompositionBlockedReason = computed(() => {
  const code = props.snapshot.candidateSources?.gates.buildLayoutWorkingCopy.reasonCodes[0];
  return getSourceReasonLabel(code);
});
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
const publicationProfile = computed<LayoutPublicationProfileV1>(() => isPaged.value
  ? { schemaVersion: 1, kind: "paged_publication", outputScale: 1, includePdf: true, pdfPixelDpi: 96 }
  : { schemaVersion: 1, kind: "vertical_publication", outputScale: 1, maxSliceHeightPx: 8192, cutPolicy: "prefer_section_boundary_then_exact", includeLongPng: true });
const activeExportPublication = computed(() => {
  const activeId = activeExportPublicationId.value;
  if (!activeId) return null;
  if (activeExportPublicationSnapshot.value?.id === activeId) {
    return activeExportPublicationSnapshot.value;
  }
  return publicationHistory.value?.items.find((publication) => publication.id === activeId) ?? null;
});
const exportTaskPending = computed(() => (
  activeExportPublication.value?.status === "queued"
  || activeExportPublication.value?.status === "rendering"
));
const simpleExportBusy = computed(() => exportOperationBusy.value || exportTaskPending.value);
const exportDialogTitle = computed(() => {
  if (exportDialogStage.value === "blocked") return "暂时不能导出";
  if (exportDialogStage.value === "review") return "请确认文字变化";
  if (exportDialogStage.value === "failed") return "导出失败";
  if (activeExportPublication.value?.status === "ready") return "导出完成";
  return "正在导出";
});
const exportDialogSubtitle = computed(() => {
  if (exportDialogStage.value === "blocked") return "系统发现会影响成稿准确性的问题";
  if (exportDialogStage.value === "review") return "只确认你主动改变的内容";
  if (activeExportPublication.value?.status === "ready") return "正式版本与导出产物均已保存";
  return "系统会自动完成保存、检查和成品生成";
});
const canvasStyle = computed(() => ({
  width: `${session.currentCanvas.value!.width * session.zoom.value}px`,
  height: `${session.currentCanvas.value!.height * session.zoom.value}px`,
  backgroundColor: session.currentCanvas.value!.backgroundColor,
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

async function openMobilePreview(): Promise<void> {
  if (!chapterId.value || mobilePreviewBusy.value) return;
  const url = `/projects/${encodeURIComponent(projectId.value)}/layout/preview?chapterId=${encodeURIComponent(chapterId.value)}&source=working_copy`;
  mobilePreviewFeedback.value = null;
  mobilePreviewFallbackUrl.value = null;
  mobilePreviewBusy.value = true;

  try {
    const result = await openDetachedPreviewWindowAfterPreparation(url, async () => {
      if (!session.isDirty.value) return true;
      mobilePreviewFeedback.value = "正在保存当前成稿，保存成功后会打开手机预览…";
      await session.flush();
      return !session.isDirty.value && session.saveState.value === "saved";
    });
    if (result === "opened") {
      mobilePreviewFeedback.value = "当前成稿已保存，并已在新标签页打开手机预览。";
      return;
    }

    mobilePreviewFallbackUrl.value = url;
    mobilePreviewFeedback.value = result === "preparation_failed"
      ? "当前成稿保存失败，手机预览没有打开。请重试保存；也可以在当前页查看上次保存的版本。"
      : result === "blocked"
        ? "当前成稿已保存，但浏览器阻止了新标签页，你仍可在当前页打开手机预览。"
        : "当前成稿已保存，但新标签页的手机预览跳转失败，你仍可在当前页打开。";
  } finally {
    mobilePreviewBusy.value = false;
  }
}

async function generateInitialComposition(): Promise<void> {
  if (!chapterId.value || session.isReadOnly.value || !sourceReadyForCompose.value) return;
  actionError.value = null;
  const applied = await composition.startInitial();
  if (applied?.target === "working_copy") {
    await session.reloadServer();
    return;
  }
  if (!applied) {
    await session.reloadServer().catch(() => undefined);
  }
}

function refreshPublicationHistory(): Promise<void> {
  const id = chapterId.value;
  if (!id) {
    publicationRefreshGeneration += 1;
    publicationHistory.value = null;
    return Promise.resolve();
  }
  const requestedProjectId = projectId.value;
  const key = `${requestedProjectId}:${id}`;
  if (publicationRefreshFlight?.key === key) return publicationRefreshFlight.promise;
  const generation = ++publicationRefreshGeneration;
  const promise = (async () => {
    const history = await api.listLayoutPublications(requestedProjectId, id);
    if (
      generation !== publicationRefreshGeneration
      || projectId.value !== requestedProjectId
      || chapterId.value !== id
    ) return;
    publicationHistory.value = history;
    if (activeExportPublicationId.value) {
      const incoming = history.items.find(
        (item) => item.id === activeExportPublicationId.value,
      );
      if (incoming) {
        activeExportPublicationSnapshot.value = mergeLayoutPublicationSnapshot(
          activeExportPublicationSnapshot.value,
          incoming,
        );
      }
      return;
    }
    if (session.isDirty.value) return;
    const server = session.server.value;
    if (server?.document.schemaVersion !== 2) return;
    const expectedProfileDigest = LayoutPublicationProfileCodecV1.encode(publicationProfile.value).digest;
    const matching = history.items
      .filter((item) => (
        "revisionDocumentDigest" in item
        && item.revisionDocumentDigest === server.documentDigest
        && item.profileDigest === expectedProfileDigest
        && (item.status === "queued" || item.status === "rendering" || item.status === "ready")
      ))
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
    const current = history.currentExportRevisionId
      ? matching.find((item) => item.id === history.currentExportRevisionId)
      : null;
    const selected = current ?? matching[0] ?? null;
    activeExportPublicationId.value = selected?.id ?? null;
    activeExportPublicationSnapshot.value = selected;
    if (selected && publicationRequestId.value) {
      publicationRequestId.value = null;
      publicationRetryAfter = 0;
    }
  })();
  publicationRefreshFlight = { key, promise };
  const clearPublicationRefreshFlight = () => {
    if (publicationRefreshFlight?.promise === promise) publicationRefreshFlight = null;
  };
  void promise.then(clearPublicationRefreshFlight, clearPublicationRefreshFlight);
  return promise;
}

async function refreshActivePublication(): Promise<void> {
  const id = chapterId.value;
  const activeId = activeExportPublicationId.value;
  if (!id || !activeId) return;
  const requestedProjectId = projectId.value;
  const publication = await api.getLayoutPublication(requestedProjectId, id, activeId);
  if (
    projectId.value !== requestedProjectId
    || chapterId.value !== id
    || activeExportPublicationId.value !== activeId
  ) return;
  activeExportPublicationSnapshot.value = mergeLayoutPublicationSnapshot(
    activeExportPublicationSnapshot.value,
    publication,
  );
}

function uniquePreflightIssues(...groups: readonly LayoutPreflightIssue[][]): LayoutPreflightIssue[] {
  const byKey = new Map<string, LayoutPreflightIssue>();
  for (const issue of groups.flat()) byKey.set(issue.issueKey, issue);
  const shotOrder = (issue: LayoutPreflightIssue): number => {
    if (typeof issue.details.shotOrder === "number") return issue.details.shotOrder;
    return sourceCatalogItems.value.find((item) => item.source.shotId === issue.shotId)?.order
      ?? Number.MAX_SAFE_INTEGER;
  };
  const lineOrder = (issue: LayoutPreflightIssue): number => (
    typeof issue.details.lineOrder === "number" ? issue.details.lineOrder : Number.MAX_SAFE_INTEGER
  );
  return [...byKey.values()].sort((left, right) => (
    shotOrder(left) - shotOrder(right)
    || lineOrder(left) - lineOrder(right)
    || left.code.localeCompare(right.code)
    || left.issueKey.localeCompare(right.issueKey)
  ));
}

function setExportBlocked(issues: readonly LayoutPreflightIssue[]): void {
  exportDialogIssues.value = [...issues];
  exportDialogStage.value = "blocked";
}

function failSimpleExport(error: unknown): void {
  exportDialogError.value = error instanceof Error ? error.message : "导出失败，请稍后重试。";
  exportDialogStage.value = "failed";
}

function exportContextIsCurrent(id: string): boolean {
  return exportChapterId.value === id && chapterId.value === id;
}

function closeExportDialog(): void {
  if (exportOperationBusy.value) return;
  exportDialogOpen.value = false;
}

function isTextDifferenceIssue(issue: LayoutPreflightIssue): boolean {
  return issue.code === "DIALOGUE_USER_MODIFIED"
    || issue.code === "DIALOGUE_USER_SUPPRESSED"
    || issue.code === "CUSTOM_TEXT_PRESENT";
}

function exportIssueText(value: string | number | boolean | null | undefined, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function exportIssueLocation(issue: LayoutPreflightIssue): string {
  const speaker = typeof issue.details.speakerName === "string" && issue.details.speakerName
    ? issue.details.speakerName
    : null;
  const source = issue.shotId
    ? sourceCatalogItems.value.find((item) => item.source.shotId === issue.shotId)
    : null;
  const explicitShotOrder = typeof issue.details.shotOrder === "number"
    ? issue.details.shotOrder
    : null;
  const canvas = issue.canvasId
    ? session.document.value?.canvases.find((item) => item.id === issue.canvasId)
    : null;
  return [
    speaker,
    explicitShotOrder !== null
      ? `镜头 ${explicitShotOrder}`
      : source
        ? `镜头 ${source.order}`
        : issue.shotId
          ? "来源镜头"
          : null,
    canvas?.name ?? null,
  ].filter(Boolean).join(" · ") || "本章";
}

function exportIssueBlockingText(issue: LayoutPreflightIssue): string {
  const sourceText = typeof issue.details.sourceText === "string" ? issue.details.sourceText : "";
  const currentText = typeof issue.details.currentText === "string" ? issue.details.currentText : "";
  if (issue.details.reason === "bound_balloon_outside_canvas") {
    return `${sourceText ? `应有文字：${sourceText}。` : ""}请把对白气泡移回画布内。`;
  }
  if (issue.details.reason === "bound_balloon_not_visible") {
    return `${sourceText ? `应有文字：${sourceText}。` : ""}请恢复显示，并把对象透明度调到可见范围。`;
  }
  if (sourceText && currentText && sourceText !== currentText) {
    return `原文：${sourceText}；当前：${currentText}`;
  }
  if (sourceText) return `应有文字：${sourceText}`;
  if (currentText) return `当前文字：${currentText}`;
  return "";
}

function exportIssueDescription(issue: LayoutPreflightIssue): string {
  if (issue.code === "LAYOUT_COMPOSITION_SOURCE_OVERRIDE") return "你主动更换了镜头图片，将按当前图片导出。";
  if (issue.code === "TEXT_OVERFLOW") return "有文字可能超出容器，请确认当前版面可以接受。";
  return "这项变化需要你确认后才能继续导出。";
}

async function syncLatestSources(): Promise<void> {
  const ids = replaceableImageElementIds.value;
  if (!ids.length || sourceSyncBusy.value) return;
  sourceSyncBusy.value = true;
  actionError.value = null;
  try {
    const preview = await session.previewSourceReplacement(ids, "preserve_normalized_crop");
    if (!preview) throw new Error("当前草稿尚未保存，暂时不能同步最新镜头。");
    const result = await session.commitSourceReplacement();
    if (!result) throw new Error("镜头同步条件已经变化，请重试。");
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : "同步最新镜头失败";
  } finally {
    sourceSyncBusy.value = false;
  }
}

async function startSimpleExport(): Promise<void> {
  if (exportOperationBusy.value || session.isReadOnly.value || !session.server.value) return;
  const id = chapterId.value;
  if (!id) return;
  if (session.server.value.document.schemaVersion !== 2) {
    exportDialogOpen.value = true;
    exportDialogError.value = "当前成稿还是旧格式，无法可靠核对全部对白。请先转换或按当前定稿重建，再导出。";
    exportDialogStage.value = "failed";
    return;
  }
  if (
    exportChapterId.value
    && exportContextIsCurrent(exportChapterId.value)
    && publicationRequestId.value
    && publicationPreflight.value
    && exportLayoutRevision.value
  ) {
    await retrySimpleExport();
    return;
  }
  exportOperationBusy.value = true;
  try {
    await refreshPublicationHistory();
  } catch {
    exportDialogOpen.value = true;
    exportDialogError.value = "暂时无法确认已有导出任务，请稍后再试。";
    exportDialogStage.value = "failed";
    return;
  } finally {
    exportOperationBusy.value = false;
  }
  if (chapterId.value !== id) return;
  const existing = activeExportPublication.value;
  if (
    existing
    && !session.isDirty.value
    && (existing.status === "queued" || existing.status === "rendering" || existing.status === "ready")
  ) {
    exportDialogOpen.value = true;
    exportDialogStage.value = "publishing";
    return;
  }

  exportDialogOpen.value = true;
  exportDialogStage.value = "checking";
  exportDialogIssues.value = [];
  exportDialogError.value = null;
  exportResumeTarget.value = "revision";
  exportRevisionAcknowledgementKeys.value = [];
  exportReviewedIssueKeys.value = [];
  exportChapterId.value = id;
  exportLayoutRevision.value = null;
  publicationPreflight.value = null;
  publicationRequestId.value = null;
  activeExportPublicationId.value = null;
  activeExportPublicationSnapshot.value = null;
  publicationRetryAfter = 0;
  exportOperationBusy.value = true;
  actionError.value = null;

  try {
    await session.flush();
    if (!exportContextIsCurrent(id)) return;
    if (session.isDirty.value || session.saveState.value !== "saved") {
      throw new Error("自动保存还没有完成，请稍后再试。");
    }
    const revisionReport = await session.runPreflight();
    if (!exportContextIsCurrent(id)) return;
    if (!revisionReport) throw new Error("无法检查当前成稿，请稍后再试。");
    const exportReport = await session.runPreflight(publicationProfile.value);
    if (!exportContextIsCurrent(id)) return;
    if (!exportReport) throw new Error("无法检查导出条件，请稍后再试。");

    const blockers = uniquePreflightIssues(
      revisionReport.issues.filter((issue) => issue.blockingScopes.includes("revision")),
      exportReport.issues.filter((issue) => issue.blockingScopes.includes("export")),
    );
    if (blockers.length > 0) {
      setExportBlocked(blockers);
      return;
    }

    exportRevisionAcknowledgementKeys.value = revisionReport.issues
      .filter((issue) => issue.requiresAcknowledgement)
      .map((issue) => issue.issueKey);
    const reviewIssues = uniquePreflightIssues(
      revisionReport.issues.filter((issue) => issue.requiresAcknowledgement),
      exportReport.issues.filter((issue) => issue.requiresAcknowledgement),
    );
    if (reviewIssues.length > 0) {
      exportDialogIssues.value = reviewIssues;
      exportDialogStage.value = "review";
      return;
    }

    await createRevisionAndPublication();
  } catch (error) {
    failSimpleExport(error);
  } finally {
    exportOperationBusy.value = false;
  }
}

async function retrySimpleExport(): Promise<void> {
  if (exportOperationBusy.value) return;
  if (
    exportChapterId.value
    && exportContextIsCurrent(exportChapterId.value)
    && publicationRequestId.value
    && publicationPreflight.value
    && exportLayoutRevision.value
  ) {
    exportDialogOpen.value = true;
    exportDialogError.value = null;
    exportDialogStage.value = "publishing";
    exportOperationBusy.value = true;
    try {
      await submitCurrentPublication();
    } catch (error) {
      failSimpleExport(error);
    } finally {
      exportOperationBusy.value = false;
    }
    return;
  }
  if (
    exportChapterId.value
    && exportContextIsCurrent(exportChapterId.value)
    && session.hasPendingRevisionAttempt.value
  ) {
    exportDialogOpen.value = true;
    exportDialogError.value = null;
    exportDialogStage.value = "checking";
    exportOperationBusy.value = true;
    try {
      await createRevisionAndPublication();
    } catch (error) {
      failSimpleExport(error);
    } finally {
      exportOperationBusy.value = false;
    }
    return;
  }
  await startSimpleExport();
}

async function confirmSimpleExport(): Promise<void> {
  if (exportOperationBusy.value) return;
  exportReviewedIssueKeys.value = [...new Set([
    ...exportReviewedIssueKeys.value,
    ...exportDialogIssues.value.map((issue) => issue.issueKey),
  ])];
  exportDialogIssues.value = [];
  exportDialogStage.value = exportResumeTarget.value === "revision" ? "checking" : "publishing";
  exportOperationBusy.value = true;
  try {
    if (exportResumeTarget.value === "revision") await createRevisionAndPublication();
    else await submitCurrentPublication();
  } catch (error) {
    failSimpleExport(error);
  } finally {
    exportOperationBusy.value = false;
  }
}

async function createRevisionAndPublication(): Promise<void> {
  const id = exportChapterId.value;
  if (!id || !exportContextIsCurrent(id)) throw new Error("当前章节不存在。");
  const created = await session.createRevision(exportRevisionAcknowledgementKeys.value);
  if (!created || !exportContextIsCurrent(id)) throw new Error("导出期间章节已经变化，请重新导出。");
  const revision = created.revision;
  if (!("documentSchemaVersion" in revision) || revision.documentSchemaVersion !== 2) {
    throw new Error("当前成稿还是旧格式，无法核对正式对白。请先完成格式转换。");
  }
  exportLayoutRevision.value = revision;
  const report = await api.runLayoutPreflight(projectId.value, id, {
    schemaVersion: 2,
    target: { kind: "layout_revision", layoutRevisionId: revision.id },
    profile: publicationProfile.value,
  });
  if (!exportContextIsCurrent(id) || exportLayoutRevision.value?.id !== revision.id) return;
  publicationPreflight.value = report;

  const blockers = report.issues.filter((issue) => issue.blockingScopes.includes("export"));
  if (blockers.length > 0) {
    setExportBlocked(blockers);
    return;
  }
  const unreviewed = report.issues.filter((issue) => (
    issue.requiresAcknowledgement && !exportReviewedIssueKeys.value.includes(issue.issueKey)
  ));
  if (unreviewed.length > 0) {
    exportResumeTarget.value = "publication";
    exportDialogIssues.value = unreviewed;
    exportDialogStage.value = "review";
    return;
  }
  await submitCurrentPublication();
}

async function submitCurrentPublication(): Promise<void> {
  const id = exportChapterId.value;
  const revision = exportLayoutRevision.value;
  const revisionId = revision?.id ?? null;
  const report = publicationPreflight.value;
  if (!id || !exportContextIsCurrent(id) || !revisionId || !revision || !report) {
    throw new Error("导出上下文已经变化，请重新导出。");
  }
  if (!("documentSchemaVersion" in revision) || revision.documentSchemaVersion !== 2 || report.schemaVersion !== 2) {
    throw new Error("当前成稿还是旧格式，无法核对正式对白。请先完成格式转换。");
  }
  const requiredAcknowledgements = report.issues
    .filter((issue) => issue.requiresAcknowledgement)
    .map((issue) => issue.issueKey);
  const missingAcknowledgements = requiredAcknowledgements.filter(
    (issueKey) => !exportReviewedIssueKeys.value.includes(issueKey),
  );
  if (missingAcknowledgements.length > 0) throw new Error("还有文字变化没有确认。");

  publicationBusy.value = true;
  try {
    publicationRequestId.value ??= globalThis.crypto?.randomUUID?.() ?? `publication_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const profile = LayoutPublicationProfileCodecV1.encode(publicationProfile.value);
    const common = {
      requestId: publicationRequestId.value,
      layoutRevisionId: revisionId,
      expectedCurrentLayoutRevisionId: revisionId,
      profile: profile.value,
      profileDigest: profile.digest,
      preflightDigest: report.preflightDigest,
      acknowledgedIssueKeys: requiredAcknowledgements,
    };
    const result = await api.createLayoutPublication(projectId.value, id, {
      schemaVersion: 2,
      ...common,
      expectedRevisionDocumentDigest: revision.revisionDocumentDigest,
      expectedVisibleDocumentDigest: revision.visibleDocumentDigest,
    });
    if (!exportContextIsCurrent(id) || exportLayoutRevision.value?.id !== revisionId) return;
    activeExportPublicationId.value = result.exportRevision.id;
    activeExportPublicationSnapshot.value = mergeLayoutPublicationSnapshot(
      activeExportPublicationSnapshot.value,
      result.exportRevision,
    );
    publicationRequestId.value = null;
    publicationRetryAfter = 0;
    exportDialogStage.value = "publishing";
    await refreshPublicationHistory().catch(() => undefined);
  } catch (error) {
    if (error instanceof ApiClientError && error.status >= 400 && error.status < 500) {
      publicationRequestId.value = null;
      publicationRetryAfter = 0;
      publicationPreflight.value = null;
      exportLayoutRevision.value = null;
      throw error;
    }
    exportDialogError.value = "网络响应中断，正在用同一导出请求确认状态。";
    exportDialogStage.value = "publishing";
    publicationRetryAfter = Date.now() + 3_000;
    await refreshPublicationHistory().catch(() => undefined);
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

function shortDigest(digest: string): string {
  return `${digest.slice(0, 14)}…${digest.slice(-8)}`;
}

function preflightIssueLabel(issue: LayoutPreflightIssue): string {
  if (issue.code === "DIALOGUE_BINDING_DANGLING") {
    if (issue.details.reason === "bound_balloon_outside_canvas") return "对白气泡完全在画布外";
    if (issue.details.reason === "bound_balloon_not_visible") return "对白气泡已隐藏或完全透明";
  }
  const code = issue.code as LayoutPreflightCodeV2;
  const labels: Record<string, string> = {
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
    VISIBLE_TEXT_EMPTY: "可见文字内容为空",
    TEXT_OVERFLOW: "文字发生溢出",
    IMAGE_EFFECTIVE_RESOLUTION_CRITICAL: "图片有效分辨率不足",
    IMAGE_EFFECTIVE_RESOLUTION_LOW: "图片有效分辨率偏低",
    ELEMENT_FULLY_OUTSIDE_CANVAS: "对象完全位于画布外",
    ELEMENT_PARTLY_OUTSIDE_SAFE_AREA: "对象超出安全区",
    CANVAS_EMPTY: "存在空画布",
    HIDDEN_ELEMENT_PRESENT: "存在隐藏对象",
    WORKING_COPY_AHEAD_OF_REVISION: "草稿领先于该版本",
    REVISION_DOCUMENT_DIGEST_MISMATCH: "完整成稿摘要与版本证据不一致",
    VISIBLE_DOCUMENT_DIGEST_MISMATCH: "可见成稿摘要与投影证据不一致",
    VISIBLE_PROJECTION_UNSTABLE: "可见投影结果不稳定",
    DIALOGUE_LEDGER_INVALID: "对白台账不完整",
    DIALOGUE_LEDGER_WARNING: "对白台账需要人工确认",
    DIALOGUE_BINDING_MISSING: "对白缺少成稿绑定",
    DIALOGUE_BINDING_UNEXPECTED: "成稿包含意外对白绑定",
    DIALOGUE_BINDING_DUPLICATE: "对白被重复绑定",
    DIALOGUE_BINDING_DANGLING: "对白绑定指向不存在对象",
    DIALOGUE_BINDING_SOURCE_MISMATCH: "对白绑定的镜头来源不一致",
    DIALOGUE_BALLOON_KIND_MISMATCH: "对白与气泡类型不一致",
    DIALOGUE_BALLOON_SPEAKER_MISMATCH: "对白说话人与气泡引用不一致",
    DIALOGUE_TEXT_UNPROTECTED: "手工对白修改尚未建立文字保护",
    DIALOGUE_USER_MODIFIED: "对白文字已由用户修改",
    DIALOGUE_USER_SUPPRESSED: "对白已由用户明确省略",
    CUSTOM_TEXT_PRESENT: "你添加了自定义文字",
    UNOWNED_TEXT_PRESENT: "发现无来源文字",
    LAYOUT_COMPOSITION_MISSING: "缺少首次排版记录",
    LAYOUT_COMPOSITION_STALE: "首次排版记录已失效",
    LAYOUT_COMPOSITION_SOURCE_LOCK_MISMATCH: "首次排版记录与当前镜头不一致",
    LAYOUT_COMPOSITION_SOURCE_OVERRIDE: "首次排版沿用了人工确认的镜头更换",
    LAYOUT_PROTECTION_INVALID: "人工保护指向无效对象或范围",
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
  activeTool.value = "select";
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
  activeTool.value = "select";
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
    session.execute(command(
      "balloon.replace_text_document",
      "编辑气泡文字",
      { canvasId: canvas.id, elementId: element.id, richText },
    ));
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

function setTextSemantic(event: Event): void {
  const element = primaryElement.value;
  const canvas = session.currentCanvas.value;
  if (element?.type !== "text" || !canvas) return;
  const semantic = (event.target as HTMLSelectElement).value as typeof element.semantic;
  session.execute(command("text.set_semantic", semantic === "sfx" ? "标记为拟声字" : "调整文字角色", {
    canvasId: canvas.id,
    elementId: element.id,
    semantic,
  }));
}

function applySfxPreset(preset: "impact" | "electric"): void {
  const element = primaryElement.value;
  const canvas = session.currentCanvas.value;
  if (element?.type !== "text" || !canvas || element.locked) return;
  session.executeBatch(buildLayoutSfxPresetBatchV1({
    canvasId: canvas.id,
    element,
    fontCatalog: session.fontCatalog.value?.items ?? [],
    preset,
  }));
}

function reservedBalloonPairRole(
  fillColor: string,
  strokeColor: string,
): "thought" | "shout" | null {
  const normalizedFill = fillColor.toUpperCase();
  const normalizedStroke = strokeColor.toUpperCase();
  for (const role of ["thought", "shout"] as const) {
    const preset = layoutBalloonVisualPresetV1(role, isPaged.value ? "paged_comic" : "vertical_scroll");
    if (
      normalizedFill === preset.fillColor.toUpperCase()
      && normalizedStroke === preset.strokeColor.toUpperCase()
    ) return role;
  }
  return null;
}

function applyBalloonAppearancePreset(preset: BalloonAppearancePreset): void {
  const element = primaryElement.value;
  if (element?.type !== "balloon") return;
  if (implicitReservedBalloonRole.value) {
    actionError.value = "该旧气泡依赖保留色对表达轮廓；请先切换为显式气泡类型。";
    return;
  }
  const collision = element.balloonKind === "speech"
    ? reservedBalloonPairRole(preset.fillColor, preset.strokeColor)
    : null;
  if (collision) {
    actionError.value = `“${collision === "thought" ? "思考" : "喊叫"}”保留色对不能作为普通对白外观。`;
    return;
  }
  actionError.value = null;
  applyBalloonVisualStyle(element, {
    fillColor: preset.fillColor,
    strokeColor: preset.strokeColor,
    strokeWidth: preset.strokeWidth,
  }, `应用${preset.label}外观`);
}

function normalizeReservedBalloonToSpeech(): void {
  const element = primaryElement.value;
  if (element?.type !== "balloon" || !implicitReservedBalloonRole.value) return;
  const visual = layoutBalloonVisualPresetV1(
    "speech",
    isPaged.value ? "paged_comic" : "vertical_scroll",
  );
  actionError.value = null;
  applyBalloonVisualStyle(element, {
    fillColor: visual.fillColor,
    strokeColor: visual.strokeColor,
    strokeWidth: visual.strokeWidth,
  }, "转换为普通对白外观");
}

function applyBalloonVisualStyle(
  element: Extract<LayoutTopLevelElementV1, { type: "balloon" }>,
  patch: Partial<Pick<
    typeof element,
    "fillColor" | "strokeColor" | "strokeWidth" | "padding" | "verticalAlign"
  >>,
  label: string,
): void {
  const canvas = session.currentCanvas.value;
  if (!canvas) return;
  session.execute(buildBalloonVisualStyleCommandV1({
    canvasId: canvas.id,
    element,
    patch,
    label,
  }));
}

function updateBalloonVisualColor(
  field: "fillColor" | "strokeColor",
  event: Event,
): void {
  const element = primaryElement.value;
  if (element?.type !== "balloon") return;
  const value = (event.target as HTMLInputElement).value.trim().toUpperCase();
  if (!/^#[0-9A-F]{8}$/u.test(value)) {
    actionError.value = "气泡颜色必须是 #RRGGBBAA，例如 #FFFFFFFF。";
    return;
  }
  if (implicitReservedBalloonRole.value) {
    actionError.value = "该旧气泡依赖保留色对表达轮廓；请先切换为普通对白，再自定义颜色。";
    return;
  }
  const fillColor = field === "fillColor" ? value : element.fillColor;
  const strokeColor = field === "strokeColor" ? value : element.strokeColor;
  const collision = element.balloonKind === "speech"
    ? reservedBalloonPairRole(fillColor, strokeColor)
    : null;
  if (collision) {
    actionError.value = `这个颜色组合保留给“${collision === "thought" ? "思考" : "喊叫"}”轮廓；请选择对应类型，或调整任一颜色。`;
    return;
  }
  actionError.value = null;
  applyBalloonVisualStyle(element, { [field]: value }, "调整气泡颜色");
}

function updateBalloonVisualNumber(
  field: "strokeWidth",
  event: Event,
): void {
  const element = primaryElement.value;
  if (element?.type !== "balloon") return;
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  actionError.value = null;
  applyBalloonVisualStyle(element, { [field]: Math.max(0, Math.min(512, value)) }, "调整气泡描边");
}

function updateBalloonVerticalAlign(event: Event): void {
  const element = primaryElement.value;
  if (element?.type !== "balloon") return;
  const verticalAlign = (event.target as HTMLSelectElement).value as typeof element.verticalAlign;
  actionError.value = null;
  applyBalloonVisualStyle(element, { verticalAlign }, "调整气泡文字位置");
}

function updateBalloonPadding(
  field: "top" | "right" | "bottom" | "left",
  event: Event,
): void {
  const element = primaryElement.value;
  if (element?.type !== "balloon") return;
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  const padding = { ...element.padding, [field]: Math.max(0, Math.min(8192, value)) };
  if (
    padding.left + padding.right >= element.transform.width
    || padding.top + padding.bottom >= element.transform.height
  ) {
    actionError.value = "气泡内边距必须为文字保留至少 1px 的宽度和高度。";
    return;
  }
  actionError.value = null;
  applyBalloonVisualStyle(element, { padding }, "调整气泡内边距");
}

function setBalloonKind(event: Event): void {
  const element = primaryElement.value;
  const canvas = session.currentCanvas.value;
  if (element?.type !== "balloon" || !canvas) return;
  const balloonKind = (event.target as HTMLSelectElement).value as "speech" | "thought" | "shout" | "caption";
  const visual = layoutBalloonVisualPresetV1(
    balloonKind,
    isPaged.value ? "paged_comic" : "vertical_scroll",
  );
  const desiredWeight = balloonKind === "shout" ? 900 : balloonKind === "caption" ? 500 : 400;
  const catalog = session.fontCatalog.value?.items ?? [];
  const currentRun = element.richText.paragraphs.flatMap((paragraph) => paragraph.runs)[0];
  const currentFace = catalog.find((font) => font.assetId === currentRun?.fontAssetId)
    ?? catalog.find((font) => font.assetId === session.document.value?.fontPolicy.defaultFontAssetId);
  const semanticFace = currentFace
    ? catalog.find((font) => (
        font.metadata.familyName === currentFace.metadata.familyName
        && font.metadata.face.weight === desiredWeight
        && font.metadata.face.style === "normal"
      ))
    : undefined;
  const richText = structuredClone(element.richText);
  for (const paragraph of richText.paragraphs) {
    for (const run of paragraph.runs) {
      run.color = visual.textColor;
      if (semanticFace) {
        run.fontAssetId = semanticFace.assetId;
        run.fontWeight = semanticFace.metadata.face.weight;
        run.fontStyle = semanticFace.metadata.face.style;
      }
    }
  }
  executeBatch("应用语义气泡样式", [
    command("balloon.set_kind", "调整气泡类型", {
      canvasId: canvas.id,
      elementId: element.id,
      balloonKind,
    }),
    command("balloon.set_visual_style", "应用气泡外观", {
      canvasId: canvas.id,
      elementId: element.id,
      fillColor: visual.fillColor,
      strokeColor: visual.strokeColor,
      strokeWidth: visual.strokeWidth,
      padding: element.padding,
      verticalAlign: element.verticalAlign,
    }),
    command("balloon.set_tail", "调整气泡尾巴", {
      canvasId: canvas.id,
      elementId: element.id,
      tail: {
        ...element.tail,
        enabled: visual.tailAllowed && element.tail.enabled,
      },
    }),
    command("balloon.replace_text_document", "应用语义文字样式", {
      canvasId: canvas.id,
      elementId: element.id,
      richText,
    }),
  ]);
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
  const zoom = session.zoom.value;
  return {
    left: `${element.transform.x * zoom}px`,
    top: `${element.transform.y * zoom}px`,
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
    borderRadius: `${element.shape.cornerRadius * zoom}px`,
  };
}

function panelBorderOverlayStyle(
  element: Extract<LayoutTopLevelElementV1, { type: "panel_frame" }>,
) {
  const zoom = session.zoom.value;
  return {
    borderStyle: element.border.visible ? "solid" : "none",
    borderWidth: element.border.visible ? `${element.border.width * zoom}px` : "0",
    borderColor: element.border.color,
    borderRadius: `${element.shape.cornerRadius * zoom}px`,
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
  return layoutImagePreviewStyleV1({
    mode: "cover",
    crop,
    frameWidth: element.transform.width,
    frameHeight: element.transform.height,
    sourceWidth: catalog?.width ?? null,
    sourceHeight: catalog?.height ?? null,
    scale: session.zoom.value,
  });
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

const ELEMENT_TYPE_LABELS: Record<LayoutTopLevelElementV1["type"], string> = {
  panel_frame: "画格",
  free_image: "自由图",
  text: "文字",
  balloon: "气泡",
};

function deleteElementsWithConfirm(elements: LayoutTopLevelElementV1[]): void {
  const canvas = session.currentCanvas.value;
  if (!canvas || !elements.length) return;
  const occupiedPanel = elements.some((element) => element.type === "panel_frame" && element.contentImage);
  const message = elements.length === 1
    ? occupiedPanel
      ? "删除此画格会让对应镜头回到“未放置”。是否继续？"
      : `确认删除这个${ELEMENT_TYPE_LABELS[elements[0]!.type]}？此操作不可撤销。`
    : `确认删除选中的 ${elements.length} 个对象？${occupiedPanel ? "其中有已放置镜头的画格，删除后对应镜头会回到“未放置”。" : ""}此操作不可撤销。`;
  if (!window.confirm(message)) return;
  executeBatch("删除对象", elements.map((element) => command("element.delete", "删除对象", { canvasId: canvas.id, elementId: element.id })));
  session.selectedElementIds.value = [];
}

function deletePrimaryElement(): void {
  const element = primaryElement.value;
  if (!element) return;
  deleteElementsWithConfirm([element]);
}

function deleteSelectedElements(): void {
  deleteElementsWithConfirm([...session.selectedElements.value].filter((element) => !element.locked));
}

function selectKonvaElement(value: { elementId: string; additive: boolean }): void {
  session.selectElement(value.elementId, value.additive);
}

function replaceKonvaSelection(elementIds: string[]): void {
  session.selectedElementIds.value = [...elementIds];
}

function sameTransform(
  left: LayoutTopLevelElementV1["transform"],
  right: LayoutTopLevelElementV1["transform"],
): boolean {
  return (
    Math.abs(left.x - right.x) < 0.000001
    && Math.abs(left.y - right.y) < 0.000001
    && Math.abs(left.width - right.width) < 0.000001
    && Math.abs(left.height - right.height) < 0.000001
    && Math.abs(left.rotation - right.rotation) < 0.000001
    && Math.abs(left.opacity - right.opacity) < 0.000001
  );
}

function commitKonvaTransforms(changes: KonvaTransformCommitV1[]): void {
  const canvas = session.currentCanvas.value;
  if (!canvas || session.isReadOnly.value) return;
  const commands = changes.flatMap((change) => {
    const element = canvas.elements.find((item) => item.id === change.elementId);
    if (!element || element.locked || sameTransform(element.transform, change.transform)) return [];
    return [session.makeTransformCommand(change.elementId, change.transform)];
  });
  if (commands.length === 1) session.execute(commands[0]!);
  else executeBatch("变换所选对象", commands);
}

function commitKonvaTail(value: { elementId: string; targetX: number; targetY: number }): void {
  const canvas = session.currentCanvas.value;
  const element = canvas?.elements.find((item) => item.id === value.elementId);
  if (!canvas || element?.type !== "balloon" || element.locked || session.isReadOnly.value) return;
  session.execute(command("balloon.set_tail", "调整气泡尾巴目标", {
    canvasId: canvas.id,
    elementId: element.id,
    tail: {
      ...element.tail,
      targetX: value.targetX,
      targetY: value.targetY,
    },
  }));
}

function commitKonvaCrop(value: { elementId: string; crop: CoverCropV1 }): void {
  const element = session.currentCanvas.value?.elements.find((item) => item.id === value.elementId);
  if (
    !element
    || primaryElement.value?.id !== value.elementId
    || element.locked
    || (element.type !== "panel_frame" && element.type !== "free_image")
    || session.isReadOnly.value
  ) return;
  const current = element.type === "panel_frame"
    ? element.contentImage?.crop ?? null
    : element.display.mode === "cover"
      ? element.display.crop
      : null;
  if (!current) return;
  applyCrop(value.crop, "画布内调整图片裁切");
}

function panKonvaViewport(value: { dx: number; dy: number }): void {
  const viewport = stageScroll.value;
  if (!viewport) return;
  viewport.scrollLeft -= value.dx;
  viewport.scrollTop -= value.dy;
}

function zoomKonvaViewport(value: { zoom: number; clientX: number; clientY: number }): void {
  const viewport = stageScroll.value;
  const previousZoom = session.zoom.value;
  const nextZoom = Math.max(0.1, Math.min(0.8, value.zoom));
  if (!viewport || previousZoom === nextZoom) {
    session.zoom.value = nextZoom;
    return;
  }
  const previousLeft = viewport.scrollLeft;
  const previousTop = viewport.scrollTop;
  const viewportRect = viewport.getBoundingClientRect();
  const nextScroll = projectKonvaViewportZoomAnchorV1({
    scrollLeft: previousLeft,
    scrollTop: previousTop,
    viewportLeft: viewportRect.left,
    viewportTop: viewportRect.top,
    clientX: value.clientX,
    clientY: value.clientY,
    previousZoom,
    nextZoom,
  });
  session.zoom.value = nextZoom;
  void nextTick(() => {
    viewport.scrollLeft = nextScroll.scrollLeft;
    viewport.scrollTop = nextScroll.scrollTop;
  });
}

function updateTransform(field: keyof LayoutTopLevelElementV1["transform"], event: Event): void {
  const element = primaryElement.value;
  if (!element || element.locked) return;
  const value = Number((event.target as HTMLInputElement).value);
  if (!Number.isFinite(value)) return;
  if (field === "opacity" && value <= 0) {
    setElementHidden(element.id, true);
    return;
  }
  const normalizedValue = field === "opacity" ? Math.min(1, Math.max(0.05, value)) : value;
  if (element.type === "balloon") {
    const minimum = field === "width" ? element.padding.left + element.padding.right + 1
      : field === "height" ? element.padding.top + element.padding.bottom + 1
        : 0;
    if (minimum > 0 && normalizedValue < minimum) {
      actionError.value = `气泡${field === "width" ? "宽度" : "高度"}必须大于内边距 ${minimum - 1}px。`;
      return;
    }
  }
  actionError.value = null;
  session.execute(session.makeTransformCommand(element.id, { ...element.transform, [field]: normalizedValue }));
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
  if (exportDialogOpen.value || exportOperationBusy.value) return;
  const target = event.target as HTMLElement | null;
  const commandKey = event.metaKey || event.ctrlKey;
  if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
  if (commandKey && event.key.toLowerCase() === "a") {
    event.preventDefault();
    session.selectedElementIds.value = currentElements.value.map((element) => element.id);
    return;
  }
  if (event.key === "Escape") {
    session.selectedElementIds.value = [];
    return;
  }
  if ((event.key === "Delete" || event.key === "Backspace") && session.selectedElements.value.length && !session.isReadOnly.value) {
    event.preventDefault();
    deleteSelectedElements();
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
  autoCompositionKey = null;
  mobilePreviewFeedback.value = null;
  mobilePreviewFallbackUrl.value = null;
  exportDialogOpen.value = false;
  exportDialogStage.value = "checking";
  exportDialogIssues.value = [];
  exportDialogError.value = null;
  exportRevisionAcknowledgementKeys.value = [];
  exportReviewedIssueKeys.value = [];
  exportChapterId.value = null;
  exportLayoutRevision.value = null;
  activeExportPublicationId.value = null;
  activeExportPublicationSnapshot.value = null;
  publicationPreflight.value = null;
  publicationRequestId.value = null;
  publicationRetryAfter = 0;
  void refreshPublicationHistory().catch(() => undefined);
});
watch(() => session.isDirty.value, (dirty) => {
  if (!dirty) return;
  session.preflight.value = null;
  publicationPreflight.value = null;
  publicationRequestId.value = null;
  publicationRetryAfter = 0;
  exportRevisionAcknowledgementKeys.value = [];
  exportReviewedIssueKeys.value = [];
  exportChapterId.value = null;
  exportLayoutRevision.value = null;
  activeExportPublicationId.value = null;
  activeExportPublicationSnapshot.value = null;
  if (!exportOperationBusy.value) exportDialogOpen.value = false;
});
watch(primaryCrop, (crop) => {
  if (!crop && activeTool.value === "crop") activeTool.value = "select";
});
watch(
  () => [
    projectId.value,
    chapterId.value,
    session.saveState.value,
    session.legacyStatus.value?.state ?? "none",
    session.isReadOnly.value,
    sourceReadyForCompose.value,
  ] as const,
  () => {
    const currentChapterId = chapterId.value;
    if (
      !currentChapterId
      || session.saveState.value !== "missing"
      || session.legacyStatus.value
      || session.isReadOnly.value
      || !sourceReadyForCompose.value
    ) return;
    const key = `${projectId.value}:${currentChapterId}`;
    if (autoCompositionKey === key || composition.busy.value) return;
    autoCompositionKey = key;
    void generateInitialComposition();
  },
  { immediate: true },
);
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
    const activePublicationNeedsRefresh = Boolean(
      activeExportPublicationId.value
      && (!activeExportPublication.value || exportTaskPending.value),
    );
    const ambiguousPublicationNeedsReplay = Boolean(
      publicationRequestId.value
      && !activeExportPublicationId.value
      && publicationPreflight.value
      && exportLayoutRevision.value
      && !publicationBusy.value
      && Date.now() >= publicationRetryAfter
    );
    const historyHasPendingPublication = publicationHistory.value?.items.some(
      (item) => item.status === "queued" || item.status === "rendering",
    );
    if (ambiguousPublicationNeedsReplay) {
      publicationRetryAfter = Date.now() + 3_000;
      void submitCurrentPublication().catch(failSimpleExport);
    }
    if (activePublicationNeedsRefresh) {
      void refreshActivePublication().catch(() => refreshPublicationHistory().catch(() => undefined));
    } else if (historyHasPendingPublication || (publicationRequestId.value && !activeExportPublicationId.value)) {
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
  --layout-topbar-offset: 53px;
  --le-bg-app: #0b101c;
  --le-bg-panel: #101827;
  --le-bg-stage: #0a0e17;
  --le-bg-control: rgba(22, 32, 51, 0.9);
  --le-border: rgba(148, 163, 184, 0.14);
  --le-border-strong: rgba(148, 163, 184, 0.22);
  --le-text: #e8edf8;
  --le-text-dim: #8b98b2;
  --le-accent: #4f8cff;
  --le-accent-soft: rgba(79, 140, 255, 0.16);
  --le-accent-border: rgba(79, 140, 255, 0.5);
  --le-paper: #f6f3ec;
  --le-radius: 8px;
  position: relative;
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--le-border);
  border-radius: 12px;
  background: var(--le-bg-app);
  color: var(--le-text);
}

button,
select,
input {
  font: inherit;
}

button {
  border: 1px solid var(--le-border-strong);
  border-radius: var(--le-radius);
  background: var(--le-bg-control);
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
  border-bottom: 1px solid var(--le-border);
  padding: 8px 12px;
  background: var(--le-bg-panel);
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

.export-dialog-backdrop {
  position: absolute;
  z-index: 80;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(3, 7, 18, 0.76);
  backdrop-filter: blur(4px);
  padding: 20px;
}

.export-dialog {
  display: grid;
  gap: 18px;
  width: min(620px, 100%);
  max-height: min(720px, calc(100% - 24px));
  overflow: auto;
  box-sizing: border-box;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 18px;
  background: #111a2b;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.55);
  padding: 22px;
}

.export-dialog > header,
.export-dialog > footer,
.export-review-list article > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.export-dialog > header > div {
  display: grid;
  gap: 4px;
}

.export-dialog > header strong { font-size: 18px; }
.export-dialog > header small,
.export-review-list article small { color: #8f9db8; }
.export-dialog > header button {
  width: 32px;
  min-height: 32px;
  padding: 0;
}

.export-dialog > footer {
  justify-content: flex-end;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
  padding-top: 16px;
}

.export-dialog-state {
  display: grid;
  justify-items: center;
  gap: 9px;
  text-align: center;
  color: #b9c5da;
  padding: 30px 12px;
}

.export-dialog-state strong { color: #eef4ff; font-size: 16px; }
.export-dialog-state p,
.export-review-intro,
.export-review-list article > p {
  margin: 0;
  color: #95a4bd;
  line-height: 1.6;
}
.export-dialog-state.is-blocked { color: #fb7185; }
.export-dialog-state.is-ready { color: #34d399; }

.export-issue-list,
.export-review-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.export-issue-list li,
.export-review-list article {
  display: grid;
  gap: 8px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.72);
  padding: 12px;
}

.export-issue-list li { border-color: rgba(251, 113, 133, 0.25); }
.export-issue-list small { color: #9ca9c0; }
.export-issue-list p {
  margin: 0;
  border-radius: 8px;
  background: rgba(251, 113, 133, 0.08);
  color: #edf3ff;
  padding: 8px 10px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.export-review-list dl { display: grid; gap: 8px; margin: 0; }
.export-review-list dl > div {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  gap: 10px;
}
.export-review-list dt { color: #7887a3; font-size: 12px; font-weight: 800; }
.export-review-list dd {
  margin: 0;
  border-radius: 8px;
  background: rgba(148, 163, 184, 0.08);
  color: #edf3ff;
  padding: 8px 10px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.export-artifacts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.export-artifacts a {
  border: 1px solid rgba(79, 140, 255, 0.36);
  border-radius: 10px;
  background: rgba(79, 140, 255, 0.12);
  color: #cfe0ff;
  padding: 10px 12px;
  text-align: center;
  text-decoration: none;
  font-weight: 800;
}
.export-artifacts a:hover { background: rgba(79, 140, 255, 0.2); }

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

.mobile-preview-feedback {
  position: absolute;
  z-index: 45;
  top: calc(var(--layout-topbar-offset) + 9px);
  right: 12px;
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: min(560px, calc(100% - 24px));
  border: 1px solid rgba(34, 197, 94, 0.34);
  border-radius: 10px;
  background: rgba(6, 78, 59, 0.96);
  color: #d1fae5;
  padding: 9px 10px;
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.32);
}
.mobile-preview-feedback.is-error {
  border-color: rgba(251, 146, 60, 0.38);
  background: rgba(124, 45, 18, 0.97);
  color: #ffedd5;
}
.mobile-preview-feedback > span { min-width: 0; flex: 1; font-size: 12px; line-height: 1.45; }
.mobile-preview-feedback > a {
  flex: none;
  color: #fff;
  font-size: 12px;
  font-weight: 900;
  text-underline-offset: 3px;
}
.mobile-preview-feedback > button {
  flex: none;
  width: 26px;
  min-height: 26px;
  border: 0;
  background: transparent;
  padding: 0;
}

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
.smart-compose-card {
  justify-items: center;
  width: min(520px, calc(100% - 32px));
  text-align: center;
}
.smart-compose-card .compose-mark { color: #8b7cff; }
.smart-compose-card .compose-mark.is-error { color: #fb7185; }
.smart-compose-card > small { color: #7f8ca8; font-size: 11px; }
.compose-progress {
  width: 100%;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.14);
}
.compose-progress > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #22c7a9, #745fff);
  transition: width 220ms ease;
}

.editor-shell {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  min-height: 0;
  overflow: hidden;
}

.canvas-navigation,
.inspector {
  min-height: 0;
  border-right: 1px solid var(--le-border);
  background: var(--le-bg-panel);
}

.canvas-navigation { width: 238px; grid-column: 1; }
.canvas-workspace { grid-column: 2; }
.inspector { width: 320px; grid-column: 3; }

.stage-wrap {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.canvas-tool-float {
  position: absolute;
  z-index: 30;
  top: 12px;
  left: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--le-border-strong);
  border-radius: 10px;
  background: rgba(16, 24, 39, 0.92);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  padding: 6px;
}

.canvas-tool-float button { width: 32px; min-height: 32px; padding: 0; }
.canvas-tool-float button.is-active { border-color: var(--le-accent-border); background: var(--le-accent-soft); color: #cfe0ff; }
.canvas-tool-float span { height: 1px; width: 20px; background: var(--le-border-strong); }

.shot-replace-strip {
  position: absolute;
  z-index: 30;
  right: 16px;
  bottom: 16px;
  left: 64px;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  border: 1px solid var(--le-border-strong);
  border-radius: 10px;
  background: rgba(16, 24, 39, 0.94);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  padding: 8px 10px;
}

.shot-replace-strip > span { flex: none; color: var(--le-text-dim); font-size: 12px; }
.shot-replace-strip button { display: grid; flex: none; justify-items: center; gap: 3px; min-height: 0; padding: 4px; }
.shot-replace-strip button:hover { border-color: var(--le-accent-border); }
.shot-replace-strip img { width: 52px; height: 52px; border-radius: 6px; object-fit: cover; pointer-events: none; }
.shot-replace-strip small { color: var(--le-text-dim); font-size: 10px; }

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
.canvas-nav-item.is-active { border-color: var(--le-accent-border); background: var(--le-accent-soft); }
.canvas-nav-actions { display: flex; margin-left: auto; }
.canvas-nav-actions button { width: 25px; min-height: 25px; border: 0; padding: 0; background: transparent; }
.canvas-list-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.canvas-list-actions button { min-width: 0; padding: 0 5px; font-size: 12px; }

.shot-tray { margin-top: 18px; border-top: 1px solid var(--le-border); padding-top: 14px; }
.shot-tray > p { color: #7f8ca8; font-size: 12px; line-height: 1.5; }
.shot-tray article { display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: 8px; border: 1px solid rgba(148, 163, 184, 0.16); border-radius: 9px; padding: 7px; margin-bottom: 8px; cursor: pointer; }
.shot-tray article.is-selected { border-color: var(--le-accent-border); background: var(--le-accent-soft); }
.shot-tray article > img { width: 54px; height: 54px; border-radius: 6px; object-fit: cover; }
.shot-tray article > div { display: grid; align-content: center; gap: 4px; min-width: 0; }
.shot-tray article small { color: #8491aa; font-size: 11px; }
.shot-actions { grid-column: 1 / -1; display: grid !important; grid-template-columns: repeat(3, 1fr); gap: 4px !important; }
.shot-actions button { min-width: 0; min-height: 27px; padding: 0 3px; font-size: 11px; }

.source-summary { display: grid; gap: 8px; margin-top: 18px; border-top: 1px solid var(--le-border); padding-top: 14px; }
.source-summary span { justify-self: start; }

.canvas-workspace {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--le-bg-stage);
}

.canvas-toolbar {
  justify-content: space-between;
  min-height: 44px;
  border-bottom: 1px solid var(--le-border);
  padding: 6px 10px;
  background: var(--le-bg-panel);
}
.canvas-toolbar button { min-height: 28px; font-size: 12px; }
.canvas-toolbar label { color: var(--le-text-dim); font-size: 12px; }
.canvas-toolbar input { width: 100px; }

.stage-scroll {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 40px 48px;
}

.document-canvas {
  position: relative;
  margin: 0 auto;
  flex: none;
  overflow: hidden;
  border-radius: 3px;
  background: var(--le-paper);
  box-shadow: 0 14px 44px rgba(0, 0, 0, 0.5);
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

.canvas-element.type-panel_frame { background: #d6dbe5; }
.canvas-element.type-balloon,
.canvas-element.type-text { overflow: visible; color: #111827; }
.canvas-element img { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
.panel-border-overlay {
  position: absolute;
  z-index: 3;
  inset: 0;
  box-sizing: border-box;
  pointer-events: none;
}
.canvas-element.is-selected { outline: 3px solid var(--le-accent); outline-offset: 2px; }
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
.inspector-tabs button.is-active { background: var(--le-accent-soft); color: #cfe0ff; }
.property-panel,
.layer-panel { height: calc(100% - 49px); overflow: auto; padding: 12px; }
.property-panel > p { color: #7f8ca8; line-height: 1.6; }
.number-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.number-grid label { display: grid; gap: 5px; color: #8491aa; font-size: 12px; }
.collapsible-head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  justify-content: flex-start;
  border: 0;
  background: transparent;
  color: var(--le-text);
  font-size: 13px;
  font-weight: 600;
  min-height: 30px;
  padding: 0;
}
.collapsible-head svg { transition: transform 0.15s ease; }
.collapsible-head svg.is-collapsed { transform: rotate(-90deg); }
.precision-adjust { margin-bottom: 14px; }
.precision-adjust .number-grid { margin-top: 9px; }
.page-settings { border-top: 1px solid var(--le-border); padding-top: 12px; }
.page-settings-body { display: grid; gap: 14px; margin-top: 10px; }
.inspector-hint { color: #7f8ca8; font-size: 12px; line-height: 1.6; margin: 0 0 12px; }
.number-grid input { width: 100%; box-sizing: border-box; }
.property-actions { flex-wrap: wrap; margin-top: 14px; }
.property-help { margin: 8px 0 14px; color: #8491aa; font-size: 11px; line-height: 1.55; }
.preset-picker,
.special-properties,
.reading-order { display: grid; gap: 9px; border-bottom: 1px solid var(--le-border); padding-bottom: 14px; margin-bottom: 14px; }
.section-heading { display: grid; gap: 3px; }
.section-heading small { color: #7f8ca8; font-size: 11px; }
.preset-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.preset-grid button { display: flex; justify-content: space-between; align-items: center; min-width: 0; padding: 6px 8px; font-size: 12px; }
.preset-grid small { color: #7f8ca8; font-size: 10px; }
.preset-picker > p,
.special-properties > p { margin: 0; color: #8491aa; font-size: 11px; line-height: 1.5; }
.special-properties > p.reserved-color-warning {
  border: 1px solid rgba(245, 158, 11, 0.28);
  border-radius: 7px;
  background: rgba(245, 158, 11, 0.08);
  color: #fcd34d;
  padding: 7px;
}
.special-properties > label { display: grid; gap: 5px; color: #8491aa; font-size: 12px; }
.special-properties .check-row { display: flex; align-items: center; grid-template-columns: auto 1fr; }
.special-properties .check-row input { width: auto; }
.balloon-preset-row,
.sfx-preset-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.balloon-preset-row button,
.sfx-preset-row button {
  min-width: 0;
  padding: 0 6px;
  font-size: 11px;
}
.text-preflight-summary { display: grid; gap: 6px; border: 1px solid var(--le-border); border-radius: 9px; padding: 10px; margin: 12px 0; }
.text-preflight-summary p { margin: 0; color: #93a4bf; font-size: 11px; line-height: 1.5; }
.reading-order article { display: flex; align-items: center; justify-content: space-between; gap: 6px; border: 1px solid var(--le-border); border-radius: 7px; padding: 5px 7px; font-size: 12px; }
.reading-order article div { display: flex; }
.reading-order article button { width: 25px; min-height: 25px; padding: 0; border: 0; background: transparent; }
.layer-panel article { display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 1px solid transparent; border-radius: 8px; padding: 7px; margin-bottom: 5px; cursor: pointer; }
.layer-panel article.is-selected { border-color: var(--le-accent-border); background: var(--le-accent-soft); }
.layer-panel article > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.layer-panel article div { display: flex; }
.layer-panel article button { width: 27px; min-height: 27px; padding: 0; border: 0; background: transparent; }
.hidden-summary { color: #7f8ca8; font-size: 11px; padding: 8px; }

.editor-shell.is-readonly .canvas-element { pointer-events: none; }

@media (max-width: 1260px) {
  .editor-shell { grid-template-columns: auto minmax(0, 1fr) auto; }
  .canvas-navigation { width: 210px; }
  .inspector { width: 280px; }
}

@media (min-width: 1024px) and (max-width: 1260px) {
  .layout-editor { --layout-topbar-offset: 91px; }
  .editor-topbar { flex-wrap: wrap; }
  .top-actions {
    flex: 1 1 100%;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
}

@media (max-width: 1023px) {
  .layout-editor { min-height: 680px; overflow: visible; }
  .editor-topbar { flex-wrap: wrap; }
  .top-actions { width: 100%; justify-content: flex-end; flex-wrap: wrap; }
  .editor-shell { grid-template-columns: 1fr; overflow: visible; }
  .canvas-workspace { grid-column: auto; }
  .canvas-tool-float,
    .canvas-navigation,
    .inspector { display: none; }
    .canvas-workspace { min-height: 560px; }
    .layout-source-attention { grid-template-columns: auto minmax(0, 1fr); }
    .export-dialog-backdrop { position: fixed; padding: 12px; }
    .export-artifacts { grid-template-columns: 1fr; }
  }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation: none !important; }
}
</style>

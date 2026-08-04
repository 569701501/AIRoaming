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
        <button
          type="button"
          data-testid="layout-undo"
          :disabled="!session.canUndo.value || session.isReadOnly.value || exportOperationBusy"
          title="撤销上一步调整（Cmd/Ctrl+Z）"
          aria-label="撤销"
          @click="session.undo"
        ><Undo2 :size="16" /></button>
        <button
          type="button"
          :class="{ 'is-active': settingsOpen }"
          :disabled="!session.server.value"
          title="画布尺寸与画格模板"
          aria-label="画布设置"
          @click="toggleSettings"
        ><Settings2 :size="16" /></button>
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

    <LayoutExportDialog
      :open="exportDialogOpen"
      :stage="exportDialogStage"
      :issues="exportDialogIssues"
      :error="exportDialogError"
      :busy="exportOperationBusy"
      :publication="activeExportPublication"
      :publication-request-pending="Boolean(publicationRequestId)"
      :catalog-items="sourceCatalogItems"
      :canvases="session.document.value?.canvases ?? []"
      :artifact-url="publicationArtifactUrl"
      @close="closeExportDialog"
      @confirm="confirmSimpleExport"
      @retry="retrySimpleExport"
    />

    <LayoutConfirmDialog
      :open="confirmDialogOpen"
      :title="confirmDialogState?.title ?? ''"
      :message="confirmDialogState?.message ?? ''"
      :confirm-label="confirmDialogState?.confirmLabel"
      :danger="confirmDialogState?.danger"
      @close="confirmDialogOpen = false"
      @confirm="runConfirmAction"
    />

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
      <aside v-if="leftPanelOpen" class="canvas-navigation is-overlay">
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
            @click="selectSourceShot(item)"
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
            <button
              v-if="advancedToolsVisible"
              type="button"
              :class="{ 'is-active': inspectorOpen }"
              title="选中对象的详细设置"
              aria-label="对象设置面板"
              @click="toggleInspector"
            ><SlidersHorizontal :size="14" />属性</button>
          </div>
          <label>
            缩放
            <input v-model.number="session.zoom.value" type="range" min="0.1" max="0.8" step="0.02" />
            <span>{{ Math.round(session.zoom.value * 100) }}%</span>
          </label>
        </div>
        <div class="stage-wrap" :class="{ 'has-left-panel': leftPanelOpen }">
          <nav class="canvas-tool-float" aria-label="画布工具">
            <button :class="{ 'is-active': activeTool === 'select' }" type="button" title="选择" aria-label="选择工具" @click="activeTool = 'select'"><MousePointer2 :size="16" /></button>
            <button :class="{ 'is-active': activeTool === 'pan' }" type="button" title="平移" aria-label="平移工具" @click="activeTool = 'pan'"><Hand :size="16" /></button>
            <button
              v-if="advancedToolsVisible"
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
            v-if="advancedToolsVisible && canReplacePrimarySource && !session.isReadOnly.value && sourceCatalogItems.length"
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
            @scroll="handleStageScroll"
            @pointerdown="handleStageBackgroundPointerDown"
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
              @clear-selection="session.selectedElementIds.value = []"
              @preview-transform="previewKonvaTransforms"
              @commit-transform="commitKonvaTransforms"
              @commit-tail="commitKonvaTail"
              @commit-crop="commitKonvaCrop"
              @pan="panKonvaViewport"
              @zoom="zoomKonvaViewport"
              @context-menu="openElementContextMenu"
              @edit-text="startInlineTextEdit"
            />
            <div
              v-if="inlineTextEdit && inlineEditElement"
              class="inline-text-editor"
              data-testid="layout-inline-text-editor"
              :style="inlineEditStyle"
              @pointerdown.stop
              @mousedown.stop
              @click.stop
              @contextmenu.stop
            >
              <textarea
                ref="inlineTextarea"
                v-model="inlineTextEdit.value"
                :style="inlineEditTextareaStyle"
                aria-label="画布内编辑文字"
                @keydown.esc.stop="cancelInlineTextEdit"
                @keydown.meta.enter.prevent="commitInlineTextEdit"
                @keydown.ctrl.enter.prevent="commitInlineTextEdit"
                @blur="commitInlineTextEdit"
              />
              <small>点击其他位置或 Cmd+Enter 完成 · Esc 取消</small>
            </div>
          </div>
          </div>
          <div
            v-if="selectionToolbarVisible"
            ref="selectionToolbarEl"
            class="selection-toolbar"
            data-testid="layout-selection-toolbar"
            :style="selectionToolbarStyle"
            @pointerdown.stop
            @mousedown.stop
            @click.stop
            @contextmenu.stop
          >
            <template v-if="isMultiSelection">
              <button type="button" :disabled="session.isReadOnly.value" title="左对齐" aria-label="左对齐" @click="alignSelected('left')"><AlignStartVertical :size="15" /></button>
              <button type="button" :disabled="session.isReadOnly.value" title="水平居中" aria-label="水平居中" @click="alignSelected('center')"><AlignCenterVertical :size="15" /></button>
              <button type="button" :disabled="session.isReadOnly.value" title="顶对齐" aria-label="顶对齐" @click="alignSelected('top')"><AlignStartHorizontal :size="15" /></button>
              <button type="button" :disabled="session.isReadOnly.value || session.selectedElementIds.value.length < 3" title="水平分布" aria-label="水平分布" @click="distributeHorizontal"><AlignHorizontalDistributeCenter :size="15" /></button>
              <span class="toolbar-divider" />
              <button type="button" class="is-danger" :disabled="session.isReadOnly.value" title="删除选中对象" aria-label="删除选中对象" @click="deleteSelectedElements"><Trash2 :size="15" /></button>
            </template>
            <template v-else-if="primaryElement">
              <button
                v-if="advancedToolsVisible && primaryCrop"
                type="button"
                :disabled="cannotEditPrimary"
                title="在画布上拖调裁切"
                aria-label="调整裁切"
                @click="activeTool = 'crop'"
              ><Crop :size="15" /></button>
              <template v-if="primaryElement.type === 'balloon'">
                <select
                  class="toolbar-select"
                  :value="resolveLayoutBalloonVisualRoleV1(primaryElement)"
                  :disabled="cannotEditPrimary"
                  title="气泡类型"
                  aria-label="气泡类型"
                  @change="setBalloonKind"
                >
                  <option value="speech">对白</option>
                  <option value="thought">思考</option>
                  <option value="shout">喊叫</option>
                  <option value="caption">旁白框</option>
                </select>
                <button
                  type="button"
                  :class="{ 'is-active': primaryElement.tail.enabled }"
                  :disabled="cannotEditPrimary || primaryElement.balloonKind === 'caption'"
                  title="尾巴"
                  aria-label="切换气泡尾巴"
                  @click="toggleBalloonTail"
                ><Spline :size="15" /></button>
              </template>
              <template v-if="primaryElement.type === 'text' || primaryElement.type === 'balloon'">
                <span class="toolbar-divider" />
                <button type="button" :disabled="cannotEditPrimary" title="缩小文字" aria-label="缩小文字" @click="adjustTextFontSize(-4)"><Minus :size="15" /></button>
                <button type="button" :disabled="cannotEditPrimary" title="放大文字" aria-label="放大文字" @click="adjustTextFontSize(4)"><Plus :size="15" /></button>
                <button
                  type="button"
                  :class="{ 'is-active': (primaryElement.richText.paragraphs.flatMap((paragraph) => paragraph.runs)[0]?.fontWeight ?? 400) >= 700 }"
                  :disabled="cannotEditPrimary"
                  title="加粗"
                  aria-label="粗体"
                  @click="toggleTextBold"
                ><Bold :size="15" /></button>
                <div class="toolbar-color-swatches" role="group" aria-label="文字颜色">
                  <button
                    v-for="color in TEXT_COLOR_PALETTE"
                    :key="color"
                    type="button"
                    class="color-swatch"
                    :class="{ 'is-active': (primaryElement.richText.paragraphs.flatMap((paragraph) => paragraph.runs)[0]?.color ?? '').toUpperCase().startsWith(color) }"
                    :style="{ backgroundColor: color }"
                    :title="TEXT_COLOR_NAMES[color] ?? color"
                    :aria-label="`文字颜色 ${TEXT_COLOR_NAMES[color] ?? color}`"
                    :disabled="cannotEditPrimary"
                    @click="setTextColor(color)"
                  />
                </div>
              </template>
              <button
                v-if="advancedToolsVisible && primaryElement.type === 'free_image' && emptyTargetPanel"
                type="button"
                :disabled="cannotEditPrimary"
                title="自由图放回空画格"
                aria-label="自由图放回画格"
                @click="attachPrimaryFreeToPanel"
              ><PictureInPicture2 :size="15" /></button>
              <span class="toolbar-divider" />
              <button type="button" :disabled="session.isReadOnly.value" title="复制" aria-label="复制" @click="duplicatePrimaryElement"><Copy :size="15" /></button>
              <button type="button" :disabled="session.isReadOnly.value" :title="primaryElement.locked ? '解锁' : '锁定'" :aria-label="primaryElement.locked ? '解锁' : '锁定'" @click="setElementLocked(primaryElement.id, !primaryElement.locked)">
                <Unlock v-if="primaryElement.locked" :size="15" /><Lock v-else :size="15" />
              </button>
              <button type="button" class="is-danger" :disabled="session.isReadOnly.value || primaryElement.locked" title="删除" aria-label="删除" @click="deletePrimaryElement"><Trash2 :size="15" /></button>
            </template>
          </div>
        </div>
      </main>

      <aside v-if="advancedToolsVisible && inspectorOpen" class="inspector is-overlay">
        <div class="inspector-tabs">
          <button type="button" :class="{ 'is-active': inspectorTab === 'properties' }" @click="inspectorTab = 'properties'">属性</button>
          <button v-if="advancedToolsVisible" type="button" :class="{ 'is-active': inspectorTab === 'layers' }" @click="inspectorTab = 'layers'">图层</button>
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
            <section v-if="advancedToolsVisible" class="precision-adjust">
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

            <section v-if="advancedToolsVisible && primaryElement.type === 'panel_frame'" class="special-properties">
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

            <section v-if="advancedToolsVisible && primaryImage" class="special-properties" data-testid="crop-controls">
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

            <section v-if="advancedToolsVisible && primaryElement.type === 'text'" class="special-properties" data-testid="text-semantic-controls">
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
              v-if="advancedToolsVisible && (primaryElement.type === 'text' || primaryElement.type === 'balloon')"
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

            <section v-if="advancedToolsVisible && primaryElement.type === 'balloon'" class="special-properties" data-testid="balloon-controls">
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
            <section v-if="advancedToolsVisible && currentPanels.length" class="reading-order">
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
        </div>

        <div v-else class="layer-panel">
          <article
            v-for="(element, index) in reversedLayers"
            :key="element.id"
            :class="{ 'is-selected': isSelected(element.id) }"
            @click="session.selectElement(element.id, false)"
            @contextmenu.prevent="openElementContextMenu({ elementId: element.id, clientX: $event.clientX, clientY: $event.clientY })"
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

      <LayoutCanvasSettingsDrawer
        :open="settingsOpen"
        :is-paged="isPaged"
        :read-only="session.isReadOnly.value"
        :advanced-tools-visible="advancedToolsVisible"
        :layout-document="session.document.value"
        :canvas="session.currentCanvas.value"
        :panels="currentPanels"
        @close="settingsOpen = false"
        @apply-profile-resize="applyProfileResizeFromDrawer"
        @apply-section-height="applySectionHeightFromDrawer"
        @apply-preset="applyPresetFromDrawer"
      />
    </div>

    <div
      v-if="contextMenu && contextMenuElement"
      class="layout-context-menu"
      data-testid="layout-context-menu"
      role="menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
    >
      <button type="button" role="menuitem" :disabled="session.isReadOnly.value" @click="runContextMenuAction(duplicatePrimaryElement)">复制对象</button>
      <button
        v-if="advancedToolsVisible && primaryCrop"
        type="button"
        role="menuitem"
        :disabled="session.isReadOnly.value || contextMenuElement.locked"
        @click="runContextMenuAction(() => { activeTool = 'crop'; })"
      >在画布上拖调裁切</button>
      <button
        v-if="contextMenuElement.type === 'panel_frame' && contextMenuElement.contentImage"
        type="button"
        role="menuitem"
        :disabled="session.isReadOnly.value || contextMenuElement.locked"
        @click="runContextMenuAction(detachPanelImage)"
      >分离为自由图</button>
      <button
        v-if="contextMenuElement.type === 'free_image' && emptyTargetPanel"
        type="button"
        role="menuitem"
        :disabled="session.isReadOnly.value || contextMenuElement.locked"
        @click="runContextMenuAction(attachPrimaryFreeToPanel)"
      >自由图放回画格</button>
      <hr />
      <button
        type="button"
        role="menuitem"
        :disabled="contextMenuLayerIndex <= 0"
        @click="runContextMenuAction(() => moveLayer(contextMenuElement!.id, 'up'))"
      >上移一层</button>
      <button
        type="button"
        role="menuitem"
        :disabled="contextMenuLayerIndex < 0 || contextMenuLayerIndex >= reversedLayers.length - 1"
        @click="runContextMenuAction(() => moveLayer(contextMenuElement!.id, 'down'))"
      >下移一层</button>
      <hr />
      <button
        type="button"
        role="menuitem"
        :disabled="session.isReadOnly.value"
        @click="runContextMenuAction(() => setElementLocked(contextMenuElement!.id, !contextMenuElement!.locked))"
      >{{ contextMenuElement.locked ? '解锁对象' : '锁定对象' }}</button>
      <button
        type="button"
        role="menuitem"
        :disabled="session.isReadOnly.value || contextMenuElement.locked"
        @click="runContextMenuAction(() => setElementHidden(contextMenuElement!.id, !contextMenuElement!.hidden))"
      >{{ contextMenuElement.hidden ? '显示对象' : '隐藏对象' }}</button>
      <button
        type="button"
        role="menuitem"
        class="is-danger"
        :disabled="session.isReadOnly.value || contextMenuElement.locked"
        @click="runContextMenuAction(deletePrimaryElement)"
      >删除对象</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  AlignCenterVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlertTriangle,
  Bold,
  ChevronDown,
  ChevronUp,
  Copy,
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
  Minus,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  PictureInPicture2,
  Plus,
  Settings2,
  SlidersHorizontal,
  Smartphone,
  Spline,
  SquareDashed,
  Trash2,
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
  LayoutPreflightIssueV1,
  LayoutPreflightIssueV2,
  LayoutPreflightReportV1,
  LayoutPreflightReportV2,
  LayoutProfileV1,
  LayoutPublicationHistoryResponseV1,
  LayoutPublicationHistoryResponseV2,
  LayoutPublicationProfileV1,
  LayoutPublicationSummaryV1,
  LayoutPublicationSummaryV2,
  LayoutRevisionDetailV1OrV2,
  LayoutSourceCatalogItemV1,
  LayoutTextIssueV1,
  LayoutTopLevelElementV1,
  PanelFrameElementV1,
  PanelImageElementV1,
  RichTextDocumentV1,
  RichTextRangeV1,
  RichTextRunStylePatchV1,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import {
  evaluateCoverCropV1,
  applyRichTextRangeStyle,
  collectLayoutTextIssuesV1,
  countLayoutGraphemes,
  layoutBalloonVisualPresetV1,
  resolveLayoutBalloonVisualRoleV1,
  projectVisibleShotPlacementsV1,
  replaceRichTextRange,
  richTextPlainTextV1,
  LayoutPublicationProfileCodecV1,
} from "@airoaming/shared";

import { useLayoutEditorSession } from "../../composables/layout-editor-session";
import { useLayoutCompositionSession } from "../../composables/layout-composition-session";
import { useLayoutFontLoader } from "../../composables/layout-font-loader";
import { api, ApiClientError } from "../../services/api";
import LayoutElementTextPreview from "./LayoutElementTextPreview.vue";
import LayoutExportDialog from "./LayoutExportDialog.vue";
import type { LayoutExportDialogStage } from "./layout-export-dialog";
import LayoutCanvasSettingsDrawer from "./LayoutCanvasSettingsDrawer.vue";
import LayoutConfirmDialog from "./LayoutConfirmDialog.vue";
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
const inspectorTab = ref<"properties" | "layers">("properties");
const inspectorOpen = ref(false);
const settingsOpen = ref(false);
const selectedSourceShotId = ref<string | null>(null);
const actionError = ref<string | null>(null);
const mobilePreviewFeedback = ref<string | null>(null);
const mobilePreviewFallbackUrl = ref<string | null>(null);
const mobilePreviewBusy = ref(false);
const exportOperationBusy = ref(false);
const exportDialogOpen = ref(false);
const exportDialogStage = ref<LayoutExportDialogStage>("checking");
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
const advancedToolsVisible = ref(false);
const stageScroll = ref<HTMLElement | null>(null);
const leftPanelOpen = ref(false);
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

function selectSourceShot(item: LayoutSourceCatalogItemV1): void {
  selectedSourceShotId.value = item.source.shotId;
  const placement = visiblePlacements.value[item.source.shotId]?.[0];
  if (!placement) return;
  session.selectCanvas(placement.canvasId);
  const canvas = session.document.value?.canvases.find((entry) => entry.id === placement.canvasId);
  const element = canvas?.elements.find((entry) => entry.id === placement.elementId);
  const scroller = stageScroll.value;
  if (!element || !scroller) return;
  const zoom = session.zoom.value;
  const targetTop = Math.max(0, element.transform.y * zoom - scroller.clientHeight / 2 + element.transform.height * zoom / 2);
  scroller.scrollTo({ top: targetTop, behavior: "smooth" });
}
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
const cannotEditPrimary = computed(() => session.isReadOnly.value || Boolean(primaryElement.value?.locked));

watch(() => primaryElement.value?.id ?? null, (id) => {
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
  requestConfirm({
    title: "用当前定稿重建？",
    message: "将使用当前定稿重新建立 V1 草稿。旧排版证据仍保留，但不会被猜测为 current。此操作不可撤销。",
    confirmLabel: "确认重建",
    danger: true,
  }, () => {
    void runRebuildLegacyDraft();
  });
}

async function runRebuildLegacyDraft(): Promise<void> {
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

function toggleInspector(): void {
  inspectorOpen.value = !inspectorOpen.value;
  if (inspectorOpen.value) settingsOpen.value = false;
}

const isMultiSelection = computed(() => session.selectedElementIds.value.length > 1);

const previewTransforms = ref<KonvaTransformCommitV1[] | null>(null);

function previewKonvaTransforms(changes: KonvaTransformCommitV1[] | null): void {
  previewTransforms.value = changes;
}

function previewTransformFor(elementId: string) {
  return previewTransforms.value?.find((change) => change.elementId === elementId)?.transform ?? null;
}

const inlineTextEdit = ref<{ elementId: string; value: string } | null>(null);
const inlineTextarea = ref<HTMLTextAreaElement | null>(null);
const inlineEditElement = computed(() => inlineTextEdit.value
  ? currentElements.value.find((element) => element.id === inlineTextEdit.value!.elementId) ?? null
  : null);

function startInlineTextEdit(elementId: string): void {
  const element = currentElements.value.find((item) => item.id === elementId);
  if (!element || (element.type !== "text" && element.type !== "balloon")) return;
  if (session.isReadOnly.value || element.locked || element.hidden) return;
  session.selectElement(elementId);
  inlineTextEdit.value = { elementId, value: richTextPlainTextV1(element.richText) };
  void nextTick(() => {
    inlineTextarea.value?.focus();
    inlineTextarea.value?.select();
  });
}

function cancelInlineTextEdit(): void {
  inlineTextEdit.value = null;
}

function commitInlineTextEdit(): void {
  const edit = inlineTextEdit.value;
  const element = edit ? currentElements.value.find((item) => item.id === edit.elementId) : null;
  const canvas = session.currentCanvas.value;
  inlineTextEdit.value = null;
  if (!edit || !element || !canvas || (element.type !== "text" && element.type !== "balloon")) return;
  const next = edit.value.replace(/\r\n/g, "\n");
  if (next === richTextPlainTextV1(element.richText)) return;
  const firstParagraph = element.richText.paragraphs[0];
  const firstRun = firstParagraph?.runs[0];
  const baseRun = firstRun ? structuredClone(firstRun) : structuredClone(defaultRichText("").paragraphs[0]!.runs[0]!);
  const richText: RichTextDocumentV1 = {
    ...structuredClone(element.richText),
    paragraphs: next.split("\n").map((line) => ({
      align: firstParagraph?.align ?? "start",
      lineHeight: firstParagraph?.lineHeight ?? 1.2,
      runs: [{ ...structuredClone(baseRun), text: line }],
    })),
  };
  session.execute(element.type === "text"
    ? command("text.replace_document", "画布内编辑文字", { canvasId: canvas.id, elementId: element.id, richText })
    : command("balloon.replace_text_document", "画布内编辑气泡文字", { canvasId: canvas.id, elementId: element.id, richText }));
}

const inlineEditStyle = computed(() => {
  const element = inlineEditElement.value;
  if (!element) return {};
  const zoom = session.zoom.value;
  return {
    left: `${element.transform.x * zoom}px`,
    top: `${element.transform.y * zoom}px`,
    width: `${Math.max(120, element.transform.width * zoom)}px`,
    minHeight: `${Math.max(72, element.transform.height * zoom)}px`,
  };
});

const inlineEditTextareaStyle = computed(() => {
  const element = inlineEditElement.value;
  if (!element || (element.type !== "text" && element.type !== "balloon")) return {};
  const firstRun = element.richText.paragraphs[0]?.runs[0];
  const zoom = session.zoom.value;
  return {
    fontSize: `${Math.max(11, (firstRun?.fontSize ?? 64) * zoom)}px`,
    fontWeight: String(firstRun?.fontWeight ?? 400),
    color: firstRun?.color ? `#${firstRun.color.slice(1, 7)}` : "#111827",
    minHeight: `${Math.max(48, element.transform.height * zoom - 20)}px`,
  };
});

const selectionToolbarVisible = computed(() => (
  Boolean(primaryElement.value)
  && Boolean(session.currentCanvas.value)
  && !session.isReadOnly.value
  && activeTool.value !== "crop"
  && !contextMenu.value
  && !inlineTextEdit.value
));

const selectionToolbarEl = ref<HTMLElement | null>(null);
const selectionToolbarSize = ref({ width: 0, height: 0 });
watch(selectionToolbarEl, (element) => {
  if (!element) {
    selectionToolbarSize.value = { width: 0, height: 0 };
    return;
  }
  const measure = () => {
    const rect = element.getBoundingClientRect();
    selectionToolbarSize.value = { width: rect.width, height: rect.height };
  };
  measure();
  const observer = new ResizeObserver(measure);
  observer.observe(element);
  watch(selectionToolbarEl, (next) => {
    if (next !== element) observer.disconnect();
  }, { immediate: true });
});

const stageScrollPos = ref({ left: 0, top: 0 });
function handleStageScroll(): void {
  const el = stageScroll.value;
  if (!el) return;
  stageScrollPos.value = { left: el.scrollLeft, top: el.scrollTop };
}

function handleStageBackgroundPointerDown(event: PointerEvent): void {
  if (session.isReadOnly.value) return;
  if (!session.selectedElementIds.value.length) return;
  if (inlineTextEdit.value || contextMenu.value) return;
  const target = event.target as HTMLElement | null;
  if (!target) return;
  if (target.closest(".document-canvas")) return;
  session.selectedElementIds.value = [];
}

const selectionToolbarStyle = computed(() => {
  const element = primaryElement.value;
  const canvas = session.currentCanvas.value;
  const scrollEl = stageScroll.value;
  if (!element || !canvas) return {};
  const zoom = session.zoom.value;
  const transform = previewTransformFor(element.id) ?? element.transform;
  const x = transform.x * zoom;
  const y = transform.y * zoom;
  const height = transform.height * zoom;
  const canvasWidth = canvas.width * zoom;
  const canvasHeight = canvas.height * zoom;
  const toolbarWidth = Math.max(120, selectionToolbarSize.value.width);
  const toolbarHeight = Math.max(40, selectionToolbarSize.value.height);
  const gap = 8;
  const viewportWidth = scrollEl?.clientWidth ?? Math.max(canvasWidth, 320);
  const viewportHeight = scrollEl?.clientHeight ?? Math.max(canvasHeight, 320);
  // 画布在滚动容器内的居中偏移（stage-scroll padding: 40px 48px）
  const paddingTop = 40;
  const paddingLeft = 48;
  const availableWidth = Math.max(0, viewportWidth - paddingLeft * 2);
  const canvasLeft = paddingLeft + Math.max(0, (availableWidth - canvasWidth) / 2);
  const scroll = stageScrollPos.value;
  // 元素相对可视区的坐标（画布居中偏移 + 元素画布坐标 - 滚动偏移）
  const elementViewX = canvasLeft + x - scroll.left;
  const elementViewY = paddingTop + y - scroll.top;
  // 工具条钳制在可视区内（不被画布边缘裁切，也尽量不盖住左栏）
  const leftLimit = leftPanelOpen.value ? 272 : 4;
  const left = Math.max(leftLimit, Math.min(elementViewX, Math.max(leftLimit, viewportWidth - toolbarWidth - 4)));
  const placeAbove = elementViewY >= toolbarHeight + gap;
  let top = placeAbove ? elementViewY : elementViewY + height;
  if (placeAbove) {
    if (top - toolbarHeight - gap < 0) top = toolbarHeight + gap;
  } else {
    if (top + toolbarHeight + gap > viewportHeight) top = Math.max(4, viewportHeight - toolbarHeight - gap);
  }
  return {
    left: `${left}px`,
    top: `${top}px`,
    transform: placeAbove ? "translateY(calc(-100% - 8px))" : "translateY(8px)",
  };
});

function toggleBalloonTail(): void {
  const element = primaryElement.value;
  const canvas = session.currentCanvas.value;
  if (element?.type !== "balloon" || !canvas || element.balloonKind === "caption") return;
  session.execute(command("balloon.set_tail", element.tail.enabled ? "隐藏气泡尾巴" : "显示气泡尾巴", {
    canvasId: canvas.id,
    elementId: element.id,
    tail: { ...element.tail, enabled: !element.tail.enabled },
  }));
}

function toggleSettings(): void {
  settingsOpen.value = !settingsOpen.value;
  if (settingsOpen.value) inspectorOpen.value = false;
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

function shortDigest(digest: string): string {
  return `${digest.slice(0, 14)}…${digest.slice(-8)}`;
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

function fullTextRangeV1(richText: RichTextDocumentV1): RichTextRangeV1 {
  const paragraphs = richText.paragraphs;
  const last = paragraphs[paragraphs.length - 1];
  if (!last) return { start: { paragraphIndex: 0, graphemeOffset: 0 }, end: { paragraphIndex: 0, graphemeOffset: 0 } };
  const lastLength = last.runs.reduce((sum, run) => sum + countLayoutGraphemes(run.text), 0);
  return {
    start: { paragraphIndex: 0, graphemeOffset: 0 },
    end: { paragraphIndex: paragraphs.length - 1, graphemeOffset: lastLength },
  };
}

const TEXT_COLOR_PALETTE = ["#111827", "#FFFFFF", "#DC2626", "#2563EB", "#F59E0B", "#059669", "#7C3AED"] as const;
const TEXT_COLOR_NAMES: Record<string, string> = {
  "#111827": "黑色",
  "#FFFFFF": "白色",
  "#DC2626": "红色",
  "#2563EB": "蓝色",
  "#F59E0B": "橙色",
  "#059669": "绿色",
  "#7C3AED": "紫色",
};

function applyTextStylePatch(style: RichTextRunStylePatchV1, label: string): void {
  const element = primaryElement.value;
  const canvas = session.currentCanvas.value;
  if (!element || !canvas || (element.type !== "text" && element.type !== "balloon")) return;
  const range = fullTextRangeV1(element.richText);
  if (element.type === "text") {
    session.execute(command("text.apply_range_style", label, {
      canvasId: canvas.id,
      elementId: element.id,
      ...range,
      style,
    }));
  } else {
    const richText = applyRichTextRangeStyle(element.richText, range, style);
    session.execute(command("balloon.replace_text_document", label, {
      canvasId: canvas.id,
      elementId: element.id,
      richText,
    }));
  }
}

function adjustTextFontSize(delta: number): void {
  const element = primaryElement.value;
  if (!element || (element.type !== "text" && element.type !== "balloon")) return;
  const firstRun = element.richText.paragraphs.flatMap((paragraph) => paragraph.runs)[0];
  const current = firstRun?.fontSize ?? 64;
  const next = Math.max(6, Math.min(512, Math.round(current + delta)));
  if (next === current) return;
  applyTextStylePatch({ fontSize: next }, delta > 0 ? "放大文字" : "缩小文字");
}

function toggleTextBold(): void {
  const element = primaryElement.value;
  if (!element || (element.type !== "text" && element.type !== "balloon")) return;
  const firstRun = element.richText.paragraphs.flatMap((paragraph) => paragraph.runs)[0];
  if (!firstRun) return;
  const targetWeight = firstRun.fontWeight >= 700 ? 400 : 700;
  const catalog = session.fontCatalog.value?.items ?? [];
  const currentFace = catalog.find((font) => font.assetId === firstRun.fontAssetId);
  const targetFace = currentFace
    ? catalog.find((font) => (
        font.metadata.familyName === currentFace.metadata.familyName
        && font.metadata.face.weight === targetWeight
        && font.metadata.face.style === "normal"
      ))
    : null;
  applyTextStylePatch({
    fontWeight: targetWeight,
    fontStyle: "normal",
    ...(targetFace ? { fontAssetId: targetFace.assetId } : {}),
  }, targetWeight >= 700 ? "加粗文字" : "取消加粗");
}

function setTextColor(color: string): void {
  applyTextStylePatch({ color: `${color}FF` }, "调整文字颜色");
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

function applyPresetFromDrawer(value: { panels: PanelFrameElementV1[]; panelReadingOrder: string[] }): void {
  const canvas = session.currentCanvas.value;
  if (!canvas) return;
  session.execute(command("layout.apply_preset", "应用画格模板", {
    canvasId: canvas.id,
    panels: value.panels,
    panelReadingOrder: value.panelReadingOrder,
  }));
  session.selectedElementIds.value = [];
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

function applyProfileResizeFromDrawer(preview: { profile: LayoutProfileV1; canvases: LayoutCanvasV1[] }): void {
  const selectedCanvasId = session.currentCanvas.value?.id ?? null;
  session.execute(command("layout.resize_profile", "调整画布尺寸", {
    profile: preview.profile,
    canvases: preview.canvases,
  }));
  if (selectedCanvasId) session.selectCanvas(selectedCanvasId);
}

function applySectionHeightFromDrawer(height: number): void {
  const canvas = session.currentCanvas.value;
  if (!canvas || isPaged.value) return;
  session.execute(command("canvas.resize", "调整当前段高", {
    canvasId: canvas.id,
    canvas: { ...structuredClone(canvas), height },
  }));
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
  const transform = previewTransformFor(element.id) ?? element.transform;
  return {
    left: `${transform.x * zoom}px`,
    top: `${transform.y * zoom}px`,
    width: `${transform.width * zoom}px`,
    height: `${transform.height * zoom}px`,
    opacity: transform.opacity,
    transform: `rotate(${transform.rotation}deg)`,
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

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  action: () => void;
}

const confirmDialogOpen = ref(false);
const confirmDialogState = ref<ConfirmDialogState | null>(null);

function requestConfirm(state: Omit<ConfirmDialogState, "action">, action: () => void): void {
  confirmDialogState.value = { ...state, action };
  confirmDialogOpen.value = true;
}

function runConfirmAction(): void {
  const state = confirmDialogState.value;
  confirmDialogOpen.value = false;
  confirmDialogState.value = null;
  state?.action();
}

function deleteElementsWithConfirm(elements: LayoutTopLevelElementV1[]): void {
  const canvas = session.currentCanvas.value;
  if (!canvas || !elements.length) return;
  const occupiedPanel = elements.some((element) => element.type === "panel_frame" && element.contentImage);
  const title = elements.length === 1 ? `删除这个${ELEMENT_TYPE_LABELS[elements[0]!.type]}？` : `删除选中的 ${elements.length} 个对象？`;
  const message = occupiedPanel
    ? "其中有已放置镜头的画格，删除后对应镜头会回到“未放置”。此操作不可撤销。"
    : "删除后无法恢复，此操作不可撤销。";
  requestConfirm({ title, message, confirmLabel: "删除", danger: true }, () => {
    executeBatch("删除对象", elements.map((element) => command("element.delete", "删除对象", { canvasId: canvas.id, elementId: element.id })));
    session.selectedElementIds.value = [];
  });
}

function deletePrimaryElement(): void {
  const element = primaryElement.value;
  if (!element) return;
  deleteElementsWithConfirm([element]);
}

function deleteSelectedElements(): void {
  deleteElementsWithConfirm([...session.selectedElements.value].filter((element) => !element.locked));
}

const contextMenu = ref<{ elementId: string; x: number; y: number } | null>(null);
const contextMenuElement = computed(() => contextMenu.value
  ? currentElements.value.find((element) => element.id === contextMenu.value!.elementId) ?? null
  : null);
const contextMenuLayerIndex = computed(() => contextMenuElement.value
  ? reversedLayers.value.findIndex((element) => element.id === contextMenuElement.value!.id)
  : -1);

function openElementContextMenu(value: { elementId: string; clientX: number; clientY: number }): void {
  if (session.isReadOnly.value) return;
  if (!currentElements.value.some((element) => element.id === value.elementId)) return;
  if (!session.selectedElementIds.value.includes(value.elementId)) {
    session.selectedElementIds.value = [value.elementId];
  }
  contextMenu.value = {
    elementId: value.elementId,
    x: Math.max(8, Math.min(value.clientX, window.innerWidth - 196)),
    y: Math.max(8, Math.min(value.clientY, window.innerHeight - 340)),
  };
}

function closeContextMenu(): void {
  contextMenu.value = null;
}

function runContextMenuAction(action: () => void): void {
  action();
  closeContextMenu();
}

watch(contextMenu, (open, _previous, onCleanup) => {
  if (!open) return;
  const handler = (event: PointerEvent) => {
    if (!(event.target as HTMLElement | null)?.closest(".layout-context-menu")) closeContextMenu();
  };
  window.addEventListener("pointerdown", handler, true);
  onCleanup(() => window.removeEventListener("pointerdown", handler, true));
});

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
  if (commandKey && event.key.toLowerCase() === "z" && !event.shiftKey) {
    event.preventDefault();
    session.undo();
    return;
  }
  if (event.key === "Escape") {
    if (contextMenu.value) {
      closeContextMenu();
      return;
    }
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
  --le-bg-app: #0a0d14;
  --le-bg-panel: #10141f;
  --le-bg-stage: #090c13;
  --le-bg-control: rgba(22, 28, 44, 0.9);
  --le-border: rgba(148, 163, 184, 0.14);
  --le-border-strong: rgba(148, 163, 184, 0.22);
  --le-text: #e8edf8;
  --le-text-dim: #8b98b2;
  --le-accent: #8b5cf6;
  --le-accent-soft: rgba(139, 92, 246, 0.16);
  --le-accent-border: rgba(139, 92, 246, 0.5);
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
  border: 1px solid rgba(139, 92, 246, 0.3);
  background: rgba(139, 92, 246, 0.1);
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
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
  --editor-toolbar-h: 45px;
}

.canvas-navigation,
.inspector {
  min-height: 0;
  background: var(--le-bg-panel);
}

.canvas-navigation.is-overlay {
  position: absolute;
  z-index: 40;
  top: var(--editor-toolbar-h);
  bottom: 0;
  left: 0;
  width: 260px;
  max-width: calc(100% - 48px);
  border-right: 1px solid var(--le-border);
  box-shadow: 18px 0 44px rgba(2, 6, 17, 0.5);
}

.inspector.is-overlay {
  position: absolute;
  z-index: 40;
  top: var(--editor-toolbar-h);
  right: 0;
  bottom: 0;
  width: 340px;
  max-width: calc(100% - 48px);
  border-left: 1px solid var(--le-border);
  box-shadow: -18px 0 44px rgba(2, 6, 17, 0.5);
}

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

.stage-wrap.has-left-panel .canvas-tool-float { left: 272px; }

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
.inspector-hint { color: #7f8ca8; font-size: 12px; line-height: 1.6; margin: 0 0 12px; }

.layout-context-menu {
  position: fixed;
  z-index: 60;
  min-width: 168px;
  display: grid;
  gap: 1px;
  padding: 5px;
  background: var(--le-bg-panel);
  border: 1px solid var(--le-border-strong);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(2, 6, 17, 0.55);
}
.layout-context-menu button {
  display: block;
  width: 100%;
  padding: 7px 10px;
  background: none;
  border: none;
  border-radius: 7px;
  color: var(--le-text);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.layout-context-menu button:hover:not(:disabled) { background: var(--le-accent-soft); }
.layout-context-menu button:disabled { opacity: 0.4; cursor: default; }
.layout-context-menu button.is-danger { color: #fda4af; }
.layout-context-menu hr { border: none; border-top: 1px solid var(--le-border); margin: 3px 4px; }

.selection-toolbar {
  position: absolute;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 3px;
  border: 1px solid var(--le-border-strong);
  border-radius: 10px;
  background: rgba(16, 20, 31, 0.96);
  box-shadow: 0 10px 28px rgba(2, 6, 17, 0.55);
  padding: 4px;
}

.selection-toolbar button {
  display: grid;
  place-items: center;
  width: 30px;
  min-height: 30px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--le-text);
  padding: 0;
}

.selection-toolbar button:hover:not(:disabled) { background: var(--le-accent-soft); }
.selection-toolbar button.is-active { background: var(--le-accent-soft); color: #ddd3ff; }
.selection-toolbar button.is-danger { color: #fda4af; }
.selection-toolbar .toolbar-divider { width: 1px; height: 18px; background: var(--le-border-strong); }
.selection-toolbar .toolbar-select {
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--le-text);
  min-height: 30px;
  padding: 0 4px;
  font-size: 12px;
}
.selection-toolbar .toolbar-select option { background: var(--le-bg-panel); color: var(--le-text); }
.selection-toolbar .toolbar-color-swatches {
  display: flex;
  align-items: center;
  gap: 3px;
  margin: 0 2px;
}
.selection-toolbar .color-swatch {
  width: 16px;
  min-height: 16px;
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 50%;
  box-sizing: border-box;
}
.selection-toolbar .color-swatch.is-active {
  outline: 2px solid var(--le-accent);
  outline-offset: 1px;
}

.inline-text-editor {
  position: absolute;
  z-index: 55;
  display: grid;
  gap: 4px;
  border: 2px solid var(--le-accent);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 12px 34px rgba(2, 6, 17, 0.5);
  padding: 6px;
}

.inline-text-editor textarea {
  width: 100%;
  box-sizing: border-box;
  border: 0;
  background: transparent;
  line-height: 1.35;
  padding: 2px 4px;
  resize: none;
  outline: none;
  font-family: inherit;
}

.inline-text-editor small {
  color: #6b7686;
  font-size: 10px;
  line-height: 1.2;
  padding: 0 2px;
}
.number-grid input { width: 100%; box-sizing: border-box; }
.property-actions { flex-wrap: wrap; margin-top: 14px; }
.property-help { margin: 8px 0 14px; color: #8491aa; font-size: 11px; line-height: 1.55; }
.special-properties,
.reading-order { display: grid; gap: 9px; border-bottom: 1px solid var(--le-border); padding-bottom: 14px; margin-bottom: 14px; }
.section-heading { display: grid; gap: 3px; }
.section-heading small { color: #7f8ca8; font-size: 11px; }
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
  .canvas-navigation.is-overlay { width: 230px; }
  .inspector.is-overlay { width: 300px; }
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
  .editor-shell { overflow: visible; }
  .canvas-tool-float,
    .canvas-navigation,
    .inspector,
    .canvas-settings-drawer { display: none; }
    .canvas-workspace { min-height: 560px; }
    .layout-source-attention { grid-template-columns: auto minmax(0, 1fr); }
  }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation: none !important; }
}
</style>

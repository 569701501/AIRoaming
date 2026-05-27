<template>
  <aside class="chapter-inspector-panel" aria-label="当前章节信息">
    <header class="inspector-header">
      <span>当前章节</span>
      <h3>{{ chapterInfo.title }}</h3>
    </header>

    <div class="inspector-content">
      <section class="inspector-section">
        <div class="section-title">
          <Route :size="14" />
          <span>故事主线</span>
        </div>
        <p class="section-copy">{{ chapterInfo.mainline }}</p>
      </section>

      <section class="inspector-section">
        <div class="section-title">
          <Users :size="14" />
          <span>出场角色</span>
        </div>
        <div v-if="chapterInfo.characters.length > 0" class="item-list">
          <article v-for="character in chapterInfo.characters" :key="character.name" class="info-item">
            <strong>{{ character.name }}</strong>
            <p>{{ character.description }}</p>
          </article>
        </div>
        <p v-else class="empty-copy">本章还没有识别到角色信息。</p>
      </section>

      <section class="inspector-section">
        <div class="section-title">
          <MapPin :size="14" />
          <span>场景列表</span>
        </div>
        <div v-if="chapterInfo.scenes.length > 0" class="item-list">
          <article v-for="scene in chapterInfo.scenes" :key="scene.name" class="info-item">
            <strong>{{ scene.name }}</strong>
            <p>{{ scene.description }}</p>
          </article>
        </div>
        <p v-else class="empty-copy">本章还没有识别到主要场景。</p>
      </section>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { MapPin, Route, Users } from "lucide-vue-next";
import type { WorkbenchSnapshot } from "@airoaming/shared";
import { getCurrentChapterSourceText, getCurrentChapterTitle } from "../../utils/workbench-chapter";

interface ChapterCharacter {
  name: string;
  description: string;
}

interface ChapterScene {
  name: string;
  description: string;
}

interface ChapterInfo {
  title: string;
  mainline: string;
  characters: ChapterCharacter[];
  scenes: ChapterScene[];
}

const props = defineProps<{
  snapshot: WorkbenchSnapshot;
  sourceText?: string;
}>();

const chapterInfo = computed<ChapterInfo>(() => {
  const sourceText = props.sourceText ?? getCurrentChapterSourceText(props.snapshot);
  const lines = sourceText.split(/\r?\n/);
  const chapterRange = findChapterRange(lines);
  const chapterLines = lines.slice(chapterRange.start, chapterRange.end);

  return {
    title: chapterRange.title || getCurrentChapterTitle(props.snapshot),
    mainline: extractMainline(chapterLines),
    characters: extractCharacters(chapterLines),
    scenes: extractScenes(chapterLines),
  };
});

function findChapterRange(lines: string[]) {
  const firstChapterIndex = lines.findIndex((line) => Boolean(getChapterTitle(line)));
  if (firstChapterIndex < 0) {
    return {
      title: "",
      start: 0,
      end: lines.length,
    };
  }

  const nextChapterOffset = lines
    .slice(firstChapterIndex + 1)
    .findIndex((line) => Boolean(getChapterTitle(line)));

  return {
    title: getChapterTitle(lines[firstChapterIndex]) ?? "",
    start: firstChapterIndex + 1,
    end: nextChapterOffset < 0 ? lines.length : firstChapterIndex + 1 + nextChapterOffset,
  };
}

function getChapterTitle(line: string) {
  const text = line.trim();
  if (!text) {
    return null;
  }

  const markdownHeading = text.match(/^#{1,3}\s+(.+)$/);
  if (markdownHeading) {
    return stripMarkdown(markdownHeading[1]);
  }

  if (/^(序章|楔子|尾声|番外\b.*)$/i.test(text)) {
    return stripMarkdown(text);
  }

  if (/^第[一二三四五六七八九十百千万\d]+[章节幕回场].*/.test(text)) {
    return stripMarkdown(text);
  }

  return null;
}

function extractMainline(lines: string[]) {
  const explicitLine = lines.find((line) => /^\s*(故事主线|主线|本章主线|一句话总结)\s*[：:]/.test(line));
  if (explicitLine) {
    return truncate(stripMarkdown(explicitLine.replace(/^\s*(故事主线|主线|本章主线|一句话总结)\s*[：:]/, "")), 64);
  }

  const paragraph = lines
    .map((line) => stripMarkdown(line))
    .find((line) => {
      if (!line) {
        return false;
      }

      return !/^(出场角色|角色介绍|角色|人物|场景列表|主要场景|场景)\s*[：:]?$/.test(line);
    });

  return paragraph ? truncate(paragraph, 64) : "本章还没有可总结的正文。";
}

function extractCharacters(lines: string[]) {
  const sectionLines = collectSectionLines(lines, /(出场角色|角色介绍|角色|人物)/);
  return sectionLines
    .map(parseNamedItem)
    .filter((item): item is ChapterCharacter => Boolean(item))
    .slice(0, 5);
}

function extractScenes(lines: string[]) {
  const fromSection = collectSectionLines(lines, /(场景列表|主要场景)/)
    .map(parseNamedItem)
    .filter((item): item is ChapterScene => Boolean(item));

  const fromHeadings = lines
    .map((line) => stripMarkdown(line))
    .filter((line) => /^(场景\s*\d*|第[一二三四五六七八九十百千万\d]+场|SCENE\b)/i.test(line))
    .map((line) => {
      const cleaned = line.replace(/^(场景列表|主要场景)\s*[：:]?/, "").trim();
      if (!cleaned) {
        return null;
      }

      const item = splitNameAndDescription(cleaned);
      return {
        name: item.name,
        description: item.description || "待补充场景描述",
      };
    })
    .filter((item): item is ChapterScene => Boolean(item));

  return dedupeByName([...fromSection, ...fromHeadings]).slice(0, 6);
}

function collectSectionLines(lines: string[], sectionPattern: RegExp) {
  const startIndex = lines.findIndex((line) => sectionPattern.test(stripMarkdown(line)));
  if (startIndex < 0) {
    return [];
  }

  const collected: string[] = [];
  for (const line of lines.slice(startIndex + 1)) {
    const cleaned = stripMarkdown(line);
    if (/^(故事主线|主线|出场角色|角色介绍|角色|人物|场景列表|主要场景|场景)\s*[：:]?$/.test(cleaned)) {
      break;
    }
    if (getChapterTitle(line)) {
      break;
    }
    if (cleaned) {
      collected.push(line);
    }
  }

  return collected;
}

function parseNamedItem(line: string) {
  const cleaned = stripMarkdown(line.replace(/^\s*[-*+]\s+/, "").replace(/^\s*\d+\.\s+/, ""));
  if (!cleaned) {
    return null;
  }

  const item = splitNameAndDescription(cleaned);
  return {
    name: item.name,
    description: item.description || "待补充介绍",
  };
}

function splitNameAndDescription(text: string) {
  const separatorIndex = text.search(/[：:，, -]/);
  if (separatorIndex < 0) {
    return {
      name: truncate(text, 18),
      description: "",
    };
  }

  return {
    name: truncate(text.slice(0, separatorIndex).trim(), 18),
    description: truncate(text.slice(separatorIndex + 1).trim(), 48),
  };
}

function stripMarkdown(value: string) {
  return value
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\s*>\s?/, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function dedupeByName<T extends { name: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.name)) {
      return false;
    }
    seen.add(item.name);
    return true;
  });
}
</script>

<style scoped>
.chapter-inspector-panel {
  display: flex;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 14px;
  background: rgba(13, 18, 33, 0.4);
}

.inspector-header {
  display: grid;
  gap: 6px;
  padding: 20px 22px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.inspector-header span {
  color: #8df0dc;
  font-size: 12px;
  font-weight: 800;
}

.inspector-header h3 {
  margin: 0;
  color: #f1f5f9;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.45;
}

.inspector-content {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
  padding: 18px 20px 22px;
}

.inspector-section {
  display: grid;
  gap: 10px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #dbe4f5;
  font-size: 13px;
  font-weight: 700;
}

.section-title svg {
  color: #a78bfa;
}

.section-copy,
.empty-copy,
.info-item p {
  margin: 0;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.65;
}

.section-copy {
  color: #cbd5e1;
}

.item-list {
  display: grid;
  gap: 8px;
}

.info-item {
  display: grid;
  gap: 4px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
  padding: 10px 11px;
}

.info-item strong {
  color: #f1f5f9;
  font-size: 13px;
  font-weight: 700;
}
</style>

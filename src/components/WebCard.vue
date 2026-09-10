<script setup>
function safeHref(url) {
  try {
    const protocol = new URL(url).protocol
    return protocol === 'http:' || protocol === 'https:' ? url : ''
  } catch {
    return ''
  }
}

function linkLabel(url, title) {
  if (title) return title
  try {
    const hostname = new URL(url).hostname
    return hostname === '' ? url : hostname
  } catch {
    return url
  }
}

defineProps({
  card: { type: Object, required: true },
})
</script>

<template>
  <div v-if="card.kind === 'search'" class="block">
    <div v-if="card.answer" class="answer">{{ card.answer }}</div>
    <div v-if="!card.answer && card.sources.length === 0" class="empty">未找到结果</div>
    <ol v-else class="sources">
      <li v-for="(source, index) in card.sources" :key="index" :value="index + 1">
        <a
          v-if="safeHref(source.url)"
          class="link"
          :href="safeHref(source.url)"
          target="_blank"
          rel="noopener noreferrer"
        >{{ linkLabel(source.url, source.title) }}</a>
        <span v-else class="link">{{ linkLabel(source.url, source.title) }}</span>
        <div v-if="source.snippet" class="snippet">{{ source.snippet }}</div>
        <div v-if="source.publishedAt" class="published">{{ source.publishedAt }}</div>
      </li>
    </ol>
    <div v-if="card.truncated" class="truncated">来源列表已截断</div>
  </div>
  <div v-else class="block fetch">
    <a
      v-if="safeHref(card.url)"
      class="link"
      :href="safeHref(card.url)"
      target="_blank"
      rel="noopener noreferrer"
    >{{ card.url }}</a>
    <span v-else class="link">{{ card.url }}</span>
    <div class="meta">
      <span>HTTP {{ card.statusCode }}</span>
      <span v-if="card.truncated" class="truncated">内容已截断</span>
    </div>
  </div>
</template>

<style scoped>
.block {
  margin: 4px 0 4px 4px;
  padding: 12px 14px;
  background: var(--code-bg);
  border-radius: 12px;
}

.answer {
  margin-bottom: 8px;
  font-size: 14px;
  line-height: 22px;
  white-space: pre-wrap;
}

.sources {
  margin: 0;
  padding-left: 2.5em;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 320px;
  overflow-y: auto;
}

.link {
  color: rgb(57, 100, 254);
  font-size: 14px;
  line-height: 20px;
  word-break: break-word;
  text-decoration: none;
}

a.link:hover { text-decoration: underline; }

.snippet {
  margin-top: 2px;
  color: var(--secondary);
  font-size: 13px;
  line-height: 19px;
}

.published,
.truncated,
.meta,
.empty {
  margin-top: 2px;
  color: var(--tertiary);
  font-size: 12px;
}

.fetch .meta { margin-top: 6px; display: flex; gap: 12px; }
</style>

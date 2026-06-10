<script setup lang="ts">
/**
 * LayeredText — Vue port of the 21st.dev "layered-text" effect.
 *
 * The original is a React + GSAP component; this project has neither, so the
 * staggered hover reveal is driven entirely by CSS transitions (no GSAP
 * dependency). Each line stacks a "top" and "bottom" word inside an
 * overflow-clipped, isometrically-skewed row; hovering rolls every row up by
 * exactly one line height to reveal the next word.
 */
import { computed } from 'vue'

interface Line {
  top: string
  bottom: string
}

const props = withDefaults(defineProps<{
  lines?: Line[]
  fontSize?: string
  fontSizeMd?: string
  lineHeight?: number
  lineHeightMd?: number
  baseOffset?: number
  baseOffsetMd?: number
}>(), {
  lines: () => [
    { top: ' ', bottom: 'INFINITE' },
    { top: 'INFINITE', bottom: 'PROGRESS' },
    { top: 'PROGRESS', bottom: 'INNOVATION' },
    { top: 'INNOVATION', bottom: 'FUTURE' },
    { top: 'FUTURE', bottom: 'DREAMS' },
    { top: 'DREAMS', bottom: 'ACHIEVEMENT' },
    { top: 'ACHIEVEMENT', bottom: ' ' },
  ],
  fontSize: '80px',
  fontSizeMd: '36px',
  lineHeight: 60,
  lineHeightMd: 35,
  baseOffset: 35,
  baseOffsetMd: 20,
})

const centerIndex = computed(() => Math.floor(props.lines.length / 2))

const rootStyle = computed(() => ({
  '--lt-font': props.fontSize,
  '--lt-font-md': props.fontSizeMd,
  '--lt-lh': `${props.lineHeight}px`,
  '--lt-lh-md': `${props.lineHeightMd}px`,
  '--lt-shift': `-${props.lineHeight}px`,
  '--lt-shift-md': `-${props.lineHeightMd}px`,
}))

function lineStyle(index: number) {
  const even = index % 2 === 0
  const skew = even ? 'skew(60deg, -30deg) scaleY(0.66667)' : 'skew(0deg, -30deg) scaleY(1.33333)'
  return {
    '--lt-skew': skew,
    '--lt-tx': `${(index - centerIndex.value) * props.baseOffset}px`,
    '--lt-tx-md': `${(index - centerIndex.value) * props.baseOffsetMd}px`,
  }
}
</script>

<template>
  <div class="layered-text" :style="rootStyle">
    <ul class="layered-text__list">
      <li
        v-for="(line, index) in lines"
        :key="index"
        class="layered-text__line"
        :style="lineStyle(index)"
      >
        <div
          class="layered-text__col"
          :style="{ '--lt-delay': `${index * 0.08}s` }"
        >
          <p class="layered-text__word">{{ line.top }}</p>
          <p class="layered-text__word">{{ line.bottom }}</p>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.layered-text {
  margin-inline: auto;
  font-weight: 900;
  letter-spacing: -2px;
  text-transform: uppercase;
  color: inherit;
  cursor: pointer;
  user-select: none;
  -webkit-font-smoothing: antialiased;
  font-size: var(--lt-font);
}

.layered-text__list {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0;
  padding: 0;
  list-style: none;
}

.layered-text__line {
  position: relative;
  overflow: hidden;
  height: var(--lt-lh);
  transform: translateX(var(--lt-tx)) var(--lt-skew);
}

.layered-text__col {
  transition: transform 0.8s cubic-bezier(0.22, 1, 0.36, 1);
  transition-delay: var(--lt-delay, 0s);
  will-change: transform;
}

.layered-text:hover .layered-text__col {
  transform: translateY(var(--lt-shift));
}

.layered-text__word {
  height: var(--lt-lh);
  margin: 0;
  padding-inline: 15px;
  line-height: calc(var(--lt-lh) - 5px);
  white-space: nowrap;
  vertical-align: top;
}

@media (max-width: 767px) {
  .layered-text {
    font-size: var(--lt-font-md);
  }

  .layered-text__line {
    height: var(--lt-lh-md);
    transform: translateX(var(--lt-tx-md)) var(--lt-skew);
  }

  .layered-text__word {
    height: var(--lt-lh-md);
    line-height: calc(var(--lt-lh-md) - 5px);
  }

  .layered-text:hover .layered-text__col {
    transform: translateY(var(--lt-shift-md));
  }
}

@media (prefers-reduced-motion: reduce) {
  .layered-text__col {
    transition: none;
  }
}
</style>

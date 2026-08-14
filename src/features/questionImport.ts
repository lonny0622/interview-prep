export type DifficultyHint = '简单' | '中等' | '困难'

export type QuestionOutline = {
  title: string
  difficulty: DifficultyHint
}

const difficultyFromLevel = (level = '', stars = '') => {
  const value = Number(String(level || '')) || String(stars || '').length || 2
  return value <= 1 ? '简单' : value === 2 ? '中等' : '困难'
}

const stripListPrefix = (line = '') => String(line || '').replace(/^(?:[-*•]|\d+[.)、]|[一二三四五六七八九十百]+、)\s*/, '').trim()

export function parseQuestionOutline(source = '', categoryOverride = ''): { category: string; questions: QuestionOutline[] } {
  const safeSource = String(source || '')
  const safeCategory = String(categoryOverride || '')
  const lines = safeSource.split(/\r?\n/).map((line) => String(line || '').trim()).filter(Boolean)
  let category = safeCategory.trim()
  let difficulty: DifficultyHint = '中等'
  const questions: QuestionOutline[] = []

  for (const original of lines) {
    const line = original.replace(/^#+\s*/, '').trim()
    const levelMatch = line.match(/^(⭐+|★+)\s*(?:Level\s*)?(\d+)?\s*(?:[:：-]\s*(.*))?$/i)
    if (levelMatch) {
      difficulty = difficultyFromLevel(levelMatch[2] || '', levelMatch[1])
      continue
    }
    if (/^(?:Level\s*)\d+/i.test(line)) {
      const levelMatchWithoutStars = line.match(/Level\s*(\d+)/i)
      difficulty = difficultyFromLevel(levelMatchWithoutStars?.[1] || '', '')
      continue
    }
    if (/^(?:---+|分类[:：])/i.test(line)) continue

    const numberedHeading = line.match(/^(?:[一二三四五六七八九十百]+|\d+)[、.)]\s*(.+)$/)
    if (numberedHeading && !/[？?]/.test(numberedHeading[2])) {
      if (!category) category = numberedHeading[2].trim()
      continue
    }
    if (/^#/.test(original) && !/[？?]/.test(line)) {
      if (!category) category = line
      continue
    }

    const title = stripListPrefix(line)
    if (!title || title.length < 4 || /^(?:基础概念|基础|进阶|高级|目录)$/i.test(title)) continue
    questions.push({ title, difficulty })
  }

  return { category: category || '未分类', questions }
}

import type { Mastery, Question } from '../../types/question'
import type { LearningStats, MasteryCounts } from '../../types/study'

export function createMasteryCounts(): MasteryCounts {
  return { '未学习': 0, 了解: 0, 熟悉: 0, 掌握: 0 }
}

export function calculateLearningStats(questions: Question[]): LearningStats {
  const mastery = createMasteryCounts()
  const categoryMap = new Map<string, { name: string; total: number; mastery: Record<Mastery, number> }>()

  for (const question of questions) {
    mastery[question.mastery] += 1
    if (!categoryMap.has(question.category)) {
      categoryMap.set(question.category, {
        name: question.category,
        total: 0,
        mastery: createMasteryCounts(),
      })
    }

    const category = categoryMap.get(question.category)
    if (!category) continue
    category.total += 1
    category.mastery[question.mastery] += 1
  }

  return {
    todayLearned: 0,
    totalQuestions: questions.length,
    mastery,
    categories: [...categoryMap.values()],
  }
}

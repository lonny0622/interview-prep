import type { Difficulty, Mastery, Question, QuestionDraft } from '../types/question'
import type { LearningFilters } from '../types/study'

export const QUESTION_STORAGE_KEY = 'interview-prep.questions.v1'
export const QUESTION_IMPORT_STORAGE_KEY = 'interview-prep.question-import.v1'
export const QUESTION_VIEW_STORAGE_KEY = 'interview-prep.question-view.v1'

export const MASTERY_ORDER: Mastery[] = ['未学习', '了解', '熟悉', '掌握']
export const DIFFICULTY_ORDER: Difficulty[] = ['简单', '中等', '困难']

export const EMPTY_LEARNING_FILTERS: LearningFilters = {
  category: '全部分类',
  difficulty: '全部难度',
  mastery: '未学习',
}

export const EMPTY_QUESTION_DRAFT: QuestionDraft = {
  title: '',
  category: '',
  difficulty: '中等',
  importance: 3,
  answer: '',
  explanation: '',
  interviewAnswer: '',
  followUps: [],
}

export const SEED_QUESTIONS: Question[] = [
  {
    id: 'q-1',
    title: 'React 中为什么需要 key？key 变化时会发生什么？',
    category: 'React',
    difficulty: '中等',
    importance: 5,
    mastery: '熟悉',
    answer: 'key 用来标识列表中的稳定身份，帮助 React 在协调阶段复用正确的 Fiber。',
    explanation: 'key 参与 Diff。稳定且唯一的 key 可以让节点在位置变化时保持状态；使用 index 作为 key，在插入、删除或排序时可能造成状态错位。',
    interviewAnswer: '我会先说明 key 是列表项的身份标识，再结合列表插入和组件状态错位的例子解释为什么不建议随意使用 index。',
    followUps: ['什么时候 index 可以作为 key？', 'key 变化为什么会导致组件重新挂载？'],
  },
  {
    id: 'q-2',
    title: '如何定位前端页面的性能瓶颈？',
    category: '性能优化',
    difficulty: '困难',
    importance: 5,
    mastery: '了解',
    answer: '先定义指标和用户感知，再通过 Performance、Network 和 React Profiler 分层定位。',
    explanation: '不要一开始就改代码。先区分加载、运行时和交互响应问题，建立基线后再验证资源体积、长任务、渲染次数和接口瀑布等假设。',
    interviewAnswer: '我会按指标、采样、假设、验证四步讲，并给出一个真实项目中从长任务定位到组件拆分的例子。',
    followUps: ['LCP 和 INP 分别反映什么？', '如何避免优化后引入新的问题？'],
  },
  {
    id: 'q-3',
    title: '项目中遇到过最棘手的线上问题是什么？',
    category: '项目题',
    difficulty: '中等',
    importance: 4,
    mastery: '未学习',
    answer: '用 STAR 结构回答：背景、任务、行动、结果，并明确个人贡献。',
    explanation: '重点不在于把事故讲得多严重，而在于说明你如何定位问题、如何做取舍，以及最后有没有留下监控或流程改进。',
    interviewAnswer: '我会控制在两分钟内，先交代影响范围，再讲定位过程和关键决策，最后量化结果和后续改进。',
    followUps: ['如果重新做一次，你会改变什么？'],
  },
]

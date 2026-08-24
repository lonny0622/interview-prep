import { useState } from 'react'
import './App.css'
import { SelectionExplainDialog } from './components/ai/SelectionExplainDialog'
import { AppSidebar } from './components/layout/AppSidebar'
import { ProfileCenter } from './components/profile/ProfileCenter'
import { CategoryManagerModal } from './components/questions/CategoryManagerModal'
import { QuestionEditorModal } from './components/questions/QuestionEditorModal'
import { QuestionImportModal } from './components/questions/QuestionImportModal'
import { QuestionRegenerateModal } from './components/questions/QuestionRegenerateModal'
import { useInterviewSession } from './features/interview/useInterviewSession'
import { usePracticeSession } from './features/practice/usePracticeSession'
import { useProfileData } from './features/profile/useProfileData'
import { useQuestionLibrary } from './features/questions/useQuestionLibrary'
import { useLearningSession } from './features/study/useLearningSession'
import { useSelectionExplain } from './features/ai/useSelectionExplain'
import { InterviewPage } from './pages/interview/InterviewPage'
import { LearningPage } from './pages/learning/LearningPage'
import { LibraryPage } from './pages/library/LibraryPage'
import { PracticePage } from './pages/practice/PracticePage'
import type { AppPage } from './types/app'

function App() {
  const [activePage, setActivePage] = useState<AppPage>('library')
  const library = useQuestionLibrary()
  const profile = useProfileData()
  const learning = useLearningSession({
    activePage,
    questions: library.questions,
    setQuestions: library.setQuestions,
    serverReady: library.serverReady,
    setServerReady: library.setServerReady,
  })
  const practice = usePracticeSession(library.questions)
  const interview = useInterviewSession()
  const selectionExplain = useSelectionExplain()

  const renderPage = () => {
    if (activePage === 'library') return <LibraryPage
      questions={library.questions}
      filteredQuestions={library.filteredQuestions}
      selected={library.selected}
      selectedId={library.selectedId}
      categories={library.categories}
      query={library.query}
      category={library.category}
      difficulty={library.difficulty}
      mastery={library.mastery}
      showAnswer={library.showAnswer}
      onQueryChange={library.setQuery}
      onCategoryChange={library.setCategory}
      onDifficultyChange={library.setDifficulty}
      onMasteryFilterChange={library.setMastery}
      onSelectQuestion={(id) => { library.setSelectedId(id); library.setShowAnswer(false) }}
      onShowAnswerChange={library.setShowAnswer}
      onUpdateMastery={(mastery) => { if (library.selected) library.updateMastery(library.selected.id, mastery) }}
      onCreateQuestion={() => library.openEditor()}
      onEditQuestion={library.openEditor}
      onDeleteQuestion={library.deleteQuestion}
      onRegenerateQuestion={library.regenerateSingleQuestion}
      onQuestionContextMenu={selectionExplain.openFromContextMenu}
      onManageCategories={() => library.setCategoryManagerOpen(true)}
      onImportQuestions={() => library.setImporter({ step: 'input', source: '', category: '', drafts: [], error: '', processing: false })}
      onStartPractice={() => setActivePage('practice')}
    />

    if (activePage === 'learning') return <LearningPage
      questions={learning.questions}
      index={learning.index}
      revealAnswer={learning.revealAnswer}
      stats={learning.stats}
      filters={learning.filters}
      categories={library.categories}
      onFiltersChange={learning.changeFilters}
      onRevealAnswer={learning.reveal}
      onPrevious={learning.previous}
      onNext={() => learning.index < learning.questions.length - 1 ? learning.next() : setActivePage('library')}
      onMarkMastery={(mastery) => void learning.markMastery(mastery)}
      onQuestionContextMenu={selectionExplain.openFromContextMenu}
    />

    if (activePage === 'practice') return <PracticePage
      questions={library.questions}
      practice={practice.practice}
      voice={practice.voice}
      onStart={(filters) => void practice.start(filters)}
      onAnswerChange={practice.setAnswer}
      onStartRecording={() => void practice.startRecording()}
      onStopRecording={practice.stopRecording}
      onResetRecording={practice.resetRecording}
      onSubmit={() => void practice.submit()}
      onExit={practice.exit}
      onNext={practice.next}
    />

    return <InterviewPage
      jobs={profile.jobs}
      setup={interview.setup}
      interview={interview.interview}
      voice={interview.voice}
      onSetupChange={interview.setSetup}
      onStart={() => void interview.start()}
      onOpenProfile={() => profile.setOpen(true)}
      onAnswerChange={interview.setAnswer}
      onToggleRecording={interview.toggleRecording}
      onSubmitTurn={() => void interview.submitTurn()}
      onComplete={() => void interview.complete()}
      onExit={interview.exit}
    />
  }

  return <div className="app-shell">
    <AppSidebar
      activePage={activePage}
      learningTodoCount={library.questions.filter((question) => question.mastery !== '掌握').length}
      serverReady={library.serverReady}
      aiHistoryCount={selectionExplain.sessions.length}
      aiHistoryOpen={selectionExplain.open && selectionExplain.historyOpen}
      onNavigate={setActivePage}
      onOpenAiHistory={selectionExplain.openHistory}
      onOpenProfile={() => profile.setOpen(true)}
    />
    <main className="main-content">{renderPage()}</main>
    {profile.open && <ProfileCenter profile={profile.profile} jobs={profile.jobs} onProfileChange={profile.setProfile} onJobsChange={profile.setJobs} onClose={() => profile.setOpen(false)} />}
    {library.categoryManagerOpen && <CategoryManagerModal categories={library.categoryCatalog} onClose={() => library.setCategoryManagerOpen(false)} onCreate={async (name) => { await library.createCategory(name) }} onRename={library.renameCategory} onDelete={library.deleteCategory} onMoveQuestions={library.moveCategoryQuestions} onRegenerate={library.regenerateCategory} />}
    {library.editor && <QuestionEditorModal editor={library.editor} onChange={library.setEditor} onClose={() => library.setEditor(null)} onSave={library.saveQuestion} />}
    {library.importer && <QuestionImportModal state={library.importer} categories={library.categories.filter((item) => item !== '全部分类')} onChange={library.setImporter} onClose={library.closeImporter} onCreateCategory={library.createCategory} onLocalParse={library.importPreview} onGenerate={() => void library.importWithAi()} onConfirm={library.confirmImport} />}
    {library.regenerator && <QuestionRegenerateModal state={library.regenerator} onChange={library.setRegenerator} onClose={library.closeRegenerator} onContinue={library.continueRegeneration} onConfirm={() => void library.confirmRegeneration()} />}
    {selectionExplain.open && <SelectionExplainDialog state={selectionExplain.dialog} sessions={selectionExplain.sessions} historyOpen={selectionExplain.historyOpen} onInputChange={selectionExplain.setInput} onAsk={() => void selectionExplain.ask()} onToggleHistory={selectionExplain.toggleHistory} onSelectSession={selectionExplain.selectSession} onDeleteSession={selectionExplain.deleteSession} onClose={selectionExplain.close} />}
  </div>
}

export default App

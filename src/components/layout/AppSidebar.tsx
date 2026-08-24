import { BookOpen, BrainCircuit, ChevronDown, CircleDot, MessageSquareText, Mic2, PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { llmConfig, llmStatus } from '../../config/llm'
import type { AppPage } from '../../types/app'

type NavItem = {
  id: AppPage
  label: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { id: 'library', label: '题库', icon: BookOpen },
  { id: 'learning', label: '学习', icon: BrainCircuit },
  { id: 'practice', label: '刷题', icon: CircleDot },
  { id: 'interview', label: '模拟面试', icon: Mic2 },
]

type Props = {
  activePage: AppPage
  learningTodoCount: number
  serverReady: boolean
  aiHistoryCount: number
  aiHistoryOpen: boolean
  collapsed: boolean
  onNavigate: (page: AppPage) => void
  onToggleCollapsed: () => void
  onOpenAiHistory: () => void
  onOpenProfile: () => void
}

export function AppSidebar({ activePage, learningTodoCount, serverReady, aiHistoryCount, aiHistoryOpen, collapsed, onNavigate, onToggleCollapsed, onOpenAiHistory, onOpenProfile }: Props) {
  const handleProfileKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onOpenProfile()
  }

  return <aside className={`sidebar${collapsed ? ' is-collapsed' : ''}`}>
    <div className="brand"><span className="brand-mark">IP</span><span className="brand-name">InterviewPrep</span><button className="sidebar-toggle icon-button" type="button" title={collapsed ? '展开侧边栏' : '收起侧边栏'} aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'} onClick={onToggleCollapsed}>{collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button></div>
    <div className="profile" role="button" tabIndex={0} onClick={onOpenProfile} onKeyDown={handleProfileKeyDown}>
      <div className="avatar">穆</div>
      <div className="profile-copy"><strong>穆兰</strong><span>准备中 · 前端 / AI</span></div>
      <span className="profile-chevron" aria-hidden="true"><ChevronDown size={14} /></span>
    </div>
    <nav>
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        return <button key={item.id} className={activePage === item.id ? 'active' : ''} type="button" title={collapsed ? item.label : undefined} aria-label={item.label} onClick={() => onNavigate(item.id)}>
          <Icon className="nav-icon" size={17} aria-hidden="true" />
          <span className="nav-label">{item.label}</span>
          {item.id === 'learning' && learningTodoCount > 0 && <span className="nav-badge">{learningTodoCount}</span>}
        </button>
      })}
      <button className={aiHistoryOpen ? 'active' : ''} type="button" title={collapsed ? 'AI 对话' : undefined} aria-label="AI 对话" onClick={onOpenAiHistory}>
        <MessageSquareText className="nav-icon" size={17} aria-hidden="true" />
        <span className="nav-label">AI 对话</span>
        {aiHistoryCount > 0 && <span className="nav-badge">{aiHistoryCount}</span>}
      </button>
    </nav>
    <div className="sidebar-bottom">
      <button type="button" title={collapsed ? '设置' : undefined} aria-label="设置" onClick={onOpenProfile}><Settings size={15} /><span className="settings-label">设置</span></button>
      <div className="sync-status" title={serverReady ? 'SQLite 已连接' : '服务暂不可用（只读缓存）'}><span /><span className="sync-status-text">{serverReady ? 'SQLite 已连接' : '服务暂不可用（只读缓存）'}</span></div>
      <div className="sync-status" title={llmStatus ? `LLM endpoint 已配置 · ${llmConfig.model}` : 'LLM 待配置'}><span /><span className="sync-status-text">{llmStatus ? `LLM endpoint 已配置 · ${llmConfig.model}` : 'LLM 待配置'}</span></div>
    </div>
  </aside>
}

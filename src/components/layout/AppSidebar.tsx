import { BookOpen, BrainCircuit, ChevronDown, CircleDot, Mic2, Settings } from 'lucide-react'
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
  onNavigate: (page: AppPage) => void
  onOpenProfile: () => void
}

export function AppSidebar({ activePage, learningTodoCount, serverReady, onNavigate, onOpenProfile }: Props) {
  const handleProfileKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onOpenProfile()
  }

  return <aside className="sidebar">
    <div className="brand"><span className="brand-mark">IP</span><span>InterviewPrep</span></div>
    <div className="profile" role="button" tabIndex={0} onClick={onOpenProfile} onKeyDown={handleProfileKeyDown}>
      <div className="avatar">穆</div>
      <div><strong>穆兰</strong><span>准备中 · 前端 / AI</span></div>
      <span className="profile-chevron" aria-hidden="true"><ChevronDown size={14} /></span>
    </div>
    <nav>
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        return <button key={item.id} className={activePage === item.id ? 'active' : ''} type="button" onClick={() => onNavigate(item.id)}>
          <Icon className="nav-icon" size={17} aria-hidden="true" />
          {item.label}
          {item.id === 'learning' && learningTodoCount > 0 && <span className="nav-badge">{learningTodoCount}</span>}
        </button>
      })}
    </nav>
    <div className="sidebar-bottom">
      <button type="button" onClick={onOpenProfile}><Settings size={15} />设置</button>
      <div className="sync-status"><span />{serverReady ? 'SQLite 已连接' : '本地数据模式'}</div>
      <div className="sync-status"><span />{llmStatus ? `LLM endpoint 已配置 · ${llmConfig.model}` : 'LLM 待配置'}</div>
    </div>
  </aside>
}

import { ArrowRight, X } from 'lucide-react'
import type { ResumeProfile } from '../../types/profile'

type Props = { resumes: ResumeProfile[]; onSelect: (resume: ResumeProfile) => void; onClose: () => void }

export function ProfileResumePicker({ resumes, onSelect, onClose }: Props) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="editor-modal resume-picker-modal" role="dialog" aria-modal="true" aria-labelledby="resume-picker-title"><div className="modal-header"><div><p className="eyebrow">Interview profile</p><h2 id="resume-picker-title">选择岗位与简历</h2></div><button className="icon-button" type="button" title="关闭" onClick={onClose}><X size={18} /></button></div><div className="resume-picker-list">{resumes.map((resume) => <button key={resume.id} type="button" className="resume-picker-item" onClick={() => onSelect(resume)}><strong>{resume.role}</strong><span>{resume.fileName || '未命名简历'}</span><ArrowRight size={14} /></button>)}</div></section></div>
}

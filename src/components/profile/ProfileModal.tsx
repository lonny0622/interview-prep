import { Check, Plus, Trash2, Upload, X } from 'lucide-react'
import type { ResumeProfile, UserProfile } from '../../types/profile'

type Props = {
  profile: UserProfile
  draft: UserProfile
  roleInput: string
  resumeRole: string
  resumeUpload: { loading: boolean; error: string }
  saving: boolean
  onRoleInputChange: (value: string) => void
  onResumeRoleChange: (value: string) => void
  onDraftChange: (draft: UserProfile) => void
  onAddRole: () => void
  onRemoveRole: (role: string) => void
  onResumeFile: (file: File, role: string) => void
  onDeleteResume: (id: string) => void
  onSave: () => void
  onClose: () => void
}

export function ProfileModal({ draft, roleInput, resumeRole, resumeUpload, saving, onRoleInputChange, onResumeRoleChange, onDraftChange, onAddRole, onRemoveRole, onResumeFile, onDeleteResume, onSave, onClose }: Props) {
  const roles = draft.targetRoles.length ? draft.targetRoles : ['通用']
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="editor-modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title"><div className="modal-header"><div><p className="eyebrow">Personal profile</p><h2 id="profile-title">个人中心</h2></div><button className="icon-button" type="button" title="关闭" onClick={onClose}><X size={18} /></button></div><div className="profile-form"><label><span>姓名</span><input value={draft.name} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} placeholder="例如：穆兰" /></label><label><span>工作年限</span><input type="number" min="0" max="50" step="0.5" value={draft.yearsExperience} onChange={(event) => onDraftChange({ ...draft, yearsExperience: Number(event.target.value) })} /></label><label className="full-field"><span>个人定位</span><input value={draft.headline} onChange={(event) => onDraftChange({ ...draft, headline: event.target.value })} placeholder="例如：前端 / AI 应用工程师" /></label><section className="profile-section full-field"><div className="profile-section-heading"><div><span>意向岗位</span><small>先添加岗位，再为每个岗位上传对应简历</small></div></div><div className="role-chips">{draft.targetRoles.map((role) => <button key={role} type="button" onClick={() => onRemoveRole(role)}>{role}<X size={12} /></button>)}</div><div className="role-input"><input value={roleInput} onChange={(event) => onRoleInputChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onAddRole() } }} placeholder="输入岗位后按 Enter 添加" /><button className="secondary-button" type="button" onClick={onAddRole}><Plus size={13} />添加岗位</button></div></section><section className="profile-section full-field"><div className="profile-section-heading"><div><span>岗位简历档案</span><small>选择岗位后上传或替换简历，每个岗位独立保存</small></div></div><div className="resume-binding"><label><span>绑定岗位</span><select value={resumeRole} onChange={(event) => onResumeRoleChange(event.target.value)}>{roles.map((role) => <option key={role} value={role}>{role}</option>)}</select></label><label className="resume-upload-control"><span>上传简历</span><input className="resume-file-input" type="file" accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword" onChange={(event) => { const file = event.target.files?.[0]; if (file) onResumeFile(file, resumeRole) }} /><small><Upload size={13} />选择 PDF 或 DOCX</small></label></div>{resumeUpload.loading && <small className="upload-status">正在解析简历…</small>}{resumeUpload.error && <small className="upload-status error">{resumeUpload.error}</small>}<div className="resume-profile-list">{draft.resumes.map((resume: ResumeProfile) => <div className="resume-profile-row" key={resume.id}><div><strong>{resume.role}</strong><span>{resume.fileName || '未命名简历'}</span></div><button className="icon-button danger-icon" type="button" title="删除简历档案" onClick={() => onDeleteResume(resume.id)}><Trash2 size={14} /></button></div>)}</div>{!draft.resumes.length && <p className="profile-empty">还没有岗位简历档案，请先选择岗位并上传。</p>}</section><label className="full-field"><span>当前简历文本</span><textarea rows={6} value={draft.resumeText} onChange={(event) => onDraftChange({ ...draft, resumeText: event.target.value })} placeholder="可粘贴或修改当前简历文本" /></label></div><div className="modal-actions"><button className="quiet-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="button" disabled={saving || resumeUpload.loading} onClick={onSave}>{saving ? '保存中…' : '保存个人资料'} <Check size={13} /></button></div></section></div>
}

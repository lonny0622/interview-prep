import { Check, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
import { useState } from 'react'
import { profileApi } from '../../api/profileApi'
import type { JobProfile, ResumeProfile, UserProfile } from '../../types/profile'

type Props = {
  profile: UserProfile
  jobs: JobProfile[]
  onProfileChange: (profile: UserProfile) => void
  onJobsChange: (jobs: JobProfile[]) => void
  onClose: () => void
}

type DeleteTarget = { kind: 'job'; job: JobProfile } | { kind: 'resume'; job: JobProfile; resume: ResumeProfile } | null

async function extractResume(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  const response = await fetch('/api/resume/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, mimeType: file.type, fileBase64: btoa(binary) }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || '简历解析失败。')
  return String(payload.text || '')
}

function ConfirmDialog({ target, busy, onCancel, onConfirm }: { target: Exclude<DeleteTarget, null>; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const isJob = target.kind === 'job'
  const name = isJob ? target.job.title : target.resume.fileName
  return <div className="confirm-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
    <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
      <h3 id="confirm-dialog-title">确认删除{isJob ? '岗位' : '简历'}？</h3>
      <p>将删除“{name}”{isJob ? '及其关联的全部简历' : ''}，此操作无法撤销。</p>
      <div className="confirm-dialog-actions"><button className="quiet-button" type="button" onClick={onCancel} disabled={busy}>取消</button><button className="danger-button" type="button" onClick={onConfirm} disabled={busy}>{busy ? '删除中…' : '确认删除'}</button></div>
    </section>
  </div>
}

function BasicProfileForm({ profile, onProfileChange, onError }: { profile: UserProfile; onProfileChange: (profile: UserProfile) => void; onError: (message: string) => void }) {
  const [basic, setBasic] = useState({ name: profile.name, headline: profile.headline, yearsExperience: profile.yearsExperience })
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true); onError('')
    try { const result = await profileApi.update({ ...profile, ...basic }); onProfileChange(result.profile) } catch (cause) { onError(cause instanceof Error ? cause.message : '个人信息保存失败。') } finally { setSaving(false) }
  }
  return <section className="profile-block"><div className="profile-block-heading"><div><h3>基本信息</h3><span>用于生成自我介绍和岗位匹配建议</span></div><button className="primary-button" type="button" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存基本信息'} <Check size={13} /></button></div><div className="basic-profile-grid"><label><span>姓名</span><input value={basic.name} onChange={(event) => setBasic({ ...basic, name: event.target.value })} /></label><label><span>工作年限</span><input type="number" min="0" max="50" step="0.5" value={basic.yearsExperience} onChange={(event) => setBasic({ ...basic, yearsExperience: Number(event.target.value) })} /></label><label className="full-field"><span>个人定位</span><input value={basic.headline} onChange={(event) => setBasic({ ...basic, headline: event.target.value })} placeholder="例如：擅长跨端架构与性能优化的前端工程师" /></label></div></section>
}

function JobProfileCard({ job, busy, onRename, onDelete, onSetDefault, onUpload, onDeleteResume, onSetDefaultResume }: { job: JobProfile; busy: string; onRename: (job: JobProfile, title: string) => void; onDelete: (job: JobProfile) => void; onSetDefault: (job: JobProfile) => void; onUpload: (job: JobProfile, file: File) => void; onDeleteResume: (job: JobProfile, resume: ResumeProfile) => void; onSetDefaultResume: (job: JobProfile, resume: ResumeProfile) => void }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(job.title)
  return <article className="job-profile-card"><div className="job-card-header">{editing ? <input value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { onRename(job, title); setEditing(false) } }} autoFocus /> : <div><h4>{job.title}</h4>{job.isDefault ? <span className="default-mark">默认岗位</span> : <button className="text-button" type="button" disabled={busy === `default-job:${job.id}`} onClick={() => onSetDefault(job)}>设为默认岗位</button>}</div>}<div className="job-card-actions">{editing ? <button className="icon-button" type="button" title="保存岗位名称" onClick={() => { onRename(job, title); setEditing(false) }}><Check size={14} /></button> : <button className="icon-button" type="button" title="编辑岗位名称" onClick={() => { setTitle(job.title); setEditing(true) }}><Pencil size={14} /></button>}<button className="icon-button danger-icon" type="button" title="删除岗位" onClick={() => onDelete(job)}><Trash2 size={14} /></button></div></div><div className="job-resume-list">{job.resumes.map((resume) => <div className="job-resume-row" key={resume.id}><div><strong>{resume.fileName || '未命名简历'}</strong><span>{resume.isDefault ? '该岗位默认简历' : '可用于模拟面试'}</span></div><div className="job-resume-actions">{!resume.isDefault && <button className="text-button" type="button" disabled={busy === `default-resume:${resume.id}`} onClick={() => onSetDefaultResume(job, resume)}>设为默认</button>}<button className="icon-button danger-icon" type="button" title="删除简历" disabled={busy === `delete-resume:${resume.id}`} onClick={() => onDeleteResume(job, resume)}><Trash2 size={14} /></button></div></div>)}{!job.resumes.length && <p className="profile-empty">此岗位还没有简历。</p>}</div><label className="job-upload"><input type="file" accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) onUpload(job, file) }} /><Upload size={14} />{busy === `upload:${job.id}` ? '正在解析…' : '上传该岗位简历'}</label></article>
}

export function ProfileCenter({ profile, jobs, onProfileChange, onJobsChange, onClose }: Props) {
  const [roleInput, setRoleInput] = useState('')
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null)
  const refreshJobs = async () => { const result = await profileApi.listJobs(); onJobsChange(result.jobs) }
  const addJob = async () => { const title = roleInput.trim(); if (!title) return; setSaving('job'); setError(''); try { const result = await profileApi.createJob(title); onJobsChange([...jobs, result.job]); setRoleInput('') } catch (cause) { setError(cause instanceof Error ? cause.message : '岗位创建失败。') } finally { setSaving('') } }
  const renameJob = async (job: JobProfile, title: string) => { if (!title.trim() || title.trim() === job.title) return; setSaving(`rename:${job.id}`); setError(''); try { const result = await profileApi.updateJob(job.id, { title: title.trim() }); onJobsChange(jobs.map((item) => item.id === job.id ? result.job : item)) } catch (cause) { setError(cause instanceof Error ? cause.message : '岗位更新失败。') } finally { setSaving('') } }
  const setDefaultJob = async (job: JobProfile) => { setSaving(`default-job:${job.id}`); setError(''); try { await profileApi.updateJob(job.id, { isDefault: true }); onJobsChange(jobs.map((item) => ({ ...item, isDefault: item.id === job.id }))) } catch (cause) { setError(cause instanceof Error ? cause.message : '默认岗位设置失败。') } finally { setSaving('') } }
  const upload = async (job: JobProfile, file: File) => { setSaving(`upload:${job.id}`); setError(''); try { const text = await extractResume(file); const result = await profileApi.createResume(job.id, { fileName: file.name, text }); onJobsChange(jobs.map((item) => item.id === job.id ? { ...item, resumes: [...item.resumes, { ...result.resume, role: item.title }] } : item)) } catch (cause) { setError(cause instanceof Error ? cause.message : '简历上传失败。') } finally { setSaving('') } }
  const setDefaultResume = async (job: JobProfile, resume: ResumeProfile) => { setSaving(`default-resume:${resume.id}`); setError(''); try { await profileApi.updateResume(resume.id, { isDefault: true }); onJobsChange(jobs.map((item) => item.id === job.id ? { ...item, resumes: item.resumes.map((itemResume) => ({ ...itemResume, isDefault: itemResume.id === resume.id })) } : item)) } catch (cause) { setError(cause instanceof Error ? cause.message : '默认简历设置失败。') } finally { setSaving('') } }
  const confirmDelete = async () => { if (!deleteTarget) return; const target = deleteTarget; setSaving(target.kind === 'job' ? `delete-job:${target.job.id}` : `delete-resume:${target.resume.id}`); setError(''); try { if (target.kind === 'job') await profileApi.deleteJob(target.job.id); else await profileApi.deleteResume(target.resume.id); await refreshJobs(); setDeleteTarget(null) } catch (cause) { setError(cause instanceof Error ? cause.message : '删除失败。') } finally { setSaving('') } }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="profile-center" role="dialog" aria-modal="true" aria-labelledby="profile-center-title"><header className="profile-center-header"><div><p className="eyebrow">Personal profile</p><h2 id="profile-center-title">个人中心</h2><p>基本信息、岗位和简历档案分别管理，模拟面试时按岗位选择。</p></div><button className="icon-button" type="button" title="关闭" onClick={onClose}><X size={18} /></button></header><div className="profile-center-body"><BasicProfileForm profile={profile} onProfileChange={onProfileChange} onError={setError} /><section className="profile-block"><div className="profile-block-heading"><div><h3>岗位与简历</h3><span>岗位之间相互独立；每个岗位可以保存多份简历，并单独设置默认项。</span></div></div><div className="job-add-row"><input value={roleInput} onChange={(event) => setRoleInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void addJob() } }} placeholder="例如：高级前端工程师" /><button className="secondary-button" type="button" disabled={saving === 'job'} onClick={() => void addJob()}><Plus size={13} />添加岗位</button></div><div className="job-card-list">{jobs.map((job) => <JobProfileCard key={job.id} job={job} busy={saving} onRename={(item, title) => void renameJob(item, title)} onDelete={(item) => setDeleteTarget({ kind: 'job', job: item })} onSetDefault={(item) => void setDefaultJob(item)} onUpload={(item, file) => void upload(item, file)} onDeleteResume={(item, resume) => setDeleteTarget({ kind: 'resume', job: item, resume })} onSetDefaultResume={(item, resume) => void setDefaultResume(item, resume)} />)}</div>{!jobs.length && <p className="profile-empty">还没有岗位，请先添加岗位再上传简历。</p>}</section>{error && <p className="form-error profile-error">{error}</p>}</div><footer className="profile-center-footer"><button className="quiet-button" type="button" onClick={onClose}>关闭</button></footer></section>{deleteTarget && <ConfirmDialog target={deleteTarget} busy={Boolean(saving)} onCancel={() => setDeleteTarget(null)} onConfirm={() => void confirmDelete()} />}</div>
}

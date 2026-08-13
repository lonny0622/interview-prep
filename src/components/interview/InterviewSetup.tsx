import { ArrowRight, Sparkles } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import type { InterviewSetup as InterviewSetupState } from '../../types/interview'
import type { JobProfile } from '../../types/profile'

type Props = {
  jobs: JobProfile[]
  setup: InterviewSetupState
  setSetup: Dispatch<SetStateAction<InterviewSetupState>>
  onStart: () => void
  onOpenProfile: () => void
}

export function InterviewSetup({ jobs, setup, setSetup, onStart, onOpenProfile }: Props) {
  const selectedJob = jobs.find((job) => job.id === setup.jobProfileId)
  const selectedResume = selectedJob?.resumes.find((resume) => resume.id === setup.resumeId)
  const updateSetup = (patch: Partial<InterviewSetupState>) => setSetup((current) => ({ ...current, ...patch }))
  const selectJob = (jobProfileId: string) => {
    const job = jobs.find((item) => item.id === jobProfileId)
    const resume = job?.resumes.find((item) => item.isDefault) || job?.resumes[0]
    updateSetup({ jobProfileId: job?.id || '', role: job?.title || '', resumeId: resume?.id || '', resume: resume?.text || '' })
  }
  const selectResume = (resumeId: string) => {
    const resume = selectedJob?.resumes.find((item) => item.id === resumeId)
    updateSetup({ resumeId: resume?.id || '', resume: resume?.text || '' })
  }
  const hasSelectedJobWithoutResume = Boolean(selectedJob && !selectedJob.resumes.length)
  const canStart = (setup.role.trim() || setup.jd.trim()) && (!setup.jobProfileId || Boolean(setup.resumeId))

  return <div className="interview-setup"><p className="eyebrow">Interview workspace / 04</p><h1>模拟面试</h1><p className="page-description">先选择岗位和该岗位的简历，再补充 JD，生成一场覆盖项目题、八股、场景题和反问的完整面试。</p>
    <section className="interview-profile-selection"><div className="interview-profile-selection-heading"><div><span className="section-label">岗位简历档案</span><small>岗位和简历是绑定关系，只显示当前岗位的简历。</small></div><button className="text-button" type="button" onClick={onOpenProfile}>管理岗位与简历</button></div>
      <div className="interview-profile-selects"><label><span>岗位</span><select value={setup.jobProfileId} onChange={(event) => selectJob(event.target.value)}><option value="">不使用岗位档案</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.title}{job.isDefault ? '（默认）' : ''}</option>)}</select></label><label><span>简历</span><select value={setup.resumeId} disabled={!selectedJob || !selectedJob.resumes.length} onChange={(event) => selectResume(event.target.value)}><option value="">{selectedJob ? (selectedJob.resumes.length ? '选择简历' : '该岗位暂无简历') : '先选择岗位'}</option>{selectedJob?.resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.fileName}{resume.isDefault ? '（默认）' : ''}</option>)}</select></label></div>
      {hasSelectedJobWithoutResume && <p className="profile-empty">该岗位还没有简历，请先在个人中心上传，或选择“不使用岗位档案”后手动填写简历。</p>}
      {selectedResume && <p className="selected-resume-hint">已载入：{selectedResume.fileName} · {selectedResume.text.length.toLocaleString()} 字</p>}
    </section>
    <div className="interview-form"><label><span>目标岗位（可手动修改）</span><input value={setup.role} onChange={(event) => updateSetup({ role: event.target.value })} placeholder="例如：高级前端工程师" /></label><label><span>公司（可选）</span><input value={setup.company} onChange={(event) => updateSetup({ company: event.target.value })} placeholder="例如：某互联网公司" /></label><label className="full-field"><span>岗位 JD</span><textarea rows={6} value={setup.jd} onChange={(event) => updateSetup({ jd: event.target.value })} placeholder="粘贴岗位职责和任职要求" /></label><label className="full-field"><span>所选简历与项目素材</span><textarea rows={8} value={setup.resume} onChange={(event) => updateSetup({ resume: event.target.value })} placeholder="选择岗位简历后自动填充，也可以手动补充项目素材" /></label><label><span>面试时长</span><select value={setup.duration} onChange={(event) => updateSetup({ duration: event.target.value })}><option>15 分钟</option><option>30 分钟</option><option>45 分钟</option></select></label><label><span>难度</span><select value={setup.difficulty} onChange={(event) => updateSetup({ difficulty: event.target.value })}><option>简单</option><option>中等</option><option>困难</option></select></label></div>
    <button className="primary-button" type="button" disabled={!canStart} onClick={onStart}>生成面试并开始 <Sparkles size={13} /><ArrowRight size={13} /></button>
  </div>
}

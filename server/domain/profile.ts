export type CandidateExperience = {
  company: string
  title: string
  period: string
  responsibilities: string[]
}

export type CandidateProject = {
  name: string
  background: string
  responsibilities: string[]
  techStack: string[]
  challenges: string[]
  solutions: string[]
  results: string[]
  risks: string[]
}

export type StructuredProfile = {
  candidate: {
    name: string
    headline: string
    yearsExperience: number
    skills: string[]
    experiences: CandidateExperience[]
    projects: CandidateProject[]
    sourceText: string
  }
  job: {
    role: string
    responsibilities: string[]
    requiredSkills: string[]
    preferredExperience: string[]
    interviewSignals: string[]
    sourceText: string
  }
  gaps: string[]
}

export type ResumeProfile = {
  id: string
  jobProfileId: string
  role: string
  fileName: string
  text: string
  candidateProfile: StructuredProfile | null
  parsedAt: string | null
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export type JobProfile = {
  id: string
  title: string
  sortOrder: number
  isDefault: boolean
  resumes: ResumeProfile[]
}

export type UserProfile = {
  id: number
  name: string
  headline: string
  yearsExperience: number
  targetRoles: string[]
  resumeText: string
  resumeFileName: string
  resumes: ResumeProfile[]
  candidateProfile: StructuredProfile | null
  parsedAt: string | null
  createdAt: string
  updatedAt: string
  jobs: JobProfile[]
}

export type JobProfilePatch = Partial<Pick<JobProfile, 'title' | 'isDefault'>>
export type CreateResumeInput = Pick<ResumeProfile, 'fileName' | 'text'> & Partial<Pick<ResumeProfile, 'candidateProfile' | 'parsedAt'>>
export type ResumePatch = Partial<Pick<ResumeProfile, 'fileName' | 'text' | 'candidateProfile' | 'parsedAt' | 'isDefault'>>
export type UserProfilePatch = Partial<Omit<UserProfile, 'id' | 'jobs' | 'createdAt' | 'updatedAt'>>

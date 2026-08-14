import { useEffect, useState } from 'react'
import { profileApi } from '../../api/profileApi'
import type { JobProfile, UserProfile } from '../../types/profile'

const EMPTY_PROFILE: UserProfile = {
  id: 1, name: '', headline: '', yearsExperience: 0, targetRoles: [], resumeText: '',
  resumeFileName: '', resumes: [], candidateProfile: null, parsedAt: null,
}

export function useProfileData() {
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE)
  const [jobs, setJobs] = useState<JobProfile[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    profileApi.get().then((payload) => {
      setProfile(payload.profile)
      setJobs(payload.profile.jobs || [])
    }).catch(() => {})
  }, [])

  return { profile, setProfile, jobs, setJobs, open, setOpen }
}

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { lastPathSegment, matchesRoute, pathSegment, requestPath } from '../../dist-server/http/routing.js'

describe('HTTP routing helpers', () => {
  const request = { method: 'PATCH', url: '/api/profile/jobs/job-1?source=test' }

  it('strips query parameters and reads path segments', () => {
    assert.equal(requestPath(request), '/api/profile/jobs/job-1')
    assert.equal(pathSegment(request, 4), 'job-1')
    assert.equal(lastPathSegment(request), 'job-1')
  })

  it('matches both static and regular-expression routes with the method', () => {
    assert.equal(matchesRoute(request, 'PATCH', '/api/profile/jobs/job-1'), true)
    assert.equal(matchesRoute(request, 'PATCH', /^\/api\/profile\/jobs\/[^/]+$/), true)
    assert.equal(matchesRoute(request, 'GET', /^\/api\/profile\/jobs\/[^/]+$/), false)
  })
})

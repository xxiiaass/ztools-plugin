import test from 'node:test'
import assert from 'node:assert/strict'
import request from './helpers.js'

test('无 token 得到 401，空库快照 revision 为 0', async () => {
  const { base, close } = await request({ token: 'secret' })
  const denied = await fetch(base + '/api/snapshot')
  assert.equal(denied.status, 401)
  assert.deepEqual(await denied.json(), { error: 'unauthorized' })
  const ok = await fetch(base + '/api/snapshot', { headers: { authorization: 'Bearer secret' } })
  assert.equal(ok.status, 200)
  const body = await ok.json()
  assert.equal(body.revision, 0)
  assert.deepEqual(body.projects, [])
  assert.deepEqual(body.cards, [])
  await close()
})

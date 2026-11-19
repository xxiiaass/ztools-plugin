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

test('主动备份把看板发到邮箱，没有邮箱配置则拒绝', async () => {
  let message
  const { base, db, close } = await request({
    token: 'secret',
    mailer: { sendMail(msg) { message = msg } },
  })
  const missing = await fetch(base + '/api/backup', {
    method: 'POST',
    headers: { authorization: 'Bearer secret' },
  })
  assert.equal(missing.status, 400)
  db.prepare(`INSERT INTO meta(key, value) VALUES ('smtp', ?)`).run(JSON.stringify({
    host: 'smtp.example', user: 'a', pass: 'b', to: 'me@example.com', from: 'a',
  }))
  const ok = await fetch(base + '/api/backup', {
    method: 'POST',
    headers: { authorization: 'Bearer secret' },
  })
  assert.equal(ok.status, 200)
  assert.equal(message.attachments[0].filename, 'board.db')
  assert.equal(message.to, 'me@example.com')
  await close()
})

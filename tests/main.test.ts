import {after, afterEach, before, beforeEach, describe, test} from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import http from 'node:http'
import {AddressInfo} from 'node:net'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

interface SlackRequest {
  url: string
  body: string
}

interface RunResult {
  stdout: string
  stderr: string
  code: number | null
}

const REPO_ROOT = path.resolve(import.meta.dirname, '..')
const MAIN_ENTRY = path.join(REPO_ROOT, 'src', 'main.ts')

function startSlackWebhookServer(): Promise<{
  url: (path?: string) => string
  requests: SlackRequest[]
  close: () => Promise<void>
}> {
  const requests: SlackRequest[] = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', chunk => (body += chunk))
    req.on('end', () => {
      requests.push({url: req.url ?? '', body})
      res.writeHead(200, {'content-type': 'application/json'})
      res.end('{"ok":true}')
    })
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address() as AddressInfo
      resolve({
        url: (p = '/webhook') => `http://127.0.0.1:${port}${p}`,
        requests,
        close: () =>
          new Promise<void>(res => {
            server.close(() => res())
          })
      })
    })
  })
}

function runAction(env: Record<string, string>): Promise<RunResult> {
  return new Promise(resolve => {
    const cleanEnv = {...process.env}
    for (const key of Object.keys(cleanEnv)) {
      if (key.startsWith('GITHUB_') || key.startsWith('INPUT_')) {
        delete cleanEnv[key]
      }
    }
    const child = spawn(process.execPath, ['--import', 'tsx', MAIN_ENTRY], {
      cwd: REPO_ROOT,
      env: {...cleanEnv, ...env}
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => (stdout += d.toString()))
    child.stderr.on('data', d => (stderr += d.toString()))
    child.on('close', code => resolve({stdout, stderr, code}))
  })
}

function writeEventFile(payload: unknown): string {
  const file = path.join(
    os.tmpdir(),
    `slackbot-release-event-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  )
  fs.writeFileSync(file, JSON.stringify(payload))
  return file
}

const releasePayload = {
  release: {
    html_url: 'https://github.com/acme/widget/releases/tag/v1.2.3',
    name: 'v1.2.3',
    body: '# Release notes\n\nFixed a thing.',
    author: {login: 'octocat'}
  }
}

describe('main entrypoint', () => {
  let slack: Awaited<ReturnType<typeof startSlackWebhookServer>>
  const tempFiles: string[] = []

  before(async () => {
    slack = await startSlackWebhookServer()
  })

  after(async () => {
    await slack.close()
  })

  beforeEach(() => {
    slack.requests.length = 0
  })

  afterEach(() => {
    while (tempFiles.length > 0) {
      const f = tempFiles.pop()
      if (f && fs.existsSync(f)) fs.unlinkSync(f)
    }
  })

  test('on a release event, POSTs the rendered Slack payload to the webhook URL', async () => {
    const eventPath = writeEventFile(releasePayload)
    tempFiles.push(eventPath)

    const result = await runAction({
      INPUT_SLACK_WEBHOOK_URL: slack.url('/services/T/B/secret'),
      GITHUB_REPOSITORY: 'acme/widget',
      GITHUB_EVENT_NAME: 'release',
      GITHUB_EVENT_PATH: eventPath
    })

    assert.equal(
      slack.requests.length,
      1,
      `expected one Slack POST. stdout=${result.stdout} stderr=${result.stderr}`
    )
    const req = slack.requests[0]
    assert.equal(req.url, '/services/T/B/secret')

    const payload = JSON.parse(req.body) as {
      text: string
      blocks: {type: string}[]
    }
    assert.equal(payload.text, 'v1.2.3 has been released in acme/widget')
    assert.ok(payload.blocks.some(b => b.type === 'header'))
    assert.ok(payload.blocks.some(b => b.type === 'actions'))
    assert.ok(payload.blocks.some(b => b.type === 'context'))
    assert.equal(result.code, 0)
  })

  test('on a non-release event, fails the action via ::error:: and does not POST to Slack', async () => {
    const eventPath = writeEventFile({}) // payload is irrelevant for this branch
    tempFiles.push(eventPath)

    const result = await runAction({
      INPUT_SLACK_WEBHOOK_URL: slack.url(),
      GITHUB_REPOSITORY: 'acme/widget',
      GITHUB_EVENT_NAME: 'push',
      GITHUB_EVENT_PATH: eventPath
    })

    assert.match(
      result.stdout,
      /::error::Action should only be run on release publish events/
    )
    const errorLines = result.stdout.match(/^::error::/gm) ?? []
    assert.equal(
      errorLines.length,
      1,
      `expected exactly one ::error:: line, got ${errorLines.length}. stdout=${result.stdout}`
    )
    assert.equal(slack.requests.length, 0)
    assert.notEqual(result.code, 0)
  })

  test('reports an error when the Slack webhook is unreachable', async () => {
    const eventPath = writeEventFile(releasePayload)
    tempFiles.push(eventPath)

    // 127.0.0.1:1 is a reserved unassignable port — connection will fail fast.
    const result = await runAction({
      INPUT_SLACK_WEBHOOK_URL: 'http://127.0.0.1:1/unreachable',
      GITHUB_REPOSITORY: 'acme/widget',
      GITHUB_EVENT_NAME: 'release',
      GITHUB_EVENT_PATH: eventPath
    })

    assert.match(result.stdout, /::error::/)
    assert.notEqual(result.code, 0)
  })
})

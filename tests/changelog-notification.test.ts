import {after, afterEach, before, describe, test} from 'node:test'
import assert from 'node:assert/strict'
import sinon from 'sinon'
import axios from 'axios'
import {notifyChangelog} from '../src/changelog-notification.js'

interface ButtonElement {
  type: 'button'
  text: {type: 'plain_text'; text: string}
  url: string
}

interface PlainTextElement {
  type: 'plain_text'
  text: string
  emoji?: boolean
}

type SlackElement = ButtonElement | PlainTextElement

interface SlackBlock {
  type: string
  text?: {type: string; text: string; emoji?: boolean}
  elements?: SlackElement[]
}

interface SlackPayload {
  text: string
  blocks: SlackBlock[]
}

const baseRelease = {
  html_url: 'https://github.com/acme/widget/releases/tag/v1.2.3',
  name: 'v1.2.3',
  body: '# Highlights\n\nSomething **bold** happened.',
  author: {login: 'octocat'}
}

const baseRepo = {owner: 'acme', repo: 'widget'}

describe('notifyChangelog', () => {
  let postStub: sinon.SinonStub

  before(() => {
    postStub = sinon.stub(axios, 'post')
  })

  afterEach(() => {
    postStub.resetHistory()
    postStub.resetBehavior()
  })

  after(() => {
    sinon.restore()
  })

  test('POSTs to the provided Slack webhook URL', async () => {
    postStub.resolves({data: {ok: true}})
    const webhookUrl = 'https://hooks.slack.com/services/T/B/secret'

    await notifyChangelog({
      slackWebhookUrl: webhookUrl,
      release: baseRelease,
      repo: baseRepo
    })

    assert.equal(postStub.callCount, 1)
    assert.equal(postStub.firstCall.args[0], webhookUrl)
  })

  test('payload text field summarises the release for notification previews', async () => {
    postStub.resolves({data: {}})

    await notifyChangelog({
      slackWebhookUrl: 'https://example.test/hook',
      release: baseRelease,
      repo: baseRepo
    })

    const payload = postStub.firstCall.args[1] as SlackPayload
    assert.equal(payload.text, 'v1.2.3 has been released in acme/widget')
  })

  test('first block is a header with the tada emoji, repo, and release name', async () => {
    postStub.resolves({data: {}})

    await notifyChangelog({
      slackWebhookUrl: 'https://example.test/hook',
      release: baseRelease,
      repo: baseRepo
    })

    const payload = postStub.firstCall.args[1] as SlackPayload
    const header = payload.blocks[0]
    assert.equal(header.type, 'header')
    assert.equal(header.text?.type, 'plain_text')
    assert.equal(header.text?.text, ':tada: acme/widget v1.2.3')
    assert.equal(header.text?.emoji, true)
  })

  test('includes an actions block with a "View release" button linking to html_url', async () => {
    postStub.resolves({data: {}})

    await notifyChangelog({
      slackWebhookUrl: 'https://example.test/hook',
      release: baseRelease,
      repo: baseRepo
    })

    const payload = postStub.firstCall.args[1] as SlackPayload
    const actions = payload.blocks.find(b => b.type === 'actions')
    if (!actions) throw new Error('expected an actions block')
    const button = actions.elements?.[0]
    if (button?.type !== 'button') throw new Error('expected a button element')
    assert.equal(button.text.text, 'View release')
    assert.equal(button.url, baseRelease.html_url)
  })

  test('includes a context block attributing the release to its author', async () => {
    postStub.resolves({data: {}})

    await notifyChangelog({
      slackWebhookUrl: 'https://example.test/hook',
      release: baseRelease,
      repo: baseRepo
    })

    const payload = postStub.firstCall.args[1] as SlackPayload
    const context = payload.blocks.find(b => b.type === 'context')
    if (!context) throw new Error('expected a context block')
    const author = context.elements?.[0]
    if (author?.type !== 'plain_text')
      throw new Error('expected a plain_text element')
    assert.equal(author.text, ':technologist: Author: octocat')
  })

  test('includes a divider between body and the action/context footer', async () => {
    postStub.resolves({data: {}})

    await notifyChangelog({
      slackWebhookUrl: 'https://example.test/hook',
      release: baseRelease,
      repo: baseRepo
    })

    const payload = postStub.firstCall.args[1] as SlackPayload
    const dividerIndex = payload.blocks.findIndex(b => b.type === 'divider')
    const actionsIndex = payload.blocks.findIndex(b => b.type === 'actions')
    const contextIndex = payload.blocks.findIndex(b => b.type === 'context')
    assert.ok(dividerIndex > 0, 'expected divider after body blocks')
    assert.ok(dividerIndex < actionsIndex, 'divider should precede actions')
    assert.ok(dividerIndex < contextIndex, 'divider should precede context')
  })

  test('converts the markdown release body into Slack blocks via mack', async () => {
    postStub.resolves({data: {}})

    await notifyChangelog({
      slackWebhookUrl: 'https://example.test/hook',
      release: {
        ...baseRelease,
        body: '# A heading\n\nA paragraph with **bold** text.'
      },
      repo: baseRepo
    })

    const payload = postStub.firstCall.args[1] as SlackPayload
    const headerIdx = payload.blocks.findIndex(b => b.type === 'header')
    const dividerIdx = payload.blocks.findIndex(b => b.type === 'divider')
    const bodyBlocks = payload.blocks.slice(headerIdx + 1, dividerIdx)
    assert.ok(
      bodyBlocks.length > 0,
      'expected mack to produce at least one body block'
    )
    const serialised = JSON.stringify(bodyBlocks)
    assert.match(serialised, /A heading/)
    assert.match(serialised, /bold/)
  })

  test('handles an empty release body without throwing', async () => {
    postStub.resolves({data: {}})

    await notifyChangelog({
      slackWebhookUrl: 'https://example.test/hook',
      release: {...baseRelease, body: ''},
      repo: baseRepo
    })

    assert.equal(postStub.callCount, 1)
    const payload = postStub.firstCall.args[1] as SlackPayload
    assert.equal(payload.blocks[0].type, 'header')
    assert.ok(payload.blocks.some(b => b.type === 'actions'))
  })

  test('propagates axios errors to the caller', async () => {
    postStub.rejects(new Error('slack unreachable'))

    await assert.rejects(
      notifyChangelog({
        slackWebhookUrl: 'https://example.test/hook',
        release: baseRelease,
        repo: baseRepo
      }),
      /slack unreachable/
    )
  })

  test('returns the axios response payload', async () => {
    const response = {data: {ok: true, channel: 'C123'}, status: 200}
    postStub.resolves(response)

    const result = await notifyChangelog({
      slackWebhookUrl: 'https://example.test/hook',
      release: baseRelease,
      repo: baseRepo
    })

    assert.equal(result, response)
  })
})

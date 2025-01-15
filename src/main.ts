import {debug, getInput, setFailed} from '@actions/core'
import {context as github_context} from '@actions/github'
import type {ReleaseReleasedEvent} from '@octokit/webhooks-types'
import {notifyChangelog} from './changelog-notification'

async function run(): Promise<void> {
  try {
    debug(`Sending notification...`)
    const slackWebhookUrl: string = getInput('slack_webhook_url')

    const context = github_context
    const {eventName, repo} = context
    if (eventName !== 'release') {
      setFailed('Action should only be run on release publish events')
    }
    const payload = context.payload as ReleaseReleasedEvent
    await notifyChangelog({
      slackWebhookUrl,
      release: payload.release,
      repo
    })

    debug('Sent notification')
  } catch (error) {
    if (error instanceof Error) setFailed(error.message)
  }
}

run()

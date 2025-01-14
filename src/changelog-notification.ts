import type {
  ActionsBlock,
  Block,
  Button,
  ContextBlock,
  DividerBlock,
  HeaderBlock,
  PlainTextElement
} from '@slack/types'
import type {OauthV2AccessResponse} from '@slack/web-api'
import axios from 'axios'
import {markdownToBlocks} from '@tryfabric/mack'

interface Author {
  login: string
}

interface Repository {
  repo: string
  owner: string
}

interface Release {
  html_url: string
  name: string
  body: string
  author: Author
}

interface ChangelogParameters {
  slackWebhookUrl: string
  release: Release
  repo: Repository
}

export async function notifyChangelog({
  slackWebhookUrl,
  release,
  repo
}: ChangelogParameters): Promise<OauthV2AccessResponse> {
  const introBlock: HeaderBlock = {
    type: 'header',
    text: {
      type: 'plain_text',
      text: `:tada: ${repo.owner}/${repo.repo} ${release.name}`,
      emoji: true
    }
  }

  const releaseButton: Button = {
    type: 'button',
    text: {
      type: 'plain_text',
      text: 'View release'
    },
    url: `${release.html_url}`
  }

  const actionBlock: ActionsBlock = {
    type: 'actions',
    elements: [releaseButton]
  }

  const author: PlainTextElement = {
    type: 'plain_text',
    text: `:technologist: Author: ${release.author.login}`,
    emoji: true
  }

  const contextBlock: ContextBlock = {
    type: 'context',
    elements: [author]
  }

  const dividerBlock: DividerBlock = {type: 'divider'}

  const bodyBlocks: Block[] = await markdownToBlocks(release.body)

  return await axios.post(slackWebhookUrl, {
    text: `${release.name} has been released in ${repo.owner}/${repo.repo}`,
    blocks: [introBlock, ...bodyBlocks, dividerBlock, actionBlock, contextBlock]
  })
}

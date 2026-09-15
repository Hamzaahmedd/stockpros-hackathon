#!/usr/bin/env node
// .github/scripts/self-heal-docs.mjs
//
// Detects whether the diff between BASE_SHA and HEAD_SHA makes README.md
// stale, and if so, overwrites README.md with a corrected version.
//
// Zero-cost by design: Gemini 2.5 Flash (free tier) is tried first, Groq
// llama-3.3-70b-versatile (free tier) is the fallback if Gemini fails for
// any reason (network error, non-2xx, safety block, malformed JSON). No
// paid APIs, no SDK dependencies — both calls use Node's built-in fetch.
//
// Exit code: 0 whether or not an update was made (that's a normal outcome).
// Non-zero only on a hard failure (both providers unreachable/misconfigured,
// or missing BASE_SHA/HEAD_SHA) — a loud, visible failure rather than a
// silent no-op, since a broken key/quota issue should be noticed.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'

// Kept in sync with the `paths:` filter in
// .github/workflows/self-heal-docs.yml — re-scopes the diff to the same
// signal-bearing files, since a PR can touch files outside that filter too.
const DIFF_PATHS = [
  'backend/src',
  'backend/package.json',
  'backend/prisma/schema.prisma',
  'frontend/src',
  'frontend/package.json',
  'ai-service/app',
  'ai-service/requirements.txt',
  '**/.env.example',
  '**/.env.template',
  ':!**/package-lock.json',
]

const MAX_DIFF_CHARS = 60_000
const README_PATH = 'README.md'
const MAX_OUTPUT_TOKENS = 8192

const SYSTEM_PROMPT = `You are a documentation-sync assistant for a monorepo (Node/Express/Prisma backend, React/Vite frontend, Python/FastAPI ai-service).

You will be given:
1. A git diff of source-relevant files changed in a pull request.
2. The current contents of README.md.

Decide whether the diff makes README.md stale. Be CONSERVATIVE — most PRs (bug fixes, refactors, internal logic changes) do NOT require a README update. Only flag drift for changes a reader of the README would notice as wrong or missing, such as:
- a new or changed required environment variable
- a changed setup/run/build command or script
- a changed folder or service structure
- a changed tech stack or major dependency
- a changed high-level architecture or data flow

If no update is needed, return needsUpdate: false and leave updatedReadme empty.
If an update is needed, return needsUpdate: true, a short reason, and the FULL corrected README.md content in updatedReadme (the complete file, not a diff/patch) — preserve the existing structure, tone, and formatting; change only what the diff actually invalidates.`

function buildUserPrompt(diff, readme) {
  return `## Git diff\n\n\`\`\`diff\n${diff}\n\`\`\`\n\n## Current README.md\n\n\`\`\`markdown\n${readme}\n\`\`\``
}

function getScopedDiff(baseSha, headSha) {
  const raw = execFileSync(
    'git',
    ['diff', baseSha, headSha, '--', ...DIFF_PATHS],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 },
  )
  if (raw.length <= MAX_DIFF_CHARS) return raw

  const cut = raw.lastIndexOf('\n', MAX_DIFF_CHARS)
  const truncatedAt = cut > 0 ? cut : MAX_DIFF_CHARS
  return `${raw.slice(0, truncatedAt)}\n[...diff truncated...]`
}

function validateShape(obj) {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.needsUpdate === 'boolean' &&
    typeof obj.reason === 'string' &&
    (obj.updatedReadme === undefined || typeof obj.updatedReadme === 'string')
  )
}

async function callGemini(diff, readme) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')

  const body = {
    // Gemini's REST API rejects a role: "system" entry inside `contents`
    // with HTTP 400 — the system prompt must be this top-level field.
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: buildUserPrompt(diff, readme) }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      // Gemini's REST API requires UPPERCASE JSON Schema type strings —
      // lowercase ("object"/"boolean"/"string") is rejected with HTTP 400.
      responseSchema: {
        type: 'OBJECT',
        properties: {
          needsUpdate: { type: 'BOOLEAN' },
          reason: { type: 'STRING' },
          updatedReadme: { type: 'STRING' },
        },
        required: ['needsUpdate', 'reason'],
      },
    },
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )

  if (!res.ok) {
    throw new Error(`Gemini request failed: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  // Optional chaining throughout: a safety block or an empty/truncated
  // response can leave any of these levels missing, and that must fall
  // through to the Groq fallback rather than throw an uncaught TypeError.
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini response missing text content')

  const parsed = JSON.parse(text)
  if (!validateShape(parsed)) {
    throw new Error('Gemini response failed shape validation')
  }
  return parsed
}

async function callGroq(diff, readme) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY not set')

  // Groq's json_object mode only guarantees valid JSON, not a specific
  // shape — the schema has to be spelled out in the prompt, then the
  // response is validated manually (mirrors backend/.../groq-enricher.ts).
  const schemaReminder = `Respond with ONLY a JSON object of this exact shape, no markdown fences, no commentary:
{"needsUpdate": boolean, "reason": string, "updatedReadme": string}`

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: `${SYSTEM_PROMPT}\n\n${schemaReminder}` },
        { role: 'user', content: buildUserPrompt(diff, readme) },
      ],
      response_format: { type: 'json_object' },
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.2,
    }),
  })

  if (!res.ok) {
    throw new Error(`Groq request failed: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('Groq response missing message content')

  const parsed = JSON.parse(text)
  if (!validateShape(parsed)) {
    throw new Error('Groq response failed shape validation')
  }
  return parsed
}

function writeSummary(lines) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (!summaryPath) return
  appendFileSync(summaryPath, lines.join('\n') + '\n')
}

async function main() {
  const baseSha = process.env.BASE_SHA
  const headSha = process.env.HEAD_SHA
  if (!baseSha || !headSha) {
    console.error('BASE_SHA / HEAD_SHA not set')
    process.exit(1)
  }

  const diff = getScopedDiff(baseSha, headSha)
  if (!diff.trim()) {
    console.log('No in-scope changes in this diff — skipping.')
    writeSummary([
      '### Self-Healing README',
      'No in-scope changes detected — skipped.',
    ])
    return
  }

  const readme = readFileSync(README_PATH, 'utf8')

  let result
  let provider
  try {
    result = await callGemini(diff, readme)
    provider = 'Gemini 2.5 Flash'
  } catch (geminiErr) {
    console.warn(`Gemini failed, falling back to Groq: ${geminiErr.message}`)
    try {
      result = await callGroq(diff, readme)
      provider = 'Groq (llama-3.3-70b-versatile)'
    } catch (groqErr) {
      console.error(`Groq also failed: ${groqErr.message}`)
      writeSummary([
        '### Self-Healing README',
        `Both providers failed. Gemini: ${geminiErr.message}. Groq: ${groqErr.message}`,
      ])
      process.exit(1)
    }
  }

  if (
    result.needsUpdate &&
    result.updatedReadme &&
    result.updatedReadme.trim()
  ) {
    writeFileSync(README_PATH, result.updatedReadme)
    console.log(`README.md updated by ${provider}. Reason: ${result.reason}`)
    writeSummary([
      '### Self-Healing README',
      `README.md updated by **${provider}**.`,
      `**Reason:** ${result.reason}`,
    ])
  } else {
    console.log(`No README update needed (${provider}). Reason: ${result.reason}`)
    writeSummary([
      '### Self-Healing README',
      `No update needed (checked by **${provider}**).`,
      `**Reason:** ${result.reason}`,
    ])
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})

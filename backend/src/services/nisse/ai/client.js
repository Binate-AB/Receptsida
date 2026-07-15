// ============================================
// Nisse AI — Provider client
// The ONLY file in the Nisse domain that touches the
// Anthropic SDK. Swapping model/provider happens here
// and nowhere else. All output is schema-validated with
// one retry; callers must handle AiOutputError with a
// deterministic fallback.
// ============================================

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../../config/env.js';
import { parseJsonLoose } from '../../../utils/json-repair.js';

const MODEL = 'claude-sonnet-4-20250514';

export class AiOutputError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'AiOutputError';
    this.cause = cause;
  }
}

let client = null;
function getClient() {
  if (!client) {
    client = new Anthropic({
      apiKey: config.ANTHROPIC_API_KEY,
      // Structured calls are small. Keep the per-request timeout tight so a
      // slow model call fails fast to the deterministic fallback — important
      // on serverless hosts with a hard function timeout (Vercel Hobby = 10s).
      // We do our own validation retry, so no SDK-level retries.
      timeout: 8_000,
      maxRetries: 0,
    });
  }
  return client;
}

/**
 * True when no plausible API key is configured — callers can skip
 * straight to their deterministic fallback.
 */
export function aiAvailable() {
  const key = config.ANTHROPIC_API_KEY || '';
  return key.startsWith('sk-ant-') && !key.includes('placeholder');
}

/**
 * Call the model and validate the JSON output against a Zod schema.
 * On validation failure, retries ONCE with the validation errors
 * appended. On final failure throws AiOutputError.
 *
 * @param {object} params
 * @param {string} params.promptKey — key in PROMPTS (for logging)
 * @param {string} params.promptVersion
 * @param {string} params.system
 * @param {string} params.user
 * @param {number} params.maxTokens
 * @param {import('zod').ZodTypeAny} params.schema
 * @returns {Promise<{ data: any, raw: string }>}
 */
export async function callStructured({ promptKey, promptVersion, system, user, maxTokens, schema }) {
  const attempt = async (extraInstruction = '') => {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: extraInstruction ? `${user}\n\n${extraInstruction}` : user }],
    });

    const raw = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    let json;
    try {
      json = parseJsonLoose(raw);
    } catch (err) {
      return { ok: false, error: `JSON-parse: ${err.message}`, raw };
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return { ok: false, error: JSON.stringify(parsed.error.flatten().fieldErrors), raw };
    }
    return { ok: true, data: parsed.data, raw };
  };

  const first = await attempt();
  if (first.ok) {
    console.log(`[nisse-ai] ${promptKey}@${promptVersion} ok`);
    return { data: first.data, raw: first.raw };
  }

  console.warn(`[nisse-ai] ${promptKey}@${promptVersion} invalid output, retrying: ${first.error}`);
  const second = await attempt(
    `FÖRRA SVARET VAR OGILTIGT (${first.error}). Svara igen med ENDAST giltig JSON enligt formatet ovan.`
  );
  if (second.ok) {
    console.log(`[nisse-ai] ${promptKey}@${promptVersion} ok on retry`);
    return { data: second.data, raw: second.raw };
  }

  throw new AiOutputError(`${promptKey}@${promptVersion} failed validation twice: ${second.error}`);
}

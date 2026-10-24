// One place for Amazon Bedrock calls (Converse API), shared by the digest and the simulator's assistant.
// Some models reject sampling settings such as temperature; we retry once without them, so a
// configured model really answers instead of silently falling back to templates.

import { BedrockRuntimeClient, ConverseCommand, type ConverseCommandInput, type ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';

let client: BedrockRuntimeClient | null = null;
/** Models that rejected a temperature once: later calls skip it instead of failing first. */
const noTemperature = new Set<string>();

export function bedrockModel(): string | null {
  if (process.env.PAWZOO_BEDROCK === 'off') return null;
  return process.env.BEDROCK_MODEL_ID?.trim() || null;
}

function bedrock(): BedrockRuntimeClient {
  client ??= new BedrockRuntimeClient(process.env.AWS_REGION ? { region: process.env.AWS_REGION } : {});
  return client;
}

export interface ConverseOptions {
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
}

export async function converse(input: Omit<ConverseCommandInput, 'modelId' | 'inferenceConfig'>, opts: ConverseOptions): Promise<ConverseCommandOutput> {
  const modelId = bedrockModel();
  if (!modelId) throw new Error('BEDROCK_MODEL_ID is not set');
  const timeout = opts.timeoutMs ?? Number(process.env.BEDROCK_TIMEOUT_MS ?? 20_000);
  const send = (inferenceConfig: ConverseCommandInput['inferenceConfig']) =>
    bedrock().send(new ConverseCommand({ ...input, modelId, inferenceConfig }), { abortSignal: AbortSignal.timeout(timeout) });
  const withTemperature = opts.temperature !== undefined && !noTemperature.has(modelId);
  try {
    return await send({ maxTokens: opts.maxTokens, ...(withTemperature ? { temperature: opts.temperature } : {}) });
  } catch (err) {
    const e = err as Error;
    if (withTemperature && e.name === 'ValidationException') {
      console.warn(`[bedrock] ${modelId} rejected the request (${e.message}); retrying without temperature from now on.`);
      noTemperature.add(modelId);
      return send({ maxTokens: opts.maxTokens });
    }
    throw err;
  }
}

/** The text of a Converse reply, ignoring reasoning blocks some models return first. */
export function replyText(out: ConverseCommandOutput): string {
  return (out.output?.message?.content ?? [])
    .map((c) => c.text ?? '')
    .join('')
    .trim();
}

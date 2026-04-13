import Anthropic from '@anthropic-ai/sdk';
import { GenerateInput, GenerateOutput } from '../types';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `Você é especialista em copywriting para e-commerce brasileiro.
Gere conteúdo persuasivo com palavras-chave SEO naturais.
Retorne APENAS JSON válido sem markdown.`;

/** Remove caracteres que poderiam causar prompt injection */
function sanitize(value: string): string {
  return value
    .replace(/[<>{}[\]]/g, '')
    .trim()
    .slice(0, 500);
}

export async function generateContent(input: GenerateInput): Promise<GenerateOutput> {
  const name = sanitize(input.name);
  const category = sanitize(input.category);
  const features = sanitize(input.features);

  const userMessage = `Produto: ${name}
Categoria: ${category}
Características: ${features}

Retorne um JSON com exatamente esta estrutura:
{
  "title": "título SEO (máx 60 chars)",
  "shortDescription": "descrição curta persuasiva (máx 150 chars)",
  "longDescription": "descrição longa em 3 parágrafos separados por \\n\\n",
  "bullets": ["benefit 1", "benefit 2", "benefit 3", "benefit 4", "benefit 5"]
}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const rawText =
    message.content[0].type === 'text' ? message.content[0].text : '';

  let parsed: GenerateOutput;
  try {
    parsed = JSON.parse(rawText) as GenerateOutput;
  } catch {
    throw new Error(`JSON inválido retornado pela API: ${rawText.slice(0, 100)}`);
  }

  if (
    typeof parsed.title !== 'string' ||
    typeof parsed.shortDescription !== 'string' ||
    typeof parsed.longDescription !== 'string' ||
    !Array.isArray(parsed.bullets) ||
    parsed.bullets.length !== 5
  ) {
    throw new Error('Estrutura de resposta inválida da API');
  }

  return parsed;
}

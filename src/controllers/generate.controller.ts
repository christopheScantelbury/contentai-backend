import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, ApiError, GenerateOutput } from '../types';
import { generateContent } from '../services/anthropic';
import { supabase } from '../services/supabase';

// ── Validação de entrada (Zod) ────────────────────────────────────────────────

const generateSchema = z.object({
  name:     z.string().min(1, 'Nome é obrigatório').max(200),
  category: z.string().min(1, 'Categoria é obrigatória').max(100),
  features: z.string().min(1, 'Características são obrigatórias').max(1000),
  imageUrl: z.string().url('imageUrl deve ser uma URL válida').optional(),
});

// ── Controller ────────────────────────────────────────────────────────────────

export async function generateController(
  req: AuthenticatedRequest,
  res: Response<GenerateOutput | ApiError>,
): Promise<void> {
  // 1. Validação
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({
      error: parsed.error.errors[0].message,
      code:  'VALIDATION_ERROR',
    });
    return;
  }

  const { name, category, features, imageUrl } = parsed.data;

  // 2. Chamada à API Anthropic (< 8 s por critério da US-01)
  let output: GenerateOutput;
  try {
    output = await generateContent({ name, category, features, imageUrl });
  } catch (err) {
    console.error('[generate] Anthropic error:', err);
    res.status(502).json({
      error: 'Falha na API de IA. Tente novamente.',
      code:  'AI_ERROR',
    });
    return;
  }

  // 3. Persistência no Supabase (fire-and-forget — não bloqueia resposta)
  //    Alinhado ao schema: generations(user_id, product_name, category,
  //    features, image_url, result, tokens_used, generation_time_ms, model_used)
  supabase
    .from('generations')
    .insert({
      user_id:            req.userId,
      product_name:       name,
      category:           category,
      features:           features,
      image_url:          imageUrl ?? null,
      result:             output,
      tokens_used:        output.tokensUsed        ?? 0,
      generation_time_ms: output.generationTimeMs  ?? 0,
      model_used:         'claude-sonnet-4-20250514',
    })
    .then(({ error: dbErr }) => {
      if (dbErr) {
        console.error('[generate] Supabase insert error:', dbErr.message);
      }
    });

  // 4. Retorna apenas os campos do contrato público da API
  res.status(200).json({
    title:            output.title,
    shortDescription: output.shortDescription,
    longDescription:  output.longDescription,
    bullets:          output.bullets,
  });
}

import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, ApiError, GenerateOutput } from '../types';
import { generateContent } from '../services/anthropic';
import { supabase } from '../services/supabase';

const generateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(200),
  category: z.string().min(1, 'Categoria é obrigatória').max(100),
  features: z.string().min(1, 'Características são obrigatórias').max(1000),
  imageUrl: z.string().url('imageUrl deve ser uma URL válida').optional(),
});

export async function generateController(
  req: AuthenticatedRequest,
  res: Response<GenerateOutput | ApiError>,
): Promise<void> {
  // Validação de entrada com Zod
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({
      error: parsed.error.errors[0].message,
      code: 'VALIDATION_ERROR',
    });
    return;
  }

  const input = parsed.data;

  // Chamada à API Anthropic
  let output: GenerateOutput;
  try {
    output = await generateContent(input);
  } catch (err) {
    console.error('[generate] Anthropic error:', err);
    res.status(502).json({
      error: 'Falha na API de IA. Tente novamente.',
      code: 'AI_ERROR',
    });
    return;
  }

  // Persistência assíncrona — não bloqueia a resposta ao cliente
  supabase
    .from('generations')
    .insert({
      user_id: req.userId,
      input,
      output,
    })
    .then(({ error: dbErr }) => {
      if (dbErr) console.error('[generate] Supabase insert error:', dbErr.message);
    });

  res.status(200).json(output);
}

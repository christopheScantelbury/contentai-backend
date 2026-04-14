import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, ApiError, GenerateOutput, ImageMimeType } from '../types';
import { generateContent } from '../services/anthropic';
import { supabase } from '../services/supabase';

// ── Constantes de validação de imagem ─────────────────────────────────────────

const ALLOWED_MIME_TYPES: Record<string, ImageMimeType> = {
  'data:image/jpeg': 'image/jpeg',
  'data:image/jpg':  'image/jpeg',
  'data:image/png':  'image/png',
  'data:image/webp': 'image/webp',
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

// ── Validação de entrada (Zod) ────────────────────────────────────────────────

const generateSchema = z.object({
  name:     z.string().min(1, 'Nome é obrigatório').max(200),
  category: z.string().min(1, 'Categoria é obrigatória').max(100),
  features: z.string().min(1, 'Características são obrigatórias').max(1000),
  imageUrl: z.string().url('imageUrl deve ser uma URL válida').optional(),
  /** Data URI completa: data:image/jpeg;base64,<dados> */
  image:    z.string().optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

interface ParsedImage {
  base64:   string;
  mimeType: ImageMimeType;
}

/**
 * Extrai e valida uma data URI de imagem.
 * Retorna { base64, mimeType } ou lança erro com mensagem descritiva.
 */
function parseImageDataUri(dataUri: string): ParsedImage {
  // Formato esperado: data:<mime>;base64,<dados>
  const separatorIdx = dataUri.indexOf(';base64,');
  if (separatorIdx === -1) {
    throw new ValidationError('Imagem deve estar em formato data URI base64 (data:image/jpeg;base64,...)');
  }

  const prefix   = dataUri.slice(0, separatorIdx);        // ex: "data:image/jpeg"
  const b64Data  = dataUri.slice(separatorIdx + 8);        // após ";base64,"

  const mimeType = ALLOWED_MIME_TYPES[prefix.toLowerCase()];
  if (!mimeType) {
    throw new ValidationError('Formato de imagem não suportado. Use JPG, PNG ou WEBP.');
  }

  // Valida que é base64 válido
  if (!/^[A-Za-z0-9+/]+=*$/.test(b64Data)) {
    throw new ValidationError('Dados de imagem em base64 inválidos.');
  }

  // Verifica tamanho: cada char base64 representa ~0.75 bytes
  const estimatedBytes = Math.ceil(b64Data.length * 0.75);
  if (estimatedBytes > MAX_IMAGE_BYTES) {
    throw new ValidationError('Imagem excede o limite de 5MB.');
  }

  return { base64: b64Data, mimeType };
}

class ValidationError extends Error {}

// ── Controller ────────────────────────────────────────────────────────────────

export async function generateController(
  req: AuthenticatedRequest,
  res: Response<GenerateOutput | ApiError>,
): Promise<void> {
  // 1. Validação de campos de texto
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({
      error: parsed.error.errors[0].message,
      code:  'VALIDATION_ERROR',
    });
    return;
  }

  const { name, category, features, imageUrl, image } = parsed.data;

  // 2. Validação e parsing da imagem (opcional)
  let parsedImage: ParsedImage | undefined;
  if (image) {
    try {
      parsedImage = parseImageDataUri(image);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).json({ error: err.message, code: 'INVALID_IMAGE' });
      } else {
        res.status(422).json({ error: 'Imagem inválida.', code: 'INVALID_IMAGE' });
      }
      return;
    }
  }

  // 3. Chamada à API Anthropic com ou sem vision
  let output: GenerateOutput;
  try {
    output = await generateContent({
      name,
      category,
      features,
      imageUrl,
      imageBase64:   parsedImage?.base64,
      imageMimeType: parsedImage?.mimeType,
    });
  } catch (err) {
    console.error('[generate] Anthropic error:', err);
    res.status(502).json({
      error: 'Falha na API de IA. Tente novamente.',
      code:  'AI_ERROR',
    });
    return;
  }

  // 4. Persistência no Supabase (fire-and-forget)
  supabase
    .from('generations')
    .insert({
      user_id:            req.userId,
      product_name:       name,
      category,
      features,
      image_url:          imageUrl ?? null,
      result:             output,
      tokens_used:        output.tokensUsed        ?? 0,
      generation_time_ms: output.generationTimeMs  ?? 0,
      model_used:         'claude-sonnet-4-20250514',
    })
    .then(({ error: dbErr }) => {
      if (dbErr) console.error('[generate] Supabase insert error:', dbErr.message);
    });

  // 5. Resposta pública (sem campos internos)
  res.status(200).json({
    title:            output.title,
    shortDescription: output.shortDescription,
    longDescription:  output.longDescription,
    bullets:          output.bullets,
  });
}

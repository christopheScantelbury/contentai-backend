import { Request } from 'express';

// ── Erros ─────────────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  code:  string;
}

// ── Planos ────────────────────────────────────────────────────────────────────

export type Plan = 'free' | 'starter' | 'pro';

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface AuthenticatedRequest extends Request {
  userId:   string;
  userPlan?: Plan;
}

// ── Generate ──────────────────────────────────────────────────────────────────

export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface GenerateInput {
  name:           string;
  category:       string;
  features:       string;
  /** URL pública da imagem (opcional, para persistência) */
  imageUrl?:      string;
  /** Conteúdo da imagem em base64 puro (sem prefixo data:) */
  imageBase64?:   string;
  /** MIME type detectado a partir do prefixo data URI */
  imageMimeType?: ImageMimeType;
}

export interface GenerateOutput {
  title:            string;
  shortDescription: string;
  longDescription:  string;
  bullets:          string[];
  // campos internos (não expostos na resposta pública)
  tokensUsed?:        number;
  generationTimeMs?:  number;
}

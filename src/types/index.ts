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

export interface GenerateInput {
  name:      string;
  category:  string;
  features:  string;
  imageUrl?: string;
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

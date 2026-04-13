import { Request } from 'express';

export interface ApiError {
  error: string;
  code: string;
}

export type Plan = 'free' | 'starter' | 'pro';

export interface AuthenticatedRequest extends Request {
  userId: string;
  userPlan?: Plan;
}

export interface GenerateInput {
  name: string;
  category: string;
  features: string;
  imageUrl?: string;
}

export interface GenerateOutput {
  title: string;
  shortDescription: string;
  longDescription: string;
  bullets: string[];
}

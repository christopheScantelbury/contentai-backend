export interface ApiError {
  error: string;
  code: string;
}

export type Plan = 'free' | 'starter' | 'pro';

export interface AuthenticatedRequest extends Express.Request {
  userId: string;
  userPlan: Plan;
}

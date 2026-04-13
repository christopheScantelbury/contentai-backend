import { Response, NextFunction } from 'express';
import { supabase } from '../services/supabase';
import { AuthenticatedRequest, ApiError } from '../types';

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response<ApiError>,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Token de autenticação não fornecido',
      code:  'UNAUTHORIZED',
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({
      error: 'Token inválido ou expirado',
      code:  'INVALID_TOKEN',
    });
    return;
  }

  req.userId = user.id;
  next();
}

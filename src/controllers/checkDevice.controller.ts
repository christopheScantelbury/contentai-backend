import { Request, Response } from 'express';
import { supabase } from '../services/supabase';

interface CheckDeviceBody {
  device_id: string;
}

/**
 * POST /api/auth/check-device
 * Verifica se um device_id já está associado a uma conta gratuita confirmada.
 * Público (sem auth) — protegido apenas pelo rate limiter de IP.
 */
export async function checkDeviceController(
  req: Request,
  res: Response,
): Promise<void> {
  const { device_id } = req.body as CheckDeviceBody;

  if (!device_id || typeof device_id !== 'string' || device_id.length > 128) {
    res.status(200).json({ blocked: false });
    return;
  }

  // Busca usuários com este device_id nos metadados + email confirmado + plano free
  const { data, error } = await supabase
    .from('user_credits')
    .select('user_id, plan')
    .eq('plan', 'free')
    .limit(1)
    .throwOnError();

  if (error) {
    // Em caso de erro no DB, permite o cadastro (não punit o usuário)
    res.status(200).json({ blocked: false });
    return;
  }

  // Verifica se algum usuário confirmado tem este device_id nos metadados
  const { data: users } = await supabase.auth.admin.listUsers();

  const match = (users?.users ?? []).find(
    (u) =>
      u.email_confirmed_at &&
      (u.user_metadata?.device_id === device_id || u.raw_user_meta_data?.device_id === device_id),
  );

  res.status(200).json({ blocked: !!match });
}

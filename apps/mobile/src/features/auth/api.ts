import { api } from '@/lib/api';
import type { AuthUser, LoginPayload, Session, SignupPayload } from '@/features/auth/types';

export async function login(payload: LoginPayload): Promise<Session> {
  const response = await api.post<Session>('/auth/login', payload);
  return response.data;
}

export async function signup(payload: SignupPayload): Promise<Session> {
  const response = await api.post<Session>('/auth/signup', payload);
  return response.data;
}

export async function fetchMe(): Promise<AuthUser> {
  const response = await api.get<AuthUser>('/auth/me');
  return response.data;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

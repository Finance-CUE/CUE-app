import { api } from '@/lib/api';
import type {
  AuthUser,
  LoginPayload,
  ResetPasswordPayload,
  Session,
  SignupPayload,
  SignupPending,
  VerifyEmailPayload,
} from '@/features/auth/types';

export async function login(payload: LoginPayload): Promise<Session> {
  const response = await api.post<Session>('/auth/login', payload);
  return response.data;
}

export async function signup(payload: SignupPayload): Promise<SignupPending> {
  const response = await api.post<SignupPending>('/auth/signup', payload);
  return response.data;
}

export async function verifyEmail(payload: VerifyEmailPayload): Promise<Session> {
  const response = await api.post<Session>('/auth/verify-email', payload);
  return response.data;
}

export async function resendCode(email: string): Promise<void> {
  await api.post('/auth/resend-code', { email });
}

export async function googleSignIn(idToken: string): Promise<Session> {
  const response = await api.post<Session>('/auth/google', { id_token: idToken });
  return response.data;
}

export async function forgotPassword(email: string): Promise<void> {
  await api.post('/auth/forgot-password', { email });
}

export async function resetPassword(payload: ResetPasswordPayload): Promise<Session> {
  const response = await api.post<Session>('/auth/reset-password', payload);
  return response.data;
}

export async function setPhone(phone: string): Promise<AuthUser> {
  const response = await api.put<AuthUser>('/auth/phone', { phone });
  return response.data;
}

export async function fetchMe(): Promise<AuthUser> {
  const response = await api.get<AuthUser>('/auth/me');
  return response.data;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

export interface AuthUser {
  id: string;
  full_name: string;
  /** "" for Google sign-ups until they add one. */
  phone: string;
  contact_email: string | null;
  phone_verified: boolean;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface SignupPayload {
  full_name: string;
  email: string;
  phone: string;
  password: string;
}

/** Signup creates the account; it is unusable until the emailed code is verified. */
export interface SignupPending {
  status: 'verification_required';
  email: string;
}

export interface VerifyEmailPayload {
  email: string;
  code: string;
}

export interface ResetPasswordPayload {
  email: string;
  code: string;
  new_password: string;
}

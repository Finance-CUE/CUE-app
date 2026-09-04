export interface AuthUser {
  id: string;
  full_name: string;
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
  phone: string;
  password: string;
}

export interface SignupPayload {
  full_name: string;
  email: string;
  phone: string;
  password: string;
}

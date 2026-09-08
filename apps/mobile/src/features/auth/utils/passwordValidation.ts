export type PasswordValidationResult = {
  isValid: boolean;
  message?: string;
};

// Mirrors apps/backend/app/features/auth/schemas.py. The server enforces these
// too - this copy exists so the user sees the problem before a round trip.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

export function validatePassword(value: string): PasswordValidationResult {
  if (!value) {
    return {
      isValid: false,
      message: 'Please enter a password.',
    };
  }

  if (value.length < PASSWORD_MIN_LENGTH) {
    return {
      isValid: false,
      message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
  }

  if (value.length > PASSWORD_MAX_LENGTH) {
    return {
      isValid: false,
      message: `Password must be under ${PASSWORD_MAX_LENGTH} characters.`,
    };
  }

  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return {
      isValid: false,
      message: 'Password must contain at least one letter and one number.',
    };
  }

  return {
    isValid: true,
  };
}

export function validateFullName(value: string): PasswordValidationResult {
  const name = value.trim();

  if (name.length < 2) {
    return {
      isValid: false,
      message: 'Please enter your name.',
    };
  }

  if (name.length > 80) {
    return {
      isValid: false,
      message: 'Name is too long.',
    };
  }

  return {
    isValid: true,
  };
}

export function validateEmail(value: string): PasswordValidationResult {
  const email = value.trim();

  if (!email) {
    return {
      isValid: false,
      message: 'Please enter your email address.',
    };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return {
      isValid: false,
      message: 'Please enter a valid email address.',
    };
  }

  return {
    isValid: true,
  };
}

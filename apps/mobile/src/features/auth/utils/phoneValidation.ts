export type PhoneValidationResult = {
  isValid: boolean;
  message?: string;
};

export function validateIndianMobileNumber(
  value: string,
): PhoneValidationResult {
  const phoneNumber = value.trim();

  if (!phoneNumber) {
    return {
      isValid: false,
      message: 'Please enter your mobile number.',
    };
  }

  if (!/^\d+$/.test(phoneNumber)) {
    return {
      isValid: false,
      message: 'Please enter numbers only.',
    };
  }

  if (phoneNumber.length !== 10) {
    return {
      isValid: false,
      message: 'Mobile number must contain 10 digits.',
    };
  }

  if (!/^[6-9]/.test(phoneNumber)) {
    return {
      isValid: false,
      message: 'Please enter a valid Indian mobile number.',
    };
  }

  if (/^(\d)\1{9}$/.test(phoneNumber)) {
    return {
      isValid: false,
      message: 'Please enter a valid mobile number.',
    };
  }

  return {
    isValid: true,
  };
}
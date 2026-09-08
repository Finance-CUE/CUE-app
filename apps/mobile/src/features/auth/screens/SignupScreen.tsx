import { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { validateIndianMobileNumber } from '@/features/auth/utils/phoneValidation';
import {
  validateEmail,
  validateFullName,
  validatePassword,
} from '@/features/auth/utils/passwordValidation';

interface SignupScreenProps {
  initialPhoneNumber?: string;
  isSubmitting?: boolean;
  submitError?: string | null;
  onBack: () => void;
  onSubmit: (values: {
    fullName: string;
    email: string;
    phoneNumber: string;
    password: string;
  }) => void;
  onLoginPress: () => void;
}

const COLORS = {
  background: '#FAF8F6',
  text: '#292531',
  muted: '#918C95',
  mutedLight: '#A29CA8',
  border: '#D0CBD2',
  divider: '#DDD8DE',
  purple: '#8D80CC',
  purpleLight: '#A99DDB',
  link: '#8172C7',
  white: '#FFFFFF',
  error: '#C65F68',
  errorBackground: '#FFF5F5',
};

type FieldErrors = {
  fullName?: string;
  email?: string;
  phoneNumber?: string;
  password?: string;
  confirmPassword?: string;
};

export function SignupScreen({
  initialPhoneNumber = '',
  isSubmitting = false,
  submitError = null,
  onBack,
  onSubmit,
  onLoginPress,
}: SignupScreenProps) {
  const insets = useSafeAreaInsets();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const clearError = (field: keyof FieldErrors) => {
    setErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = () => {
    if (isSubmitting) {
      return;
    }

    const nextErrors: FieldErrors = {};

    const nameCheck = validateFullName(fullName);
    if (!nameCheck.isValid) {
      nextErrors.fullName = nameCheck.message;
    }

    const emailCheck = validateEmail(email);
    if (!emailCheck.isValid) {
      nextErrors.email = emailCheck.message;
    }

    const phoneCheck = validateIndianMobileNumber(phoneNumber);
    if (!phoneCheck.isValid) {
      nextErrors.phoneNumber = phoneCheck.message;
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.isValid) {
      nextErrors.password = passwordCheck.message;
    }

    if (password !== confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match.';
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    onSubmit({
      fullName: fullName.trim(),
      email: email.trim(),
      phoneNumber: phoneNumber.trim(),
      password,
    });
  };

  const renderError = (message?: string) => {
    if (!message) {
      return null;
    }

    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>!</Text>
        <Text style={styles.errorText}>{message}</Text>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <LinearGradient
        pointerEvents="none"
        colors={[
          'rgba(250,248,246,0)',
          'rgba(229,223,243,0.12)',
          'rgba(229,223,243,0.25)',
          'rgba(242,221,210,0.4)',
        ]}
        locations={[0, 0.45, 0.75, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.backgroundGradient}
      />

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: insets.top + 12,
              paddingBottom: insets.bottom + 28,
            },
          ]}
        >
          {/* Back */}

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onBack}
            style={styles.backButton}
          >
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          {/* Header */}

          <View style={styles.header}>
            <Text style={styles.eyebrow}>GET STARTED</Text>

            <Text style={styles.title}>Create your account</Text>

            <Text style={styles.description}>
              A few details, and CUE starts learning your money habits with you.
            </Text>
          </View>

          {/* Form */}

          <View style={styles.form}>
            <Text style={styles.inputLabel}>Full name</Text>

            <View
              style={[
                styles.textField,
                Boolean(errors.fullName) && styles.textFieldError,
              ]}
            >
              <TextInput
                style={styles.input}
                placeholder="Enter your name"
                placeholderTextColor="#A9A3AE"
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                maxLength={80}
                value={fullName}
                onChangeText={(value) => {
                  setFullName(value);
                  clearError('fullName');
                }}
              />
            </View>

            {renderError(errors.fullName)}

            <Text style={[styles.inputLabel, styles.labelSpacing]}>Email</Text>

            <View
              style={[
                styles.textField,
                Boolean(errors.email) && styles.textFieldError,
              ]}
            >
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="#A9A3AE"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  clearError('email');
                }}
              />
            </View>

            {renderError(errors.email)}

            <Text style={[styles.inputLabel, styles.labelSpacing]}>
              Mobile number
            </Text>

            <View
              style={[
                styles.textField,
                Boolean(errors.phoneNumber) && styles.textFieldError,
              ]}
            >
              <Text style={styles.countryCode}>+91</Text>

              <View style={styles.phoneDivider} />

              <TextInput
                style={styles.input}
                placeholder="Enter mobile number"
                placeholderTextColor="#A9A3AE"
                keyboardType="phone-pad"
                maxLength={10}
                textContentType="telephoneNumber"
                autoComplete="tel"
                value={phoneNumber}
                onChangeText={(value) => {
                  setPhoneNumber(value);
                  clearError('phoneNumber');
                }}
              />
            </View>

            {renderError(errors.phoneNumber)}

            <Text style={[styles.inputLabel, styles.labelSpacing]}>
              Password
            </Text>

            <View
              style={[
                styles.textField,
                Boolean(errors.password) && styles.textFieldError,
              ]}
            >
              <TextInput
                style={styles.input}
                placeholder="At least 8 characters"
                placeholderTextColor="#A9A3AE"
                secureTextEntry={!isPasswordVisible}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                autoComplete="new-password"
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  clearError('password');
                }}
              />

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setIsPasswordVisible((visible) => !visible)}
                hitSlop={10}
              >
                <Text style={styles.passwordToggle}>
                  {isPasswordVisible ? 'Hide' : 'Show'}
                </Text>
              </TouchableOpacity>
            </View>

            {renderError(errors.password)}

            <Text style={[styles.inputLabel, styles.labelSpacing]}>
              Confirm password
            </Text>

            <View
              style={[
                styles.textField,
                Boolean(errors.confirmPassword) && styles.textFieldError,
              ]}
            >
              <TextInput
                style={styles.input}
                placeholder="Re-enter your password"
                placeholderTextColor="#A9A3AE"
                secureTextEntry={!isPasswordVisible}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                value={confirmPassword}
                onChangeText={(value) => {
                  setConfirmPassword(value);
                  clearError('confirmPassword');
                }}
                onSubmitEditing={handleSubmit}
                returnKeyType="done"
              />
            </View>

            {renderError(errors.confirmPassword)}
            {renderError(submitError ?? undefined)}

            <TouchableOpacity
              activeOpacity={0.85}
              disabled={isSubmitting}
              style={[
                styles.primaryButton,
                isSubmitting && styles.primaryButtonDisabled,
              ]}
              onPress={handleSubmit}
            >
              {isSubmitting ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>Create account</Text>

                  <View style={styles.arrowContainer}>
                    <Text style={styles.arrow}>→</Text>
                  </View>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Login */}

          <View style={styles.loginContainer}>
            <Text style={styles.loginText}>
              Already have an account?{' '}
              <Text style={styles.loginLink} onPress={onLoginPress}>
                Log in
              </Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  keyboardContainer: {
    flex: 1,
    zIndex: 1,
  },

  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },

  backgroundGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 260,
  },

  /* Back */

  backButton: {
    height: 42,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
  },

  backArrow: {
    fontSize: 28,
    lineHeight: 28,
    color: COLORS.text,
    marginRight: 6,
    marginTop: -2,
  },

  backText: {
    fontSize: 14,
    color: COLORS.muted,
    fontWeight: '500',
  },

  /* Header */

  header: {
    alignItems: 'center',
    marginTop: 28,
  },

  eyebrow: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.6,
    color: COLORS.mutedLight,
    marginBottom: 10,
  },

  title: {
    fontSize: 32,
    lineHeight: 40,
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : undefined,
    letterSpacing: -0.6,
    textAlign: 'center',
  },

  description: {
    maxWidth: 325,
    marginTop: 12,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.muted,
  },

  /* Form */

  form: {
    marginTop: 30,
  },

  inputLabel: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '600',
    marginBottom: 9,
    marginLeft: 4,
  },

  labelSpacing: {
    marginTop: 16,
  },

  textField: {
    height: 52,
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 26,
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
  },

  textFieldError: {
    borderColor: COLORS.error,
    backgroundColor: COLORS.errorBackground,
  },

  countryCode: {
    fontSize: 14,
    color: '#57515D',
    fontWeight: '500',
  },

  phoneDivider: {
    width: 1,
    height: 20,
    backgroundColor: COLORS.divider,
    marginHorizontal: 11,
  },

  input: {
    flex: 1,
    height: 52,
    paddingVertical: 0,
    fontSize: 14,
    color: COLORS.text,
  },

  passwordToggle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.link,
    marginLeft: 10,
  },

  /* Error */

  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 6,
  },

  errorIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.error,
    color: COLORS.white,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
    marginRight: 7,
  },

  errorText: {
    flex: 1,
    color: COLORS.error,
    fontSize: 12,
    lineHeight: 17,
  },

  /* Primary */

  primaryButton: {
    height: 54,
    width: '100%',
    marginTop: 24,
    borderRadius: 27,
    backgroundColor: COLORS.text,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  primaryButtonDisabled: {
    opacity: 0.65,
  },

  primaryButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '600',
  },

  arrowContainer: {
    position: 'absolute',
    right: 20,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  arrow: {
    color: COLORS.purpleLight,
    fontSize: 22,
    lineHeight: 22,
  },

  /* Login */

  loginContainer: {
    alignItems: 'center',
    marginTop: 'auto',
    paddingTop: 32,
  },

  loginText: {
    color: COLORS.muted,
    fontSize: 14,
    textAlign: 'center',
  },

  loginLink: {
    color: COLORS.link,
    fontWeight: '600',
  },
});

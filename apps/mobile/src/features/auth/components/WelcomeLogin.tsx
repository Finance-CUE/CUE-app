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

import { GoogleLogo } from '@/components/GoogleLogo';
import { validateIndianMobileNumber } from '@/features/auth/utils/phoneValidation';

interface WelcomeLoginProps {
  onContinue: (phoneNumber: string, password: string) => void;
  onGooglePress: () => void;
  onSignupPress: () => void;
  isSubmitting?: boolean;
  submitError?: string | null;
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

export function WelcomeLogin({
  onContinue,
  onGooglePress,
  onSignupPress,
  isSubmitting = false,
  submitError = null,
}: WelcomeLoginProps) {
  const insets = useSafeAreaInsets();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const handlePhoneChange = (value: string) => {
    setPhoneNumber(value);

    // Don't immediately show an error while the user is typing.
    // Clear the previous error once they start correcting the number.
    if (phoneError) {
      setPhoneError('');
    }
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);

    if (passwordError) {
      setPasswordError('');
    }
  };

  const handleContinue = () => {
    if (isSubmitting) {
      return;
    }

    const validation = validateIndianMobileNumber(phoneNumber);

    if (!validation.isValid) {
      setPhoneError(validation.message ?? 'Please enter a valid mobile number.');
      return;
    }

    setPhoneError('');

    // Length is the only client-side check on login. Anything stricter would
    // reject users whose password predates a future policy change - the server
    // is what decides whether a password is correct.
    if (!password) {
      setPasswordError('Please enter your password.');
      return;
    }

    setPasswordError('');

    onContinue(phoneNumber.trim(), password);
  };

  const hasError = Boolean(phoneError);
  const isDisabled = isSubmitting || !phoneNumber || !password;

  return (
    <View style={styles.screen}>
      {/* ─────────────────────────────────────
          VERTICAL BRAND GRADIENT
      ───────────────────────────────────── */}

      <LinearGradient
        pointerEvents="none"
        colors={[
          'rgba(250,248,246,0)',
          'rgba(229,223,243,0.15)',
          'rgba(229,223,243,0.35)',
          'rgba(242,221,210,0.55)',
        ]}
        locations={[0, 0.45, 0.75, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.bottomAmbientGradient}
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
          {/* ─────────────────────────────────────
              HERO
          ───────────────────────────────────── */}

          <LinearGradient
            colors={['#8D80CC', '#B695C8', '#E6A07E']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.hero}
          >
            <View style={styles.orbitLarge} />
            <View style={styles.orbitSmall} />

            <View style={styles.clock}>
              <View style={styles.minuteHand} />
              <View style={styles.hourHand} />
            </View>

            <View style={styles.dotOne} />
            <View style={styles.dotTwo} />
          </LinearGradient>

          {/* ─────────────────────────────────────
              INTRO
          ───────────────────────────────────── */}

          <View style={styles.introduction}>
            <Text style={styles.eyebrow}>
              WELCOME
            </Text>

            <Text style={styles.title}>
              Money,{' '}
              <Text style={styles.titleAccent}>
                understood.
              </Text>
            </Text>

            <Text style={styles.description}>
              A gentle space to track patterns, understand your habits, and
              build an empathetic relationship with your finances.
            </Text>
          </View>

          {/* ─────────────────────────────────────
              AUTH
          ───────────────────────────────────── */}

          <View style={styles.form}>
            {/* Phone */}

            <View
              style={[
                styles.phoneInput,
                hasError && styles.phoneInputError,
              ]}
            >
              <Text style={styles.countryCode}>
                +91
              </Text>

              <View
                style={[
                  styles.phoneDivider,
                  hasError && styles.phoneDividerError,
                ]}
              />

              <TextInput
                style={styles.input}
                placeholder="Enter mobile number"
                placeholderTextColor="#A9A3AE"
                keyboardType="phone-pad"
                maxLength={10}
                textContentType="telephoneNumber"
                autoComplete="tel"
                value={phoneNumber}
                onChangeText={handlePhoneChange}
                returnKeyType="next"
              />
            </View>

            {/* Validation error */}

            {hasError && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorIcon}>!</Text>

                <Text style={styles.errorText}>
                  {phoneError}
                </Text>
              </View>
            )}

            {/* Password */}

            <View
              style={[
                styles.passwordInput,
                Boolean(passwordError) && styles.phoneInputError,
              ]}
            >
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#A9A3AE"
                secureTextEntry={!isPasswordVisible}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                autoComplete="current-password"
                value={password}
                onChangeText={handlePasswordChange}
                onSubmitEditing={handleContinue}
                returnKeyType="done"
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

            {Boolean(passwordError) && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorIcon}>!</Text>

                <Text style={styles.errorText}>
                  {passwordError}
                </Text>
              </View>
            )}

            {/* Server-side failure */}

            {Boolean(submitError) && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorIcon}>!</Text>

                <Text style={styles.errorText}>
                  {submitError}
                </Text>
              </View>
            )}

            {/* Continue */}

            <TouchableOpacity
              activeOpacity={0.85}
              disabled={isDisabled}
              style={[
                styles.primaryButton,
                isDisabled && styles.primaryButtonDisabled,
              ]}
              onPress={handleContinue}
            >
              {isSubmitting ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>
                    Continue
                  </Text>

                  <View style={styles.arrowContainer}>
                    <Text style={styles.arrow}>
                      →
                    </Text>
                  </View>
                </>
              )}
            </TouchableOpacity>

            {/* Google */}

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.googleButton}
              onPress={onGooglePress}
            >
              <GoogleLogo size={21} />

              <Text style={styles.googleButtonText}>
                Continue with Google
              </Text>
            </TouchableOpacity>

            {/* Divider */}

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />

              <Text style={styles.orText}>
                OR
              </Text>

              <View style={styles.dividerLine} />
            </View>

            {/* Signup */}

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onSignupPress}
            >
              <Text style={styles.signupText}>
                Don't have an account?{' '}
                <Text style={styles.signupLink}>
                  Sign up
                </Text>
              </Text>
            </TouchableOpacity>
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

  bottomAmbientGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 190,
    zIndex: 0,
  },

  /* HERO */

  hero: {
    width: '100%',
    height: 160,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  orbitLarge: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    bottom: -210,
    left: -80,
  },

  orbitSmall: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    bottom: -155,
    left: 30,
  },

  clock: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },

  minuteHand: {
    position: 'absolute',
    width: 2,
    height: 19,
    backgroundColor: COLORS.white,
    borderRadius: 2,
    top: 10,
    left: 27,
  },

  hourHand: {
    position: 'absolute',
    width: 2,
    height: 15,
    backgroundColor: COLORS.white,
    borderRadius: 2,
    top: 27,
    left: 27,
    transform: [{ rotate: '135deg' }],
  },

  dotOne: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.65)',
    top: 36,
    left: 80,
  },

  dotTwo: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.55)',
    bottom: 35,
    right: 70,
  },

  /* INTRO */

  introduction: {
    alignItems: 'center',
    marginTop: 27,
  },

  eyebrow: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.6,
    color: COLORS.mutedLight,
    marginBottom: 9,
  },

  title: {
    fontSize: 34,
    lineHeight: 42,
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : undefined,
    letterSpacing: -0.6,
    textAlign: 'center',
  },

  titleAccent: {
    color: COLORS.purple,
    fontStyle: 'italic',
  },

  description: {
    marginTop: 12,
    width: '100%',
    maxWidth: 335,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.muted,
    letterSpacing: 0.05,
  },

  /* FORM */

  form: {
    marginTop: 28,
  },

  phoneInput: {
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

  phoneInputError: {
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

  phoneDividerError: {
    backgroundColor: 'rgba(198,95,104,0.35)',
  },

  passwordInput: {
    height: 52,
    width: '100%',
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 26,
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
  },

  passwordToggle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.link,
    marginLeft: 10,
  },

  input: {
    flex: 1,
    height: 52,
    paddingVertical: 0,
    fontSize: 14,
    color: COLORS.text,
  },

  /* ERROR */

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

  /* PRIMARY BUTTON */

  primaryButton: {
    height: 52,
    width: '100%',
    marginTop: 12,
    borderRadius: 26,
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
    letterSpacing: 0.1,
  },

  arrowContainer: {
    position: 'absolute',
    right: 20,
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },

  arrow: {
    color: COLORS.purpleLight,
    fontSize: 22,
    lineHeight: 22,
  },

  /* GOOGLE */

  googleButton: {
    height: 52,
    width: '100%',
    marginTop: 10,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  googleButtonText: {
    marginLeft: 10,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '500',
  },

  /* DIVIDER */

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 25,
    marginBottom: 23,
  },

  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.divider,
  },

  orText: {
    marginHorizontal: 15,
    color: '#A19AA6',
    fontSize: 12,
  },

  /* SIGNUP */

  signupText: {
    textAlign: 'center',
    color: COLORS.muted,
    fontSize: 14,
  },

  signupLink: {
    color: COLORS.link,
    fontWeight: '600',
  },
});
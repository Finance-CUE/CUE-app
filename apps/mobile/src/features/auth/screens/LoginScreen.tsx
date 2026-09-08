import { LinearGradient } from 'expo-linear-gradient';
import {
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

interface LoginScreenProps {
  onBack: () => void;
  onContinue: (phoneNumber: string) => void;
  onGooglePress: () => void;
  onSignupPress: () => void;
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
};

export function LoginScreen({
  onBack,
  onContinue,
  onGooglePress,
  onSignupPress,
}: LoginScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      {/* Subtle vertical CUE background treatment */}
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
            <Text style={styles.eyebrow}>WELCOME BACK</Text>

            <Text style={styles.title}>Log in</Text>

            <Text style={styles.description}>
              Continue your journey toward a better relationship with money.
            </Text>
          </View>

          {/* Form */}

          <View style={styles.form}>
            <Text style={styles.inputLabel}>Mobile number</Text>

            <View style={styles.phoneInput}>
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
              />
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.primaryButton}
              onPress={() => onContinue('')}
            >
              <Text style={styles.primaryButtonText}>Continue</Text>

              <View style={styles.arrowContainer}>
                <Text style={styles.arrow}>→</Text>
              </View>
            </TouchableOpacity>

            {/* Divider */}

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />

              <Text style={styles.orText}>OR</Text>

              <View style={styles.dividerLine} />
            </View>

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
          </View>

          {/* Signup */}

          <View style={styles.signupContainer}>
            <Text style={styles.signupText}>
              Don't have an account?{' '}
              <Text
                style={styles.signupLink}
                onPress={onSignupPress}
              >
                Sign up
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
    marginTop: 52,
  },

  eyebrow: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.6,
    color: COLORS.mutedLight,
    marginBottom: 10,
  },

  title: {
    fontSize: 36,
    lineHeight: 44,
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : undefined,
    letterSpacing: -0.7,
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
    marginTop: 42,
  },

  inputLabel: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '600',
    marginBottom: 9,
    marginLeft: 4,
  },

  phoneInput: {
    height: 54,
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 27,
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
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
    height: 54,
    paddingVertical: 0,
    fontSize: 14,
    color: COLORS.text,
  },

  /* Primary */

  primaryButton: {
    height: 54,
    width: '100%',
    marginTop: 13,
    borderRadius: 27,
    backgroundColor: COLORS.text,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
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

  /* Divider */

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 30,
    marginBottom: 20,
  },

  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.divider,
  },

  orText: {
    marginHorizontal: 15,
    fontSize: 11,
    color: COLORS.mutedLight,
    letterSpacing: 0.5,
  },

  /* Google */

  googleButton: {
    height: 54,
    width: '100%',
    borderRadius: 27,
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

  /* Signup */

  signupContainer: {
    alignItems: 'center',
    marginTop: 'auto',
    paddingTop: 48,
  },

  signupText: {
    color: COLORS.muted,
    fontSize: 14,
    textAlign: 'center',
  },

  signupLink: {
    color: COLORS.link,
    fontWeight: '600',
  },
});
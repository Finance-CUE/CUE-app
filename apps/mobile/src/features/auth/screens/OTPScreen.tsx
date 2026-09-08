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

interface OTPScreenProps {
  phoneNumber: string;
  onBack: () => void;
  onVerify: (otp: string) => void;
  onResend: () => void;
}

const COLORS = {
  background: '#FAF8F6',
  text: '#292531',
  muted: '#918C95',
  mutedLight: '#A29CA8',
  border: '#D0CBD2',
  purple: '#8172C7',
  white: '#FFFFFF',
};

export function OTPScreen({
  phoneNumber,
  onBack,
  onVerify,
  onResend,
}: OTPScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: insets.top + 12,
              paddingBottom: insets.bottom + 28,
            },
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onBack}
            style={styles.backButton}
          >
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.eyebrow}>VERIFICATION</Text>

            <Text style={styles.title}>Check your phone</Text>

            <Text style={styles.description}>
              We sent a verification code to
            </Text>

            <Text style={styles.phone}>
              +91 {phoneNumber || 'your mobile number'}
            </Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.inputLabel}>Verification code</Text>

            <TextInput
              style={styles.otpInput}
              placeholder="Enter 6-digit code"
              placeholderTextColor="#A9A3AE"
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
              autoFocus
              onChangeText={(value) => {
                if (value.length === 6) {
                  onVerify(value);
                }
              }}
            />

            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.primaryButton}
              onPress={() => onVerify('')}
            >
              <Text style={styles.primaryButtonText}>Verify</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onResend}
              style={styles.resendButton}
            >
              <Text style={styles.resendText}>
                Didn't receive the code?{' '}
                <Text style={styles.resendLink}>Resend</Text>
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
  },

  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },

  backButton: {
    height: 42,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
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

  header: {
    alignItems: 'center',
    marginTop: 65,
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
    textAlign: 'center',
  },

  description: {
    marginTop: 14,
    fontSize: 14,
    color: COLORS.muted,
  },

  phone: {
    marginTop: 5,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },

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

  otpInput: {
    height: 58,
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 29,
    backgroundColor: COLORS.white,
    fontSize: 20,
    letterSpacing: 6,
    color: COLORS.text,
  },

  primaryButton: {
    height: 54,
    width: '100%',
    marginTop: 13,
    borderRadius: 27,
    backgroundColor: COLORS.text,
    alignItems: 'center',
    justifyContent: 'center',
  },

  primaryButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '600',
  },

  resendButton: {
    alignItems: 'center',
    marginTop: 24,
  },

  resendText: {
    color: COLORS.muted,
    fontSize: 14,
  },

  resendLink: {
    color: COLORS.purple,
    fontWeight: '600',
  },
});
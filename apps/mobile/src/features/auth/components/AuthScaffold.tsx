/**
 * Shared layout and controls for the smaller auth screens (verify email,
 * forgot password, add phone). Same look as the login and signup screens.
 */

import { type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const AUTH_COLORS = {
  background: '#FAF8F6',
  text: '#292531',
  muted: '#918C95',
  mutedLight: '#A29CA8',
  border: '#D0CBD2',
  link: '#8172C7',
  white: '#FFFFFF',
  error: '#C65F68',
  errorBackground: '#FFF5F5',
  success: '#5E8C6A',
  successBackground: '#F1F7F2',
};

export function AuthScaffold({
  eyebrow,
  title,
  description,
  emphasis,
  onBack,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  /** Shown bold under the description, e.g. the email a code went to. */
  emphasis?: string;
  onBack?: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 },
          ]}>
          {onBack ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Back"
              activeOpacity={0.7}
              onPress={onBack}
              style={styles.backButton}>
              <Text style={styles.backArrow}>‹</Text>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.backButton} />
          )}

          <View style={styles.header}>
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Text style={styles.description}>{description}</Text>
            {emphasis ? <Text style={styles.emphasis}>{emphasis}</Text> : null}
          </View>

          <View style={styles.form}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export function AuthField({
  label,
  invalid,
  secure,
  style,
  ...input
}: TextInputProps & { label: string; invalid?: boolean; secure?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputBox, invalid && styles.inputBoxError]}>
        <TextInput
          placeholderTextColor="#A9A3AE"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={secure && !visible}
          style={[styles.input, style]}
          {...input}
        />
        {secure ? (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setVisible((v) => !v)}
            hitSlop={10}>
            <Text style={styles.toggle}>{visible ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export function AuthButton({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const off = disabled || loading;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      activeOpacity={0.85}
      disabled={off}
      onPress={onPress}
      style={[styles.button, off && styles.buttonDisabled]}>
      {loading ? (
        <ActivityIndicator color={AUTH_COLORS.white} />
      ) : (
        <Text style={styles.buttonText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

export function AuthMessage({ message, tone = 'error' }: { message: string | null; tone?: 'error' | 'success' }) {
  if (!message) return null;
  const success = tone === 'success';
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.message, success ? styles.messageSuccess : styles.messageError]}>
      <Text style={[styles.messageText, { color: success ? AUTH_COLORS.success : AUTH_COLORS.error }]}>
        {message}
      </Text>
    </View>
  );
}

export function AuthLink({
  prompt,
  label,
  onPress,
  disabled,
}: {
  prompt?: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      activeOpacity={0.7}
      disabled={disabled}
      onPress={onPress}
      style={styles.linkRow}>
      <Text style={styles.linkPrompt}>
        {prompt ? `${prompt} ` : ''}
        <Text style={[styles.link, disabled && styles.linkDisabled]}>{label}</Text>
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AUTH_COLORS.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24 },
  backButton: { height: 42, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center' },
  backArrow: { fontSize: 28, lineHeight: 28, color: AUTH_COLORS.text, marginRight: 6, marginTop: -2 },
  backText: { fontSize: 14, color: AUTH_COLORS.muted, fontWeight: '500' },
  header: { alignItems: 'center', marginTop: 40 },
  eyebrow: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.6,
    color: AUTH_COLORS.mutedLight,
    marginBottom: 10,
  },
  title: {
    fontSize: 32,
    lineHeight: 40,
    color: AUTH_COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : undefined,
    textAlign: 'center',
  },
  description: {
    marginTop: 14,
    fontSize: 14,
    lineHeight: 21,
    color: AUTH_COLORS.muted,
    textAlign: 'center',
    maxWidth: 320,
  },
  emphasis: { marginTop: 5, fontSize: 14, fontWeight: '600', color: AUTH_COLORS.text },
  form: { marginTop: 36, gap: 14 },
  field: { gap: 8 },
  label: { fontSize: 13, color: AUTH_COLORS.text, fontWeight: '600', marginLeft: 4 },
  inputBox: {
    height: 54,
    borderWidth: 1,
    borderColor: AUTH_COLORS.border,
    borderRadius: 27,
    backgroundColor: AUTH_COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  inputBoxError: { borderColor: AUTH_COLORS.error, backgroundColor: AUTH_COLORS.errorBackground },
  input: { flex: 1, height: 54, paddingVertical: 0, fontSize: 15, color: AUTH_COLORS.text },
  toggle: { fontSize: 13, fontWeight: '600', color: AUTH_COLORS.link, marginLeft: 10 },
  button: {
    height: 54,
    borderRadius: 27,
    backgroundColor: AUTH_COLORS.text,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: AUTH_COLORS.white, fontSize: 15, fontWeight: '600' },
  message: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  messageError: { backgroundColor: AUTH_COLORS.errorBackground },
  messageSuccess: { backgroundColor: AUTH_COLORS.successBackground },
  messageText: { fontSize: 13, lineHeight: 19 },
  linkRow: { alignItems: 'center', paddingVertical: 10 },
  linkPrompt: { color: AUTH_COLORS.muted, fontSize: 14, textAlign: 'center' },
  link: { color: AUTH_COLORS.link, fontWeight: '600' },
  linkDisabled: { color: AUTH_COLORS.mutedLight },
});

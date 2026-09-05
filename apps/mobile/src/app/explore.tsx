import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthStore } from '@/features/auth/store';

/**
 * Placeholder landing screen for anything that has no real next page yet.
 *
 * Signup and login both redirect here. It exists so a flow under development
 * terminates somewhere that shows who is signed in and can sign them back out -
 * without a sign-out the keychain keeps you authenticated across reloads and
 * `index.tsx` redirects past the login screen forever.
 */
export default function DevLandingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);
  const signOut = useAuthStore((state) => state.signOut);

  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    // signOut swallows upstream failures and clears local tokens regardless,
    // so there is no error path to surface here.
    await signOut();
    router.replace('/');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
      <Text style={styles.heading}>Signed in</Text>
      <Text style={styles.subheading}>
        Placeholder screen. Replace with the real destination when it exists.
      </Text>

      <View style={styles.card}>
        <Field label="Name" value={user?.full_name} />
        <Field label="Phone" value={user?.phone} />
        <Field label="Email" value={user?.contact_email} />
        <Field label="User ID" value={user?.id} />
        <Field
          label="Phone verified"
          value={user ? String(user.phone_verified) : undefined}
        />
        <Field label="Auth status" value={status} />
      </View>

      {/*
        Static style array, not the `({ pressed }) => ...` form: NativeWind's
        interop wraps Pressable and drops function styles, which renders the
        button invisible - white label on the cream background.
      */}
      <Pressable
        accessibilityRole="button"
        disabled={isSigningOut}
        onPress={handleSignOut}
        android_ripple={{ color: '#1B6FBF' }}
        style={[styles.button, isSigningOut && styles.buttonDisabled]}>
        {isSigningOut ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonLabel}>Sign out</Text>
        )}
      </Pressable>
    </View>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue} selectable>
        {value || '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    backgroundColor: '#FAF8F6',
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111111',
  },
  subheading: {
    marginTop: 6,
    fontSize: 14,
    color: '#6B6B6B',
  },
  card: {
    marginTop: 28,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E4E0',
  },
  field: {
    paddingVertical: 8,
  },
  fieldLabel: {
    fontSize: 12,
    color: '#8A8A8A',
  },
  fieldValue: {
    marginTop: 2,
    fontSize: 15,
    color: '#111111',
  },
  button: {
    marginTop: 32,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#208AEF',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

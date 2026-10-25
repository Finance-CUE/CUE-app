import { useNavigation, useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import {
  completeAssessment,
  fetchProgress,
  fetchResult,
  saveAnswer,
} from '@/features/assessment/api';
import {
  LIKERT_OPTIONS,
  MONEY_WHY_OPTIONS,
  MONEY_WHY_PART,
  MONEY_WHY_PROMPT,
  QUESTIONS,
  type MoneyWhy,
} from '@/features/assessment/questions';
import { AnalyzingScreen } from '@/features/assessment/screens/AnalyzingScreen';
import { IntroScreen } from '@/features/assessment/screens/IntroScreen';
import { QuestionScreen } from '@/features/assessment/screens/QuestionScreen';
import { ResultsScreen } from '@/features/assessment/screens/ResultsScreen';
import { useAssessmentStore } from '@/features/assessment/store';
import { COLORS } from '@/features/assessment/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AssessmentResult } from '@/features/assessment/types';
import { useAuthStore } from '@/features/auth/store';
import { toErrorMessage } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';

type Phase = 'loading' | 'intro' | 'question' | 'analyzing' | 'results' | 'failed';

const MIN_ANALYZING_MS = 1500;
// Index 0-17 are the scored questions; index 18 is Q19 (Money Why).
const MONEY_WHY_INDEX = QUESTIONS.length;
const TOTAL_STEPS = QUESTIONS.length + 1;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function AssessmentFlowScreen({ retake = false }: { retake?: boolean }) {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const clearPending = useAssessmentStore((state) => state.clear);

  const [phase, setPhase] = useState<Phase>('loading');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [moneyWhy, setMoneyWhy] = useState<MoneyWhy | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const inFlight = useRef(false);
  const signOut = useAuthStore((state) => state.signOut);

  // First-time signup cannot back out of the quiz (Android back swallowed; iOS
  // swipe-back disabled on the route in _layout.tsx). A retake can.
  useEffect(() => {
    if (retake) {
      navigation.setOptions({ gestureEnabled: true });
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, [retake, navigation]);

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      if (retake) {
        // Retake starts clean: ignore the existing result and any saved progress.
        setAnswers({});
        setMoneyWhy(null);
        setIndex(0);
        setPhase('intro');
        return;
      }

      // A result already exists when the app was killed after `complete`
      // succeeded but before the pending flag was cleared.
      const existing = await fetchResult();
      if (existing) {
        await clearPending();
        setResult(existing);
        setPhase('results');
        return;
      }

      const saved = await fetchProgress();
      const savedAnswers = Object.fromEntries(saved.map((item) => [item.question_id, item.response]));
      const firstUnanswered = QUESTIONS.findIndex((question) => savedAnswers[question.id] === undefined);

      setAnswers(savedAnswers);
      setIndex(firstUnanswered === -1 ? MONEY_WHY_INDEX : firstUnanswered);
      setPhase(saved.length === 0 ? 'intro' : 'question');
    } catch {
      setPhase('failed');
    }
  }, [clearPending, retake]);

  useEffect(() => {
    load();
  }, [load]);

  const handleContinue = async () => {
    // A ref, not isSubmitting: state is stale between renders, so two fast taps
    // would both pass a state check and send two requests.
    if (inFlight.current) {
      return;
    }

    inFlight.current = true;
    setError(null);
    setIsSubmitting(true);

    try {
      if (index < MONEY_WHY_INDEX) {
        const question = QUESTIONS[index];
        await saveAnswer(question.id, answers[question.id]);
        setIndex(index + 1);
      } else if (moneyWhy) {
        setPhase('analyzing');
        const [finished] = await Promise.all([completeAssessment(moneyWhy), wait(MIN_ANALYZING_MS)]);
        await clearPending();
        await queryClient.invalidateQueries({ queryKey: ['assessment', 'result'] });
        setResult(finished);
        setPhase('results');
      }
    } catch (caught) {
      setError(toErrorMessage(caught, 'Could not save your answer. Please try again.'));
      setPhase('question');
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
  };

  if (phase === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.purple} />
      </View>
    );
  }

  if (phase === 'failed') {
    return (
      <View style={styles.center}>
        <Text style={styles.failedText}>Could not load your assessment.</Text>
        <TouchableOpacity accessibilityRole="button" onPress={load} style={styles.retry}>
          <Text style={styles.retryLabel}>Try again</Text>
        </TouchableOpacity>
        {/* Back is disabled in the quiz, so a persistent failure needs its own way out. */}
        <TouchableOpacity
          accessibilityRole="button"
          onPress={async () => {
            await signOut();
            router.replace('/');
          }}
          style={styles.signOut}>
          <Text style={styles.signOutLabel}>Sign out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Retake only: a way out of the quiz.
  const withCancel = (screen: ReactNode) =>
    retake ? (
      <View style={{ flex: 1 }}>
        {screen}
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => router.back()}
          style={[styles.cancel, { top: insets.top + 8 }]}>
          <Text style={styles.signOutLabel}>Cancel</Text>
        </TouchableOpacity>
      </View>
    ) : (
      screen
    );

  if (phase === 'intro') {
    return withCancel(<IntroScreen onStart={() => setPhase('question')} />);
  }

  if (phase === 'analyzing') {
    return <AnalyzingScreen />;
  }

  if (phase === 'results' && result) {
    return <ResultsScreen result={result} onEnter={() => (retake ? router.back() : router.replace('/today'))} />;
  }

  if (index === MONEY_WHY_INDEX) {
    return withCancel(
      <QuestionScreen
        part={MONEY_WHY_PART}
        step={TOTAL_STEPS}
        total={TOTAL_STEPS}
        question={MONEY_WHY_PROMPT}
        options={MONEY_WHY_OPTIONS}
        selected={moneyWhy}
        onSelect={setMoneyWhy}
        onContinue={handleContinue}
        isSubmitting={isSubmitting}
        error={error}
      />,
    );
  }

  const question = QUESTIONS[index];

  return withCancel(
    <QuestionScreen
      part={question.part}
      step={index + 1}
      total={TOTAL_STEPS}
      question={question.text}
      options={LIKERT_OPTIONS}
      selected={answers[question.id] ?? null}
      onSelect={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
      onContinue={handleContinue}
      isSubmitting={isSubmitting}
      error={error}
    />,
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
  },
  failedText: { fontSize: 16, color: COLORS.muted, textAlign: 'center' },
  retry: {
    marginTop: 20,
    height: 48,
    paddingHorizontal: 32,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.text,
  },
  retryLabel: { fontSize: 15, fontWeight: '600', color: COLORS.white },
  cancel: { position: 'absolute', right: 16, height: 44, paddingHorizontal: 8, justifyContent: 'center' },
  signOut: { marginTop: 12, height: 44, justifyContent: 'center' },
  signOutLabel: { fontSize: 14, color: COLORS.muted },
});

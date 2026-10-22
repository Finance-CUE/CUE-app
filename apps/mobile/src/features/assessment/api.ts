import axios from 'axios';

import { api } from '@/lib/api';
import type { MoneyWhy } from '@/features/assessment/questions';
import type { AnswerItem, AssessmentResult } from '@/features/assessment/types';

export async function saveAnswer(questionId: number, response: number): Promise<void> {
  await api.put(`/assessment/answers/${questionId}`, { response });
}

export async function fetchProgress(): Promise<AnswerItem[]> {
  const result = await api.get<{ answers: AnswerItem[] }>('/assessment/progress');
  return result.data.answers;
}

export async function completeAssessment(moneyWhy: MoneyWhy): Promise<AssessmentResult> {
  const result = await api.post<AssessmentResult>('/assessment/complete', {
    money_why: moneyWhy,
  });
  return result.data;
}

/** The latest result, or null when the user has not finished the assessment. */
export async function fetchResult(): Promise<AssessmentResult | null> {
  try {
    const result = await api.get<AssessmentResult>('/assessment/result');
    return result.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

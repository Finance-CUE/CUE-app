export interface Question {
  id: number;
  part: string;
  text: string;
}

const STORY = 'Your Money Story';
const FUTURE = 'Your Money Future';
const BARRIERS = 'Your Money Barriers';

// Dimension and reverse-scoring live on the server only. The client sends the
// raw 1-5 answer for a question id and nothing else.
export const QUESTIONS: Question[] = [
  { id: 1, part: STORY, text: 'My relationship with money makes a lot more sense once you meet my family.' },
  { id: 2, part: STORY, text: 'The way I grew up still affects what feels “normal” to spend on.' },
  { id: 3, part: STORY, text: 'Some of my money habits are basically family traditions at this point.' },
  { id: 4, part: STORY, text: 'Sometimes I’m shopping for my personality, not my needs.' },
  { id: 5, part: STORY, text: 'Sometimes it’s not the thing I want, it’s the life that comes with it.' },
  { id: 6, part: STORY, text: 'I’ve bought things for the life I’m hoping to have one day.' },
  { id: 7, part: FUTURE, text: 'I know I should be saving more. I just haven’t started yet.' },
  { id: 8, part: FUTURE, text: 'I find it genuinely easy to say no to things that don’t fit my financial goals.' },
  { id: 9, part: FUTURE, text: 'I’m more “figure it out as I go” than “have a plan.”' },
  { id: 10, part: FUTURE, text: 'Financial structure actually makes me feel more in control.' },
  { id: 11, part: FUTURE, text: 'I believe I can get better at managing money, even if I’m not great at it today.' },
  { id: 12, part: FUTURE, text: 'When it comes to money, I’d rather take action than keep putting things off.' },
  { id: 13, part: BARRIERS, text: 'Sometimes I buy first and let my bank account deal with it later.' },
  { id: 14, part: BARRIERS, text: 'My mood and my spending are weirdly in sync.' },
  { id: 15, part: BARRIERS, text: 'When I’m bored, I’m much more likely to spend impulsively.' },
  { id: 16, part: BARRIERS, text: 'Sometimes I pretend my finances don’t exist until I feel better.' },
  { id: 17, part: BARRIERS, text: 'Sometimes I put my finances on “Do Not Disturb.”' },
  { id: 18, part: BARRIERS, text: 'I put off money tasks more than I’d like to admit.' },
];

export const LIKERT_OPTIONS = [
  { value: 1, label: 'Strongly disagree' },
  { value: 2, label: 'Disagree' },
  { value: 3, label: 'Neutral' },
  { value: 4, label: 'Agree' },
  { value: 5, label: 'Strongly agree' },
];

export const MONEY_WHY_PART = 'Your Money Why';
export const MONEY_WHY_PROMPT = 'If money could guarantee you ONE thing for life, what would you choose?';

// Values must match the backend `MoneyWhy` literal exactly.
export type MoneyWhy =
  | 'peace'
  | 'freedom'
  | 'stability'
  | 'status'
  | 'comfort'
  | 'excitement'
  | 'belonging'
  | 'control'
  | 'possibility'
  | 'security';

export const MONEY_WHY_OPTIONS: { value: MoneyWhy; label: string }[] = [
  { value: 'peace', label: 'Peace' },
  { value: 'freedom', label: 'Freedom' },
  { value: 'stability', label: 'Stability' },
  { value: 'status', label: 'Status' },
  { value: 'comfort', label: 'Comfort' },
  { value: 'excitement', label: 'Excitement' },
  { value: 'belonging', label: 'Belonging' },
  { value: 'control', label: 'Control' },
  { value: 'possibility', label: 'Possibility' },
  { value: 'security', label: 'Security' },
];

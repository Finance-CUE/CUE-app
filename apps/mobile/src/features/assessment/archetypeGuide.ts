/**
 * Display copy and colours for the ten CUE archetypes and six dimensions, drawn
 * from the CUE Archetype Bible. The server owns the name, description, strengths
 * and blind spots; this adds what the bible says each pattern needs and where it
 * grows, so the profile reads as "the pattern CUE sees now", never a verdict.
 */

export type ArchetypeGuide = {
  /** Primary and soft colour from the archetype colour table. */
  color: string;
  soft: string;
  /** The question this archetype's dashboard answers. */
  question: string;
  coreNeed: string;
  motivation: string;
  growth: string;
  /** The one belief CUE keeps reinforcing for this pattern. */
  belief: string;
};

const FALLBACK: ArchetypeGuide = {
  color: '#8D80CC',
  soft: '#D9D4F0',
  question: 'What does my money say about me?',
  coreNeed: 'Clarity about your own patterns.',
  motivation: 'Understanding how you make money decisions.',
  growth: 'Keep logging. CUE learns your pattern from what you actually do.',
  belief: 'Small, steady steps change your money more than big resolutions.',
};

export const ARCHETYPE_GUIDES: Record<string, ArchetypeGuide> = {
  dreamer: {
    color: '#6B8FB8',
    soft: '#B7CBE3',
    question: 'How much closer am I to the life I want?',
    coreNeed: 'Freedom with direction: knowing each step moves you toward the life you imagine.',
    motivation: 'Possibility. Money is a bridge between today and the future you can already see.',
    growth: 'Turn big dreams into small, repeated actions: a named goal, a fixed weekly amount, a quick check-in.',
    belief: 'Every small decision shapes the future you are working toward.',
  },
  comfort_spender: {
    color: '#C97863',
    soft: '#E8B8A8',
    question: 'How am I taking care of myself today, emotionally and financially?',
    coreNeed: 'Emotional security with financial stability, so comfort and savings stop competing.',
    motivation: 'Feeling okay. Spending often steadies a hard day or celebrates a good one.',
    growth: 'Notice the feeling before the purchase, and give comfort a planned place in your budget.',
    belief: 'Taking care of your finances is another way of taking care of yourself.',
  },
  social_spender: {
    color: '#D6A43B',
    soft: '#F1D78C',
    question: 'How can I keep enjoying life with my people while protecting my future?',
    coreNeed: 'Connection with balance: being generous without your own goals paying for it.',
    motivation: 'Belonging. Money is how you show up for people and make shared memories.',
    growth: 'Plan for celebrations, gifts and outings ahead of time instead of saying yes and budgeting later.',
    belief: 'The strongest relationships grow through presence and care, not how much you spend.',
  },
  thrill_chaser: {
    color: '#168C8C',
    soft: '#8CC9C4',
    question: 'What opportunities am I unlocking next?',
    coreNeed: 'Freedom with flexibility: room to explore, on a base that keeps you safe.',
    motivation: 'Novelty and discovery. New experiences and ideas are what make money worth having.',
    growth: 'Give curiosity its own budget, and let a 24-hour pause sort lasting opportunities from passing ones.',
    belief: 'The strongest explorers build the strongest base camps.',
  },
  prepared_one: {
    color: '#3E6B56',
    soft: '#A9C3B3',
    question: 'Am I on track?',
    coreNeed: 'Security with confidence: trusting that your systems already have you covered.',
    motivation: 'Peace of mind. Planning ahead means you are ready for whatever comes.',
    growth: 'Notice when preparation is already enough, and let it support your next step or a planned treat.',
    belief: 'Preparation gives you confidence. Confidence lets you move forward.',
  },
  optimizer: {
    color: '#394A8A',
    soft: '#AAB4DA',
    question: 'Where can I make the biggest improvement today?',
    coreNeed: 'Progress with perspective: knowing which improvements matter and which can wait.',
    motivation: 'Making systems work better. Small gains compound into big results.',
    growth: 'Focus on high-impact changes and keep systems simple enough to run without you.',
    belief: 'Optimisation succeeds when it disappears into the background.',
  },
  outrunner: {
    color: '#667788',
    soft: '#C2CBD3',
    question: 'How much closer am I to my biggest goal?',
    coreNeed: 'Growth with sustainability: progress that lasts without burning you out.',
    motivation: 'Achievement. Money is fuel for the next milestone and the bigger life after it.',
    growth: 'Pause to count what you have already built, and protect rest and relationships along the way.',
    belief: 'Your ambition is your strength. Sustainability is what makes it unstoppable.',
  },
  curator: {
    color: '#7A3545',
    soft: '#D8A5AF',
    question: 'Am I living in line with what matters most?',
    coreNeed: 'Alignment with authenticity: money that reflects your values, not anyone else’s.',
    motivation: 'Meaning. You would rather choose better than have more.',
    growth: 'Let patterns, not every single purchase, carry your values, and let those values grow with you.',
    belief: 'Money has its greatest value when it supports what matters most to you.',
  },
  autopilot: {
    color: '#7B8060',
    soft: '#C9C9A8',
    question: 'Is everything okay?',
    coreNeed: 'Awareness without effort: hearing only what needs you, when it needs you.',
    motivation: 'Simplicity. Money should quietly work in the background of a busy life.',
    growth: 'A few well-timed check-ins, like raising savings after a raise, beat constant monitoring.',
    belief: 'You don’t have to think about money every day. You need the right systems working for you.',
  },
  survival_saver: {
    color: '#35635F',
    soft: '#8FAEA8',
    question: 'Am I financially safe?',
    coreNeed: 'Lasting security with confidence: trusting the safety net you have built.',
    motivation: 'Protection. Savings mean you can face whatever life brings.',
    growth: 'Once your safety net is ready, let a small part of your money grow or go toward something you value.',
    belief: 'Financial security is the foundation that gives you the freedom to live with confidence.',
  },
};

export const guideFor = (slug: string | undefined): ArchetypeGuide =>
  (slug && ARCHETYPE_GUIDES[slug]) || FALLBACK;

/** The six CUE dimensions, in display order, with a plain-language meaning. */
export const DIMENSIONS: { key: string; label: string; meaning: string }[] = [
  { key: 'future_orientation', label: 'Future orientation', meaning: 'How much tomorrow shapes today’s money choices' },
  { key: 'financial_agency', label: 'Financial agency', meaning: 'How in control of your money you feel' },
  { key: 'present_bias', label: 'Present bias', meaning: 'How strongly “now” wins over “later”' },
  { key: 'identity', label: 'Identity', meaning: 'How much money is tied to who you are' },
  { key: 'family_influence', label: 'Family influence', meaning: 'How much family habits guide your money' },
  { key: 'financial_avoidance', label: 'Financial avoidance', meaning: 'How often money matters get put off' },
];

const BAND_LABELS: Record<string, string> = {
  very_low: 'Very low',
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  very_high: 'Very high',
};

export const bandLabel = (band: string | undefined): string => (band && BAND_LABELS[band]) || '';

/** 0-100 score clamped for a bar width. */
export const barPercent = (score: number | undefined): number =>
  Math.max(0, Math.min(100, Math.round(score ?? 0)));

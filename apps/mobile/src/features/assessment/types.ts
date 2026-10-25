export interface AnswerItem {
  question_id: number;
  response: number;
}

export interface ArchetypeCard {
  slug: string;
  name: string;
  description: string;
  strengths: string[];
  blind_spots: string[];
}

export interface AssessmentResult {
  dimensions: Record<string, number>;
  bands: Record<string, string>;
  primary: ArchetypeCard;
  secondary: ArchetypeCard;
  tertiary: ArchetypeCard;
  scoring_version: string;
  computed_at: string | null;
}

/* Strategy Lab types — PRD §6 + Part B Screen 2/3/4/5 */

export type ParseStage = 'empty' | 'drafting' | 'parsing' | 'clarifying' | 'brief-ready' | 'running';

export type ParameterSource = 'stated' | 'AI' | 'required' | 'default' | 'optional';

export interface ParameterField {
  id: string;
  label: string;
  type: 'number' | 'currency' | 'date' | 'percent' | 'select' | 'multi-select' | 'range' | 'toggle';
  value: unknown;
  source: ParameterSource;
  confidence?: number;    /* 0–1, only for source='AI' */
  defaultValue?: unknown;
  required: boolean;
  options?: { value: unknown; label: string }[];
  unit?: string;
  helpText?: string;
}

export interface ParameterBlock {
  id: 'money_timeline' | 'selection' | 'execution' | 'risk';
  group: string;          /* display label */
  fields: ParameterField[];
}

export interface BriefBullet {
  stage: 'Universe' | 'Eligibility' | 'Screen' | 'Rank' | 'Select';
  text: string;
  citations?: string[];   /* ['Q1', 'Q2'] — links to clarifying questions */
}

export interface ParsedBrief {
  bullets: BriefBullet[];
  confidence: number;     /* 0–1 */
  confidenceLabel: 'High' | 'Medium' | 'Low' | 'Manually edited';
  generatedAt: string;
  parameters: ParameterBlock[];
}

export type QuestionType = 'numeric' | 'single-select' | 'multi-select' | 'range' | 'yes-no' | 'date' | 'free-text';
export type ImpactLevel  = 'high' | 'medium' | 'low';

export interface ClarifyingQuestion {
  id: string;
  impact: ImpactLevel;
  type: QuestionType;
  question: string;
  whyAsk: string;
  highlightedPhrase: string;
  inputConfig: {
    quickPicks?: (string | number)[];
    options?: { value: unknown; label: string }[];
    min?: number;
    max?: number;
    suggestions?: string[];
  };
  defaultValue: unknown;
  defaultLabel: string;
}

export interface QuestionAnswer {
  questionId: string;
  value: unknown;
  source: 'user' | 'default';
}

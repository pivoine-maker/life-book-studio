import type { LifeAnchorPack, LifeBookPage, LifeChoice, LifePersona, LifeState } from "./life";

export type LifeBookRunStatus =
  | "draft"
  | "questionnaire_ready"
  | "decisions_submitted"
  | "writing"
  | "script_ready"
  | "rendering"
  | "completed"
  | "failed";

export type LifeBookRenderStatus = "idle" | "rendering" | "completed" | "failed";
export type LifeBookVideoJobStatus = "idle" | "generating" | "completed" | "failed";

export interface LifeDecisionOption extends LifeChoice {
  hiddenForeshadowing: string;
}

export interface LifeDecisionQuestion {
  questionId: string;
  lifeAge: string;
  stageTitle: string;
  setup: string;
  stakes: string;
  options: LifeDecisionOption[];
}

export interface LifeSelectedDecision {
  questionId: string;
  optionId: string;
}

export interface CompleteLifeChapter {
  chapterId: string;
  chapterIndex: number;
  title: string;
  ageRange: string;
  selectedChoiceLabel: string;
  summary: string;
  fullText: string;
  characterMoment: string;
  emotionalTurn: string;
  consequence: string;
  cliffhanger: string;
  pages: LifeBookPage[];
}

export interface CompleteLifeScript {
  title: string;
  logline: string;
  worldview: string;
  lifeArc: string;
  relationshipArc: string;
  fullText: string;
  chapters: CompleteLifeChapter[];
  ending: string;
  epitaph: string;
  scores: Array<{ label: string; value: number }>;
}

export interface CompleteLifeBook {
  title: string;
  cover?: LifeBookPage;
  pages: LifeBookPage[];
  updatedAt: string;
}

export interface LifeBookRenderJob {
  status: LifeBookRenderStatus;
  totalPages: number;
  generatedPages: number;
  startedAt?: string;
  updatedAt?: string;
  error?: string;
}

export interface LifeBookVideoJob {
  status: LifeBookVideoJobStatus;
  totalClips: number;
  generatedClips: number;
  skippedClips?: number;
  failedClips?: number;
  startedAt?: string;
  updatedAt?: string;
  finalVideoArtifactId?: string;
  finalVideoUrl?: string;
  error?: string;
}

export interface LifeBookRunSnapshot {
  runId: string;
  status: LifeBookRunStatus;
  persona: LifePersona;
  initialState: LifeState;
  questionnaire: LifeDecisionQuestion[];
  selectedDecisions: LifeSelectedDecision[];
  script?: CompleteLifeScript;
  anchorPack?: LifeAnchorPack;
  book?: CompleteLifeBook;
  renderJob?: LifeBookRenderJob;
  videoJob?: LifeBookVideoJob;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface LifeBookSeedResult {
  persona: LifePersona;
  initialState: LifeState;
  questionnaire: LifeDecisionQuestion[];
}

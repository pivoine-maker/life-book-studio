export interface LifePersona {
  title: string;
  era: string;
  location: string;
  identity: string;
  socialClass: string;
  gender?: string;
  birthYear?: string;
  coreTension: string;
  constraints: string[];
  visualStyle: string;
  visualAnchor: string;
}

export interface LifeRelationship {
  name: string;
  role: string;
  attitude: string;
}

export interface LifeState {
  age: number;
  location: string;
  health: number;
  wealth: number;
  reputation: number;
  freedom: number;
  risk: number;
  relationships: LifeRelationship[];
  flags: string[];
}

export interface LifeChoice {
  choiceId: string;
  label: string;
  description: string;
  shortTermTradeoff: string;
  longTermRisk: string;
  worldviewFit: string;
}

export type LifeImageKind = "anchor" | "storybook" | "placeholder";
export type LifeAssetStatus = "pending" | "generating" | "generated" | "failed";

export interface LifeAnchorImage {
  anchorId: string;
  label: string;
  description: string;
  prompt: string;
  negativePrompt?: string;
  artifactId?: string;
  imageUrl?: string;
  status: LifeAssetStatus;
  error?: string;
}

export interface LifeAnchorPack {
  packId: string;
  status: LifeAssetStatus;
  characterName: string;
  visualBible: string;
  anchors: LifeAnchorImage[];
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export type LifeBookPageStatus = "pending" | "generated" | "failed";
export type LifeBookVideoStatus = "pending" | "generating" | "generated" | "skipped" | "failed";

export interface LifeBookPage {
  pageId: string;
  pageIndex: number;
  title: string;
  caption: string;
  sceneText: string;
  imagePrompt: string;
  negativePrompt?: string;
  imageArtifactId?: string;
  imageUrl?: string;
  videoArtifactId?: string;
  videoUrl?: string;
  videoStatus?: LifeBookVideoStatus;
  videoError?: string;
  videoTaskId?: string;
  videoRemoteUrl?: string;
  voiceoverText?: string;
  referenceAnchorIds?: string[];
  generationStatus: LifeBookPageStatus;
  generationError?: string;
  generationAttempts?: number;
  imageKind?: LifeImageKind;
  isPlaceholder?: boolean;
}

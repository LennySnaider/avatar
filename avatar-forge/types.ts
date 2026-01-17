
export interface ReferenceImage {
  id: string;
  url: string; // For display
  base64: string; // For API (raw base64 data without prefix)
  mimeType: string;
}

export interface PhysicalAttributes {
  age: number;
  bust: number;
  waist: number;
  hips: number;
}

// ============================================================================
// FACE IDENTITY BANK - Structured facial data for consistency
// ============================================================================
export interface FaceIdentityData {
  // Core Biometrics
  faceShape: string;
  facialProportions: string;

  // Eyes
  eyeShape: string;
  eyeColor: string;
  eyeSpacing: string;
  eyeSize: string;
  eyeTilt: string;
  eyelidType: string;
  irisDetails: string;

  // Eyebrows
  browShape: string;
  browThickness: string;
  browPosition: string;
  browColor: string;

  // Nose
  noseLength: string;
  noseBridge: string;
  noseWidth: string;
  nostrilShape: string;
  noseTip: string;

  // Lips/Mouth
  lipFullness: string;
  lipShape: string;
  cupidsBow: string;
  lipColor: string;
  mouthWidth: string;

  // Lower Face
  jawlineShape: string;
  chinShape: string;
  chinProjection: string;

  // Forehead
  foreheadHeight: string;
  foreheadShape: string;
  hairlineShape: string;

  // Ears
  earShape: string;
  earSize: string;

  // Skin
  skinTone: string;
  skinTexture: string;

  // UNIQUE IDENTIFIERS (Most important)
  distinctiveMarks: string[];
  facialAsymmetries: string;
  uniqueFeatures: string;

  // Composite string for prompt injection
  identityString: string;

  // Metadata
  analyzedAt?: number;
  sourceImageCount?: number;
}

// Multi-Angle Face Reference for 3D consistency
export interface MultiAngleFaceRef {
  front?: ReferenceImage | null;       // Frontal view (primary identity)
  threeQuarter?: ReferenceImage | null; // 3/4 view (45 degree angle)
  profile?: ReferenceImage | null;     // Side profile (90 degree)
  threeQuarterBack?: ReferenceImage | null; // 3/4 back view (optional)
}

export interface AvatarPreset {
  id: string;
  name: string;
  images: ReferenceImage[]; // General Identity
  faceRefImage?: ReferenceImage | null; // Specific Face override (frontal)
  angleRefImage?: ReferenceImage | null; // Legacy: single angle sheet
  multiAngleRefs?: MultiAngleFaceRef | null; // NEW: Multi-angle system
  bodyRefImage?: ReferenceImage | null; // Specific Body override
  identityWeight?: number; // 0 to 100
  measurements?: PhysicalAttributes;
  faceDescription?: string; // Legacy: simple text description
  faceIdentityData?: FaceIdentityData | null; // Structured identity for Face Bank
  createdAt: number;
}

export type MediaType = 'IMAGE' | 'VIDEO';

export interface PromptPreset {
  id: string;
  name: string;
  text: string;
  type: MediaType; // 'IMAGE' | 'VIDEO'
  createdAt: number;
}

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  aspectRatio: AspectRatio;
  timestamp: number;
  mediaType: MediaType; // New field
}

export interface SafetyCorrection {
  term: string;
  alternatives: string[];
}

export interface PromptAnalysisResult {
  isSafe: boolean;
  corrections: SafetyCorrection[]; // Changed from flaggedTerms string[]
  optimizedPrompt: string;
  reason: string;
}

export type ProviderType = 'GOOGLE' | 'KLING' | 'QWEN' | 'OPENAI' | 'RUNWAY' | 'CUSTOM';

export interface GenProvider {
  id: string;
  name: string;
  type: ProviderType; // New field
  apiKey: string;
  model: string; 
  endpoint?: string; // New field for custom URLs
}

export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
export type VideoResolution = "720p" | "1080p";
export type CameraMotion = "NONE" | "ZOOM_IN" | "ZOOM_OUT" | "PAN_LEFT" | "PAN_RIGHT" | "TRACKING";
export type SubjectAction = "NONE" | "TALKING" | "WALKING" | "RUNNING" | "IDLE" | "POSING";

export enum AppState {
  IDLE = 'IDLE',
  AVATAR_DEFINED = 'AVATAR_DEFINED', // User has confirmed the avatar
  GENERATING = 'GENERATING',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS'
}

import { GoogleGenAI, Type } from "@google/genai";
import { AspectRatio, ReferenceImage, PromptAnalysisResult, PhysicalAttributes, GenProvider, VideoResolution, CameraMotion, SubjectAction, FaceIdentityData, MultiAngleFaceRef } from "../types";

// ============================================================================
// IDENTITY & SKIN LOCK - MASTER PROMPT BLOCK
// REGLA DE ORO: Identidad y piel SIEMPRE van antes que estilo.
// ============================================================================
const IDENTITY_SKIN_LOCK = `
[IDENTITY & SKIN LOCK - HIGHEST PRIORITY]
consistent facial identity, stable facial proportions, same face across generations,
preserve exact facial geometry, fixed facial landmarks (eyes nose lips jawline),
same eye shape spacing and tilt, same nose bridge length and nostril shape,
same lip volume and cupid's bow, same jawline contour and chin shape,
consistent skin tone and undertone, same freckles moles and permanent facial marks,
instantly recognizable as the same person, visible pores, natural skin texture,
fine peach fuzz, micro-texture, tiny imperfections preserved, realistic skin tones,
lifelike tone mapping, natural matte-dewy balance, soft skin luminosity,
specular highlights on nose cheeks and forehead, editorial-grade realism,
sharp focus on skin details, preserved skin grain.

FORBIDDEN (NEGATIVE CONSTRAINTS):
no face morphing, no identity drift, no facial reconstruction, no airbrushing,
no skin smoothing, no CGI, no beauty filters, no plastic shine.
`;

// Helper to check for API Key
export const checkApiKey = async (): Promise<boolean> => {
  if (window.aistudio) {
    return await window.aistudio.hasSelectedApiKey();
  }
  return false;
};

// Helper to open key selector
export const selectApiKey = async (): Promise<void> => {
  if (window.aistudio) {
    await window.aistudio.openSelectKey();
  } else {
    console.warn("AI Studio window object not found. Running in non-managed environment?");
  }
};

export const enhancePrompt = async (currentPrompt: string, contextImage: ReferenceImage | null, customApiKey?: string): Promise<string> => {
  const apiKey = customApiKey || process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");

  const ai = new GoogleGenAI({ apiKey });
  const parts: any[] = [];

  if (contextImage) {
    parts.push({
      inlineData: {
        mimeType: contextImage.mimeType,
        data: contextImage.base64,
      }
    });
  }

  let instructions = `
    You are an expert Prompt Engineer for High-End AI Video Generation models (like Google Veo).
    
    YOUR TASK:
    Rewrite the user's short prompt into a "Premium", highly detailed, cinematic prompt.
    
    GUIDELINES:
    1. VISUALS: Describe lighting (e.g., golden hour, cinematic, volumetric), camera angles (e.g., low angle, drone shot), and texture (e.g., 4k, photorealistic).
    2. ACTION: Expand on the movement described. Make it natural and fluid.
    3. CONTEXT: If an image is provided, use it to describe the SUBJECT (appearance, clothes) and SETTING strictly. Do not hallucinate features not present in the image.
    4. SAFETY: Ensure the prompt is safe (SFW) and avoids controversial terms.
    5. LENGTH: The output should be 2-4 sentences long.
    
    User's Raw Input: "${currentPrompt}"
    
    Output ONLY the enhanced prompt string. No intro, no quotes.
  `;

  parts.push({ text: instructions });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts }
    });
    return response.text?.trim() || currentPrompt;
  } catch (e) {
    console.error("Magic Prompt Failed", e);
    return currentPrompt; // Fallback
  }
};

export const describeImageForPrompt = async (image: ReferenceImage, customApiKey?: string): Promise<string> => {
  const apiKey = customApiKey || process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: image.mimeType,
              data: image.base64,
            }
          },
          {
            text: "Describe this image in detail to be used as an AI image generation prompt. Focus on the subject's appearance, clothing, pose, setting, lighting, and artistic style. Keep it concise, descriptive, and high-quality. Do not include introductory text like 'Here is a description'."
          }
        ]
      }
    });
    return response.text || "";
  } catch (e) {
    console.error("Image Description Failed", e);
    throw new Error("Failed to describe image.");
  }
};

export const analyzePromptSafety = async (userPrompt: string): Promise<PromptAnalysisResult> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");
  
  const ai = new GoogleGenAI({ apiKey });

  // Use Flash for fast analysis
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Analyze this image generation prompt for safety and policy compliance.
      
      Policy: No NSFW, no explicit nudity, no real celebrity names (likeness), no graphic violence.
      
      Prompt: "${userPrompt}"
      
      Task:
      1. Identify any "Risky Terms" that might trigger filters (e.g., 'nude', 'naked', 'blood', 'celebrity names', 'bikini' if context is sexual).
      2. For EACH risky term, provide 3 Safe Alternatives (Synonyms) that convey the same visual idea but are policy-compliant (e.g., 'nude' -> 'natural skin tone', 'pale', 'unadorned'; 'bikini' -> 'summer beachwear', 'swimsuit', 'two-piece').
      3. Rewrite the full prompt using these safe alternatives.
      `,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isSafe: { type: Type.BOOLEAN },
            corrections: { 
                type: Type.ARRAY, 
                items: { 
                    type: Type.OBJECT,
                    properties: {
                        term: { type: Type.STRING },
                        alternatives: { type: Type.ARRAY, items: { type: Type.STRING } }
                    }
                } 
            },
            optimizedPrompt: { type: Type.STRING },
            reason: { type: Type.STRING }
          }
        }
      }
    });
    
    const text = response.text;
    if (!text) throw new Error("Empty analysis response");
    
    return JSON.parse(text) as PromptAnalysisResult;
  } catch (e) {
    console.error("Safety Analysis Failed", e);
    // Fallback if analysis fails
    return {
      isSafe: true,
      corrections: [],
      optimizedPrompt: userPrompt,
      reason: "Analysis service unavailable"
    };
  }
};

// ============================================================================
// FACE IDENTITY ANALYSIS - ENHANCED FOR CONSISTENCY
// Extracts UNIQUE identifying features for consistent re-generation
// FaceIdentityData type is imported from ../types
// ============================================================================

export const analyzeFaceFromImages = async (images: ReferenceImage[]): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");

  if (images.length === 0) return "";

  const ai = new GoogleGenAI({ apiKey });

  const parts: any[] = [];
  // Use up to 3 images for comprehensive analysis
  images.slice(0, 3).forEach((img) => {
    parts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.base64,
      },
    });
  });

  parts.push({
    text: `You are a forensic facial analyst. Analyze these images and extract EVERY UNIQUE identifying feature of this person's face. The goal is to create a comprehensive identity profile that enables PERFECT re-generation of this exact face.

    ANALYZE WITH EXTREME PRECISION:

    === FACE STRUCTURE ===
    1. Face Shape: (oval/round/square/heart/oblong/diamond)
    2. Facial Proportions: (forehead-to-chin ratio, face width-to-height)
    3. Facial Symmetry: (any natural asymmetries - left vs right differences)

    === EYES (CRITICAL - Most identifying feature) ===
    4. Eye Shape: (almond/round/hooded/monolid/upturned/downturned)
    5. Eye Color: (be EXTREMELY specific - include variations, rings, patterns)
    6. Eye Spacing: (close-set/average/wide-set)
    7. Eye Size: (relative to face)
    8. Eye Tilt: (angle of eye corners - horizontal/upward/downward)
    9. Eyelid Type: (single/double/hooded/visible crease depth)
    10. Iris Details: (limbal ring present? color gradients? patterns?)

    === EYEBROWS ===
    11. Brow Shape: (arched/straight/curved/S-shaped/angular)
    12. Brow Thickness: (thin/medium/thick) + where thickest/thinnest
    13. Brow Position: (high-set/medium/low-set relative to eyes)
    14. Brow Color: (exact shade, may differ from hair)
    15. Brow Grooming: (natural/shaped/sparse areas)

    === NOSE ===
    16. Nose Length: (short/medium/long)
    17. Nose Bridge: (high/medium/low, straight/curved/bump/hook)
    18. Nose Width: (narrow/medium/wide at bridge AND base)
    19. Nostril Shape: (round/oval/flared/asymmetric)
    20. Nose Tip: (pointed/rounded/bulbous/upturned/downturned)

    === LIPS & MOUTH ===
    21. Upper Lip: (thin/medium/full, shape)
    22. Lower Lip: (thin/medium/full, shape)
    23. Cupid's Bow: (pronounced/subtle/flat)
    24. Lip Color: (natural pigmentation, two-tone?)
    25. Mouth Width: (narrow/medium/wide)
    26. Lip Texture: (smooth/textured lines)

    === LOWER FACE ===
    27. Jawline: (sharp/soft/angular/rounded/square)
    28. Chin Shape: (pointed/rounded/square/cleft/dimpled)
    29. Chin Projection: (recessed/normal/prominent)
    30. Cheekbones: (high/medium/low, prominent/subtle)

    === FOREHEAD & HAIRLINE ===
    31. Forehead Height: (low/medium/high)
    32. Forehead Shape: (flat/curved/prominent brow ridge)
    33. Hairline Shape: (straight/widow's peak/receding/M-shaped/rounded)

    === SKIN & TEXTURE ===
    34. Skin Tone: (exact undertone - warm/cool/neutral + depth)
    35. Skin Texture: (where are pores most visible? any texture patterns?)

    === UNIQUE IDENTIFIERS (MOST CRITICAL FOR CONSISTENCY) ===
    36. Moles/Beauty Marks: EXACT locations (e.g., "small dark mole 1cm below right eye outer corner")
    37. Freckles: Pattern and density (e.g., "scattered light freckles across nose bridge and cheeks")
    38. Scars: Location and appearance
    39. Dimples: Location and depth (cheek dimples, chin dimple)
    40. Birthmarks: Location, size, color
    41. Any Asymmetries: (e.g., "left eyebrow slightly higher than right", "smile slightly crooked to left")
    42. Unique Features: Anything distinctive that makes this face INSTANTLY recognizable

    OUTPUT FORMAT:
    Create a comprehensive comma-separated description that captures ALL of the above.
    Start with the most DISTINCTIVE features first (unique marks, unusual features).
    Be EXTREMELY specific about locations using anatomical terms.

    EXAMPLE OUTPUT:
    "Small dark mole below right eye outer corner, scattered freckles across nose bridge, almond-shaped deep green eyes with gold flecks and dark limbal ring, wide-set eyes with slight upward tilt, double eyelids with visible crease, naturally arched thick dark brows set high, straight nose with medium bridge and slightly upturned tip, full lips with pronounced cupid's bow and deeper pigment on lower lip, heart-shaped face with high cheekbones, soft jawline tapering to slightly pointed chin with subtle dimple, medium-high forehead with widow's peak hairline, warm olive skin tone with visible pores on nose and inner cheeks, left brow slightly higher than right creating subtle asymmetry, distinctive smile lines at eye corners"`
  });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // Fast model for vision analysis
      contents: { parts }
    });
    return response.text || "";
  } catch (e) {
    console.error("Face Analysis Failed", e);
    return "";
  }
};

// Extended analysis that returns structured data (for Face Bank system)
export const analyzeFaceStructured = async (images: ReferenceImage[]): Promise<FaceIdentityData | null> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");

  if (images.length === 0) return null;

  const ai = new GoogleGenAI({ apiKey });

  const parts: any[] = [];
  images.slice(0, 3).forEach((img) => {
    parts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.base64,
      },
    });
  });

  parts.push({
    text: `Analyze these images and extract comprehensive facial identity data. Return as JSON matching this exact structure:

    {
      "faceShape": "shape description",
      "facialProportions": "proportions description",
      "eyeShape": "shape",
      "eyeColor": "detailed color",
      "eyeSpacing": "spacing type",
      "eyeSize": "size relative to face",
      "eyeTilt": "tilt angle",
      "eyelidType": "eyelid description",
      "irisDetails": "iris patterns/details",
      "browShape": "brow shape",
      "browThickness": "thickness",
      "browPosition": "position",
      "browColor": "color",
      "noseLength": "length",
      "noseBridge": "bridge description",
      "noseWidth": "width",
      "nostrilShape": "nostril shape",
      "noseTip": "tip shape",
      "lipFullness": "fullness",
      "lipShape": "shape",
      "cupidsBow": "cupids bow prominence",
      "lipColor": "natural color",
      "mouthWidth": "width",
      "jawlineShape": "jawline description",
      "chinShape": "chin shape",
      "chinProjection": "projection",
      "foreheadHeight": "height",
      "foreheadShape": "shape",
      "hairlineShape": "hairline pattern",
      "earShape": "ear description if visible",
      "earSize": "size if visible",
      "skinTone": "exact skin tone and undertone",
      "skinTexture": "texture description",
      "distinctiveMarks": ["mark 1 with exact location", "mark 2 with exact location"],
      "facialAsymmetries": "any natural asymmetries",
      "uniqueFeatures": "any unique distinguishing features",
      "identityString": "complete comma-separated identity description starting with most unique features"
    }

    Be EXTREMELY detailed and precise. Focus especially on unique identifying features.`
  });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts },
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) return null;

    return JSON.parse(text) as FaceIdentityData;
  } catch (e) {
    console.error("Structured Face Analysis Failed", e);
    return null;
  }
};

// ============================================================================
// CONSISTENCY VERIFICATION - Post-generation identity check
// Compares generated image against stored identity for quality control
// ============================================================================

// Helper: Convert structured FaceIdentityData to prompt-ready text (defined here for use in verification)
const faceIdentityToPromptText = (data: FaceIdentityData): string => {
  const sections: string[] = [];

  // Start with UNIQUE identifiers (most important for consistency)
  if (data.distinctiveMarks && data.distinctiveMarks.length > 0) {
    sections.push(`UNIQUE MARKS: ${data.distinctiveMarks.join(", ")}`);
  }
  if (data.uniqueFeatures) {
    sections.push(`DISTINCTIVE: ${data.uniqueFeatures}`);
  }
  if (data.facialAsymmetries) {
    sections.push(`ASYMMETRIES: ${data.facialAsymmetries}`);
  }

  // Face structure
  sections.push(`FACE: ${data.faceShape} face shape, ${data.facialProportions}`);

  // Eyes (critical)
  sections.push(`EYES: ${data.eyeShape} shape, ${data.eyeColor} color, ${data.eyeSpacing} spacing, ${data.eyeSize} size, ${data.eyeTilt} tilt, ${data.eyelidType} eyelids, ${data.irisDetails}`);

  // Eyebrows
  sections.push(`BROWS: ${data.browShape} shape, ${data.browThickness} thickness, ${data.browPosition} position, ${data.browColor} color`);

  // Nose
  sections.push(`NOSE: ${data.noseLength} length, ${data.noseBridge} bridge, ${data.noseWidth} width, ${data.nostrilShape} nostrils, ${data.noseTip} tip`);

  // Lips
  sections.push(`LIPS: ${data.lipFullness} fullness, ${data.lipShape} shape, ${data.cupidsBow} cupid's bow, ${data.lipColor} color, ${data.mouthWidth} width`);

  // Jawline & Chin
  sections.push(`JAW/CHIN: ${data.jawlineShape} jawline, ${data.chinShape} chin, ${data.chinProjection} projection`);

  // Forehead
  sections.push(`FOREHEAD: ${data.foreheadHeight} height, ${data.foreheadShape} shape, ${data.hairlineShape} hairline`);

  // Skin
  sections.push(`SKIN: ${data.skinTone} tone, ${data.skinTexture} texture`);

  return sections.join(". ");
};

export interface ConsistencyVerificationResult {
  isConsistent: boolean;
  overallScore: number; // 0-100
  scores: {
    eyeShape: number;
    eyeColor: number;
    noseShape: number;
    lipShape: number;
    faceShape: number;
    skinTone: number;
    distinctiveMarks: number;
    overallRecognition: number;
  };
  issues: string[]; // List of detected inconsistencies
  suggestion: string; // What to adjust if not consistent
}

/**
 * Verify if a generated image maintains consistency with the original identity
 * @param generatedImageUrl - The generated image (data URL)
 * @param originalIdentity - The stored FaceIdentityData from Face Bank
 * @param originalFaceRef - Optional: the original face reference image
 */
export const verifyConsistency = async (
  generatedImageUrl: string,
  originalIdentity: FaceIdentityData,
  originalFaceRef?: ReferenceImage | null
): Promise<ConsistencyVerificationResult> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");

  const ai = new GoogleGenAI({ apiKey });
  const parts: any[] = [];

  // Add generated image
  const base64 = generatedImageUrl.split(',')[1];
  parts.push({
    inlineData: {
      mimeType: 'image/jpeg',
      data: base64,
    },
  });

  // Add original face reference if available
  if (originalFaceRef) {
    parts.push({
      inlineData: {
        mimeType: originalFaceRef.mimeType,
        data: originalFaceRef.base64,
      },
    });
  }

  // Build identity description for comparison
  const identityText = originalIdentity.identityString || faceIdentityToPromptText(originalIdentity);

  parts.push({
    text: `You are a facial recognition verification system. Compare the generated image (Image 1) against the original identity.

    ${originalFaceRef ? "Image 2 is the original face reference for visual comparison." : ""}

    ORIGINAL IDENTITY PROFILE:
    ${identityText}

    ANALYZE AND SCORE EACH FEATURE (0-100 where 100 = perfect match):

    1. EYE_SHAPE: Do the eyes match? (shape, size, spacing, tilt)
    2. EYE_COLOR: Does the eye color match exactly?
    3. NOSE_SHAPE: Does the nose match? (bridge, tip, width, nostrils)
    4. LIP_SHAPE: Do the lips match? (fullness, cupid's bow, width)
    5. FACE_SHAPE: Does the overall face shape match? (jaw, cheekbones, proportions)
    6. SKIN_TONE: Does the skin tone and texture match?
    7. DISTINCTIVE_MARKS: Are moles, freckles, scars in the correct locations?
    8. OVERALL_RECOGNITION: Would someone instantly recognize this as the same person?

    Return JSON with this exact structure:
    {
      "isConsistent": true/false (true if overallScore >= 75),
      "overallScore": 0-100,
      "scores": {
        "eyeShape": 0-100,
        "eyeColor": 0-100,
        "noseShape": 0-100,
        "lipShape": 0-100,
        "faceShape": 0-100,
        "skinTone": 0-100,
        "distinctiveMarks": 0-100,
        "overallRecognition": 0-100
      },
      "issues": ["list of specific inconsistencies detected"],
      "suggestion": "what to adjust to improve consistency"
    }`
  });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts },
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty verification response");

    return JSON.parse(text) as ConsistencyVerificationResult;
  } catch (e) {
    console.error("Consistency Verification Failed", e);
    // Return default "unknown" result
    return {
      isConsistent: true, // Assume consistent if verification fails
      overallScore: 0,
      scores: {
        eyeShape: 0, eyeColor: 0, noseShape: 0, lipShape: 0,
        faceShape: 0, skinTone: 0, distinctiveMarks: 0, overallRecognition: 0
      },
      issues: ["Verification system error"],
      suggestion: "Manual review recommended"
    };
  }
};

/**
 * Quick consistency check - faster, less detailed
 */
export const quickConsistencyCheck = async (
  generatedImageUrl: string,
  originalFaceRef: ReferenceImage
): Promise<{ isConsistent: boolean; confidence: number; issue?: string }> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");

  const ai = new GoogleGenAI({ apiKey });
  const parts: any[] = [];

  // Add generated image
  const base64 = generatedImageUrl.split(',')[1];
  parts.push({
    inlineData: { mimeType: 'image/jpeg', data: base64 },
  });

  // Add original face reference
  parts.push({
    inlineData: { mimeType: originalFaceRef.mimeType, data: originalFaceRef.base64 },
  });

  parts.push({
    text: `Quick facial identity check. Are Image 1 and Image 2 the SAME PERSON?

    Focus on:
    - Same eyes (shape, color)
    - Same nose
    - Same lips
    - Same face shape
    - Same distinctive marks

    Return JSON:
    {
      "isConsistent": true/false,
      "confidence": 0-100,
      "issue": "brief description if not consistent, null if consistent"
    }`
  });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts },
      config: { responseMimeType: "application/json" }
    });

    const text = response.text;
    if (!text) return { isConsistent: true, confidence: 0 };

    return JSON.parse(text);
  } catch (e) {
    console.error("Quick Consistency Check Failed", e);
    return { isConsistent: true, confidence: 0, issue: "Check failed" };
  }
};

// Helper to optimize image size to avoid 'OTHER' errors
const resizeBase64Image = async (base64: string, mimeType: string, maxDim: number = 1024, quality: number = 0.85): Promise<string> => {
  return new Promise((resolve) => {
      const img = new Image();
      img.src = `data:${mimeType};base64,${base64}`;
      img.onload = () => {
          let w = img.width;
          let h = img.height;
          
          if (w <= maxDim && h <= maxDim) {
              // If image is small enough, still redraw to apply compression/format standardization if needed
              // or just return original if optimization isn't critical.
              // For consistent JPEG output:
          }

          if (w > maxDim || h > maxDim) {
              if (w > h) {
                  h = Math.round(h * (maxDim / w));
                  w = maxDim;
              } else {
                  w = Math.round(w * (maxDim / h));
                  h = maxDim;
              }
          }

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
              ctx.drawImage(img, 0, 0, w, h);
              // Convert to JPEG
              const result = canvas.toDataURL('image/jpeg', quality);
              resolve(result.split(',')[1]);
          } else {
              resolve(base64);
          }
      };
      img.onerror = () => resolve(base64);
  });
};

// Helper to translate measurements to keywords - EXPORTED
// ULTRA-VISUAL DESCRIPTORS - The model needs VISUAL terms, not measurements
export const getBodyDescriptors = (m: PhysicalAttributes): string => {
  const descriptors: string[] = [];
  const ratio = m.hips / m.waist;

  // ============ BUST - ULTRA VISUAL DESCRIPTORS ============
  if (m.bust >= 110) {
      descriptors.push(
          "MASSIVE BREASTS", "huge chest", "extremely large bust",
          "breasts much larger than head size", "heavy voluptuous bosom",
          "deep prominent cleavage", "chest straining against clothing"
      );
  } else if (m.bust >= 95) {
      descriptors.push(
          "LARGE BREASTS", "big bust", "voluptuous chest", "D-cup or larger appearance",
          "prominent cleavage visible", "full heavy bosom", "breasts noticeably large",
          "chest curves outward significantly", "busty silhouette"
      );
  } else if (m.bust >= 88) {
      descriptors.push("full bust", "medium-large breasts", "C-cup appearance", "curvy chest");
  } else if (m.bust >= 80) {
      descriptors.push("average bust", "proportional chest", "B-cup appearance");
  } else {
      descriptors.push("small bust", "petite chest", "A-cup appearance", "flat-chested");
  }

  // ============ HIPS/GLUTES - ULTRA VISUAL DESCRIPTORS ============
  if (m.hips >= 110) {
      descriptors.push(
          "EXTREMELY WIDE HIPS", "massive buttocks", "huge rear",
          "hips much wider than shoulders", "shelf-like glutes",
          "very thick thighs", "exaggerated pear shape", "prominent backside"
      );
  } else if (m.hips >= 95) {  // LOWERED from 98 to 95
      descriptors.push(
          "WIDE HIPS", "large buttocks", "prominent rear", "curvy hips",
          "hips wider than waist", "thick thighs", "rounded glutes visible",
          "noticeable hip curves", "feminine wide pelvis"
      );
  } else if (m.hips >= 88) {
      descriptors.push("average hips", "proportional lower body", "normal buttocks");
  } else {
      descriptors.push("narrow hips", "slim lower body", "boyish hips", "flat buttocks");
  }

  // ============ WAIST/RATIO - HOURGLASS VISIBILITY ============
  if (ratio >= 1.55) {
      descriptors.push(
          "EXTREME HOURGLASS FIGURE", "dramatically tiny waist",
          "waist MUCH narrower than hips", "corseted waistline appearance",
          "dramatic curve inward at waist", "exaggerated feminine silhouette"
      );
  } else if (ratio >= 1.35) {
      descriptors.push(
          "HOURGLASS FIGURE", "defined waist", "visible waist curve inward",
          "feminine waist-to-hip ratio", "curvy silhouette"
      );
  } else if (ratio >= 1.2) {
      descriptors.push("slight waist definition", "gentle curves");
  } else {
      descriptors.push("straight waist", "rectangular figure", "athletic build");
  }

  // ============ COMBINED VISUAL EMPHASIS ============
  if (ratio >= 1.35 && m.bust >= 95) {
      descriptors.push(
          "VOLUPTUOUS CURVY BODY", "thick and curvy", "sexy feminine curves",
          "body with pronounced bust AND hips", "full figured woman"
      );
  }
  if (ratio >= 1.5) {
      descriptors.push("waist visibly pinched inward compared to hips and bust");
  }

  return descriptors.join(", ");
};

// Helper for age flavor text - IMPROVED
const getAgeDescriptors = (age: number): string => {
    if (age <= 21) return "Very young, fresh college age, soft collagen-rich skin, absolutely no wrinkles";
    if (age <= 25) return "Young adult, peak youth, flawless skin texture, firm features";
    if (age <= 30) return "Young woman, prime condition, smooth skin";
    if (age <= 40) return "Mature beauty, refined features, sophisticated look";
    if (age <= 55) return "Middle-aged, mature skin texture, distinguished look, some character lines";
    return "Elderly, deep wrinkles, aged skin texture, wise appearance";
};

// EDIT / REFINE IMAGE
export const editImage = async (
    originalImageUrl: string,
    editPrompt: string,
    maskedImageUrl: string | null,
    provider: GenProvider | null
): Promise<string> => {
    const apiKey = provider ? provider.apiKey : process.env.API_KEY;
    if (!apiKey) throw new Error("API Key not found");

    const ai = new GoogleGenAI({ apiKey });
    const modelName = 'gemini-3-pro-image-preview'; // Best for editing

    // Prepare Parts
    const parts: any[] = [];

    // 1. Image to edit
    const base64 = originalImageUrl.split(',')[1];
    const mimeType = originalImageUrl.substring(originalImageUrl.indexOf(':') + 1, originalImageUrl.indexOf(';'));
    
    // Resize if needed - Use High Quality (1536px, 99% Quality)
    const optimizedOriginal = await resizeBase64Image(base64, mimeType, 1536, 0.99);
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: optimizedOriginal } });

    // 2. Text Instruction - ENHANCED for visible changes
    let textPrompt = "";

    // 3. Visual Guidance (Mask) or No-Mask Edit
    if (maskedImageUrl) {
        // WITH MASK - targeted edit
        const maskBase64 = maskedImageUrl.split(',')[1];
        parts.push({ inlineData: { mimeType: 'image/png', data: maskBase64 } });

        textPrompt = `EDIT INSTRUCTION: "${editPrompt}"

VISUAL GUIDE: The second image shows a purple highlighted area (mask). Apply the edit ONLY to this highlighted region.

REQUIREMENTS:
- Make the change CLEARLY VISIBLE and NOTICEABLE
- The edit should be SIGNIFICANT, not subtle
- Maintain photorealistic quality
- Keep the rest of the image unchanged`;
    } else {
        // WITHOUT MASK - global edit, needs to be MORE AGGRESSIVE
        textPrompt = `EDIT INSTRUCTION: "${editPrompt}"

CRITICAL REQUIREMENTS:
- Make this change DRAMATICALLY VISIBLE - the result should be OBVIOUSLY different
- DO NOT make subtle/minimal changes - the edit must be CLEARLY NOTICEABLE at first glance
- If the instruction says "bigger", make it SIGNIFICANTLY bigger (at least 30-50% increase)
- If the instruction says "smaller", make it NOTICEABLY smaller
- If the instruction says "change", make it a COMPLETE transformation
- The viewer should IMMEDIATELY see what was changed
- Maintain photorealistic quality and the person's face/identity
- Apply the change to the entire relevant area, not just a small portion

WRONG: Making a barely perceptible change
RIGHT: Making a change that is immediately obvious when comparing before/after`;
    }

    parts.push({ text: textPrompt });

    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: { parts },
        });

        const candidate = response.candidates?.[0];
        
        if (candidate?.finishReason === 'SAFETY') {
             throw new Error("Edit blocked by safety filters.");
        }

        // Check for Image
        for (const part of candidate?.content?.parts || []) {
            if (part.inlineData) {
                return `data:image/jpeg;base64,${part.inlineData.data}`;
            }
        }

        // Check for Text Refusal
        const textRefusal = candidate?.content?.parts?.map(p => p.text).join(" ").trim();
        if (textRefusal) {
             throw new Error(`Model Refusal: ${textRefusal}`);
        }

        throw new Error("No image returned from edit operation.");

    } catch (e: any) {
        console.error("Edit Image Failed:", e);
        throw new Error(e.message || "Edit failed");
    }
};

export const generateAvatar = async (
  prompt: string,
  avatarReferences: ReferenceImage[],
  assetReferences: ReferenceImage[],
  sceneReference: ReferenceImage | null,
  faceRefImage: ReferenceImage | null,
  bodyRefImage: ReferenceImage | null,
  angleRefImage: ReferenceImage | null, // Legacy single angle
  aspectRatio: AspectRatio,
  identityWeight: number = 85,
  styleWeight: number = 50,
  measurements: PhysicalAttributes = { age: 25, bust: 90, waist: 60, hips: 90 },
  faceDescription: string = "",
  provider: GenProvider | null,
  faceIdentityData: FaceIdentityData | null = null, // Structured identity from Face Bank
  multiAngleRefs: MultiAngleFaceRef | null = null // NEW: Multi-angle reference system
): Promise<string> => {

  if (provider && provider.type !== 'GOOGLE') {
      throw new Error(`Integration for ${provider.name} (${provider.type}) is configured but generation logic is not yet implemented.`);
  }

  const apiKey = provider ? provider.apiKey : process.env.API_KEY;
  const modelName = provider ? provider.model : 'gemini-3-pro-image-preview';

  if (!apiKey) {
    throw new Error("API Key not found. Please select an API key or add a provider.");
  }

  // FACE IDENTITY BANK: Use structured data if available, else fallback to analysis
  let activeFaceDescription = "";

  // Priority 1: Use Face Bank structured data
  if (faceIdentityData && faceIdentityData.identityString) {
    activeFaceDescription = faceIdentityData.identityString;
    console.log("Using Face Bank identity data for consistency");
  }
  // Priority 2: Use provided text description
  else if (faceDescription) {
    activeFaceDescription = faceDescription;
  }
  // Priority 3: Auto-generate from images
  else if (faceRefImage || avatarReferences.length > 0) {
    try {
      const sourceForAnalysis = faceRefImage ? [faceRefImage] : [avatarReferences[0]];
      activeFaceDescription = await analyzeFaceFromImages(sourceForAnalysis);
    } catch (e) {
      console.warn("Auto-face analysis failed, proceeding without it.");
    }
  }

  // Build detailed identity prompt from structured data
  const detailedIdentityPrompt = faceIdentityData ? faceIdentityToPromptText(faceIdentityData) : "";

  const ai = new GoogleGenAI({ apiKey });

  // --- LOGIC OVERHAUL: STYLE vs IDENTITY ---
  
  const isHighStyleWeight = styleWeight > 85;

  // 1. Identity Instructions - AGGRESSIVE UPDATE + GOLDEN RULE REMINDER
  let identityInstructions = "";
  const identityReminder = `

    REMINDER (GOLDEN RULE): Identity & Skin Lock takes ABSOLUTE precedence over any style reference.
    The face must remain EXACTLY as defined - style only affects lighting, clothing, and background.
    NEVER sacrifice facial accuracy for aesthetic appeal.
  `;

  // Build angle reference instructions based on available angles
  const hasMultiAngle = multiAngleRefs && (multiAngleRefs.threeQuarter || multiAngleRefs.profile);
  const angleInstructions = hasMultiAngle ? `
    - MULTI-ANGLE 3D RECONSTRUCTION:
      * [FACE_ANCHOR] = Primary frontal identity (eyes, brow shape, face width)
      * [ANGLE_3Q] = 3/4 view (nose bridge, cheekbone, jaw depth from angle)
      * [ANGLE_PROFILE] = Side profile (nose shape, chin projection, forehead slope)
    - Combine ALL angle references to build a mentally consistent 3D face model.
    - When rendering any angle, the face must match ALL reference views.
  ` : angleRefImage ? `
    - GEOMETRY SOURCE: Image [ANGLE_SHEET] defines 3D structure.
  ` : "";

  if (identityWeight > 85) {
     identityInstructions = `
    - IDENTITY DIRECTIVE: DEEPFAKE-LEVEL CONSISTENCY.
    - PRIMARY SOURCE: Image [FACE_ANCHOR] is the ground truth for frontal face identity.
    ${angleInstructions}
    - INSTRUCTION: You are performing a high-fidelity character rendering.
    - The face MUST match the reference images exactly in structure, proportions, and features.
    - DO NOT blend the avatar's face with the style reference. COMPLETELY OVERWRITE any existing face in the style/composition.
    - PRESERVE: Eye shape, nose bridge width, lip volume, and distinctive marks (moles/scars).
    - CRITICAL: If multiple angle references exist, EVERY generated angle must be consistent with ALL references.
    ${identityReminder}
     `;
  } else {
     identityInstructions = `
    - IDENTITY DIRECTIVE: High Consistency.
    - The character must be clearly recognizable as the person described/shown in [FACE_ANCHOR].
    ${angleInstructions}
    ${identityReminder}
     `;
  }

  // 2. Anatomical Blueprint - IMMUTABLE BODY PROPORTIONS
  const bodyAdjectives = getBodyDescriptors(measurements);
  const ageAdjectives = getAgeDescriptors(measurements.age || 25);
  const hipWaistRatio = (measurements.hips / measurements.waist).toFixed(2);

  // BODY MEASUREMENTS ARE IMMUTABLE - Same priority as face identity
  // Using VISUAL descriptions, not just measurements
  const bustVisual = measurements.bust >= 110 ? "MASSIVE BREASTS, huge chest, deep cleavage" :
                     measurements.bust >= 95 ? "LARGE BREASTS, big bust, D-cup+, prominent cleavage, busty" :
                     measurements.bust >= 88 ? "Full bust, C-cup, curvy chest" :
                     measurements.bust >= 80 ? "Average bust, B-cup" : "Small bust, A-cup, flat";

  const hipsVisual = measurements.hips >= 110 ? "EXTREMELY WIDE HIPS, massive buttocks, huge rear, very thick thighs" :
                     measurements.hips >= 95 ? "WIDE HIPS, large buttocks, prominent rear, thick thighs, curvy hips" :
                     measurements.hips >= 88 ? "Average hips, proportional rear" : "Narrow hips, slim";

  const ratioVisual = parseFloat(hipWaistRatio) >= 1.55 ? "EXTREME HOURGLASS - waist DRAMATICALLY smaller than hips, corseted look" :
                      parseFloat(hipWaistRatio) >= 1.35 ? "HOURGLASS FIGURE - visible waist curve inward, feminine silhouette" :
                      "Straight/athletic figure";

  let physicalInstructions = `
    [BODY PROPORTIONS LOCK - IMMUTABLE - VISUAL REQUIREMENTS]

    ======= MANDATORY BODY SHAPE (MUST BE VISIBLE) =======

    BUST/CHEST: ${bustVisual}
    - The breasts must be ${measurements.bust >= 95 ? "NOTICEABLY LARGE and prominent in the image" : "proportional"}
    - ${measurements.bust >= 95 ? "Cleavage or bust curve MUST be visible through clothing silhouette" : ""}

    HIPS/GLUTES/REAR: ${hipsVisual}
    - The hips/buttocks must be ${measurements.hips >= 95 ? "WIDE and PROMINENT in the image" : "proportional"}
    - ${measurements.hips >= 95 ? "Hip width MUST be visually wider than waist" : ""}

    WAIST & RATIO: ${ratioVisual}
    - Hip-to-waist ratio: ${hipWaistRatio}
    - ${parseFloat(hipWaistRatio) >= 1.35 ? "The waist MUST curve INWARD visibly compared to hips" : ""}

    AGE: ${measurements.age || 25} years old (${ageAdjectives})

    ======= VISUAL DESCRIPTORS (ALL MUST APPLY) =======
    ${bodyAdjectives}

    ======= CLOTHING BEHAVIOR =======
    - Clothing must CONFORM to body curves, NOT hide them
    - Tight clothing shows the bust/hip curves
    - Loose clothing still shows the silhouette underneath
    - NEVER flatten curves under clothing

    ======= FORBIDDEN (NEVER DO) =======
    - Do NOT make bust smaller than described
    - Do NOT make hips/buttocks smaller than described
    - Do NOT use "model-thin" proportions
    - Do NOT normalize curves to average body
    - Do NOT copy body shape from style reference image
  `;

  if (isHighStyleWeight && sceneReference) {
      physicalInstructions += `
      STYLE REFERENCE BODY OVERRIDE:
      - COPY: Clothing style, pose, position from reference
      - IGNORE: Body proportions from reference - USE MEASUREMENTS ABOVE
      - The reference body is just a "mannequin" - reshape it to match ${measurements.bust}/${measurements.waist}/${measurements.hips}
      - If reference has smaller bust/hips, ENLARGE to match measurements
      - If reference has larger bust/hips, REDUCE to match measurements
      `;
  } else {
      physicalInstructions += `
      ABSOLUTE BODY AUTHORITY:
      - These measurements are the ONLY source of truth for body shape.
      - COMPLETELY IGNORE any body proportions from reference images.
      - The avatar's body is FIXED at: Bust ${measurements.bust}cm, Hips ${measurements.hips}cm.
      `;
  }

  // FACE IDENTITY BANK INTEGRATION
  if (detailedIdentityPrompt) {
    // Use structured identity from Face Bank (highest priority)
    physicalInstructions += `

    ======= FACE IDENTITY BANK (IMMUTABLE - HIGHEST PRIORITY) =======
    ${detailedIdentityPrompt}

    ENFORCEMENT:
    - EVERY facial feature listed above MUST match EXACTLY
    - Pay special attention to UNIQUE MARKS and ASYMMETRIES
    - These are the PRIMARY identity anchors for consistency
    `;
  } else if (activeFaceDescription.trim()) {
    // Fallback to simple text description
    physicalInstructions += `
    FACIAL FEATURES (HARD CONSTRAINT):
    - ${activeFaceDescription}
    - These text details MUST be visible in the final image.
    `;
  }

  // 3. Style/Pose Reference Logic
  let styleDirectives = "";
  let styleLabel = "";
  if (sceneReference) {
    if (styleWeight < 30) {
        styleLabel = "COLOR_PALETTE_REF";
        styleDirectives = `(IGNORE_CONTENT_KEEP_COLOR) - Extract only color palette and mood. DO NOT copy the subject/pose/outfit.`;
    } else if (styleWeight < 85) {
        styleLabel = "COMPOSITION_GUIDE";
        styleDirectives = `(IGNORE_SUBJECT_KEEP_LIGHTING) - Use lighting and angle. REPLACE the subject with the Avatar defined above.`;
    } else {
        // STRICT MODE - BUT SUBORDINATE TO IDENTITY LOCK
        styleLabel = "VISUAL_CLONE_SOURCE";
        styleDirectives = `
        (STRICT_VISUAL_CLONE) - This image is the TARGET OUTFIT, POSE, and COMPOSITION.

        SUBORDINATE TO IDENTITY LOCK:
        - The FACE from [FACE_ANCHOR] is IMMUTABLE - do NOT alter facial features to match this reference.
        - The SKIN TEXTURE is IMMUTABLE - preserve pores, marks, and natural imperfections.

        WHAT TO COPY FROM THIS REFERENCE:
        - Clothing/Outfit exactly
        - Pose/Body position exactly
        - Background/Environment exactly
        - Lighting direction (but preserve skin texture)

        WHAT TO IGNORE FROM THIS REFERENCE:
        - The face (use [FACE_ANCHOR] instead)
        - Skin smoothing or beauty filters
        - Any facial proportions

        ACTION: Perform a Face Swap. Put the Avatar's LOCKED Face onto this body/outfit.
        ACTION: Adjust the body proportions to match the measurements provided in text.
        `;
    }
  }

  // SMART REFERENCE BUDGETING
  const MAX_TOTAL_IMAGES = 5;
  let currentImageCount = 0;
  if (faceRefImage) currentImageCount++;
  if (angleRefImage) currentImageCount++; 
  if (bodyRefImage) currentImageCount++;
  if (sceneReference) currentImageCount++;

  let remainingSlots = MAX_TOTAL_IMAGES - currentImageCount;
  let selectedAssets: ReferenceImage[] = [];
  let selectedGeneralRefs: ReferenceImage[] = [];

  if (remainingSlots > 0) {
      if (faceRefImage || bodyRefImage) {
          const assetsTaking = Math.min(assetReferences.length, remainingSlots);
          selectedAssets = assetReferences.slice(0, assetsTaking);
      } else {
          const generalTaking = Math.min(avatarReferences.length, Math.min(3, remainingSlots));
          selectedGeneralRefs = avatarReferences.slice(0, generalTaking);
          remainingSlots -= generalTaking;
          if (remainingSlots > 0) {
              const assetsTaking = Math.min(assetReferences.length, remainingSlots);
              selectedAssets = assetReferences.slice(0, assetsTaking);
          }
      }
  }

  // REFERENCE MAPPING (PARTS ARRAY)
  const parts: any[] = [];
  let refIndex = 1;
  let refMappingText = "";

  const appendImage = async (img: ReferenceImage, desc: string, label: string) => {
     refMappingText += `- Image ${refIndex} [${label}]: ${desc}\n`;
     refIndex++;
     const optimizedBase64 = await resizeBase64Image(img.base64, img.mimeType);
     parts.push({ inlineData: { mimeType: 'image/jpeg', data: optimizedBase64 } });
  };

  // SYSTEM PREAMBLE - GOLDEN RULE: IDENTITY BEFORE STYLE
  const systemPreamble = `
    SYSTEM COMMANDS (HIGHEST PRIORITY):

    ===== RULE #0: IDENTITY BEFORE STYLE =====
    ${IDENTITY_SKIN_LOCK}

    ===== RULE #1: OUTPUT SETTINGS =====
    - ASPECT RATIO: ${aspectRatio}.
    - MODE: ${isHighStyleWeight && sceneReference ? "VISUAL RECONSTRUCTION / FACE SWAP" : "TEXT-TO-IMAGE WITH AVATAR"}.
    - QUALITY: 8k, editorial-grade photorealism.

    ===== RULE #2: PHYSICAL BLUEPRINT =====
    ${physicalInstructions}

    ===== RULE #3: IDENTITY DIRECTIVES =====
    ${identityInstructions}

    ===== PRIORITY ORDER =====
    1. IDENTITY & SKIN (Rule #0) - NEVER compromise
    2. PHYSICAL MEASUREMENTS (Rule #2)
    3. STYLE/COMPOSITION (if applicable) - ONLY after identity is locked
  `;
  parts.push({ text: systemPreamble });

  // 1. FACE REFERENCE (PRIORITY #1) - Frontal view is the identity anchor
  const frontFaceRef = multiAngleRefs?.front || faceRefImage;
  if (frontFaceRef) {
      await appendImage(frontFaceRef, "IDENTITY SOURCE (FRONTAL) - Primary face reference. This is the ground truth for face identity.", "FACE_ANCHOR");
  } else if (selectedGeneralRefs.length > 0) {
      await appendImage(selectedGeneralRefs[0], "IDENTITY SOURCE", "FACE_ANCHOR");
      selectedGeneralRefs = selectedGeneralRefs.slice(1);
  }

  // 2. MULTI-ANGLE REFERENCE SYSTEM - For 3D consistency
  if (multiAngleRefs) {
    // 3/4 view (45 degree) - Critical for nose bridge, cheekbone, jaw depth
    if (multiAngleRefs.threeQuarter) {
      await appendImage(
        multiAngleRefs.threeQuarter,
        "3/4 ANGLE VIEW (45°) - Use for: nose bridge profile, cheekbone prominence, jaw depth, how features appear at angles.",
        "ANGLE_3Q"
      );
    }
    // Profile view (90 degree) - Critical for nose shape, chin projection
    if (multiAngleRefs.profile) {
      await appendImage(
        multiAngleRefs.profile,
        "PROFILE VIEW (90°) - Use for: nose shape from side, chin projection, forehead slope, lip protrusion, ear visibility.",
        "ANGLE_PROFILE"
      );
    }
    // 3/4 back view - Optional, for hair and ear shape
    if (multiAngleRefs.threeQuarterBack) {
      await appendImage(
        multiAngleRefs.threeQuarterBack,
        "3/4 BACK VIEW - Use for: back of head shape, hair texture, ear shape from behind.",
        "ANGLE_3Q_BACK"
      );
    }
  } else if (angleRefImage) {
    // Legacy: single angle sheet fallback
    await appendImage(angleRefImage, "GEOMETRY SOURCE - Use for 3D structural depth (Jaw/Nose/Profile).", "ANGLE_SHEET");
  }

  // 3. BODY REFERENCE
  if (bodyRefImage) {
      await appendImage(bodyRefImage, "SKIN TEXTURE SOURCE (Override shape with Text)", "BODY_TEXTURE");
  }

  // 4. STYLE REFERENCE (Crucial Placement)
  if (sceneReference) {
      await appendImage(sceneReference, styleDirectives, styleLabel);
  }

  // 5. ASSETS/EXTRAS
  for (const img of selectedGeneralRefs) {
      await appendImage(img, "Supplemental ID Info", "EXTRA_REF");
  }
  for (const img of selectedAssets) {
      await appendImage(img, "Item to include", "ASSET");
  }

  // CONSTRUCT FINAL PROMPT - WITH GOLDEN RULE
  let finalPrompt = "";

  if (isHighStyleWeight && sceneReference) {
      // High Style Weight Mode - BUT IDENTITY & BODY STILL TAKE PRECEDENCE
      finalPrompt = `
      ========== GOLDEN RULE: IDENTITY & BODY BEFORE STYLE ==========

      TASK: Recreate Image [${styleLabel}] but with the Avatar's LOCKED Identity AND Body.

      ======= IMMUTABLE - FACE (NEVER CHANGE) =======
      - Facial geometry, landmarks, proportions
      - Skin texture (pores, marks, peach fuzz, micro-texture)
      - Eye shape, nose structure, lip volume, jawline

      ======= IMMUTABLE - BODY (NEVER CHANGE) =======
      BUST: ${bustVisual}
      - ${measurements.bust >= 95 ? "The breasts MUST be LARGE and PROMINENT in the final image" : "Proportional bust"}
      - ${measurements.bust >= 95 ? "Bust curves MUST be visible even through clothing" : ""}

      HIPS/GLUTES: ${hipsVisual}
      - ${measurements.hips >= 95 ? "The hips/rear MUST be WIDE and PROMINENT in the final image" : "Proportional hips"}
      - ${measurements.hips >= 95 ? "Hip width MUST be noticeably wider than waist" : ""}

      FIGURE: ${ratioVisual}
      - ${parseFloat(hipWaistRatio) >= 1.35 ? "HOURGLASS SILHOUETTE MANDATORY - waist curves inward visibly" : ""}

      FULL BODY DESCRIPTION: ${bodyAdjectives}

      ======= MUTABLE (from Style Reference) =======
      - Outfit style, clothing design (but must CONFORM to body curves)
      - Pose, position (but body proportions stay fixed)
      - Background, environment, lighting

      REFERENCE MAPPING:
      ${refMappingText}

      CONTEXT FROM USER:
      "${prompt}"

      EXECUTION STEPS:
      1. Copy the Outfit, Pose, Background from [${styleLabel}].
      2. REPLACE the face with [FACE_ANCHOR] - exact match required.
      3. RESHAPE the body silhouette to show: ${bustVisual} AND ${hipsVisual}
      4. Ensure the ${ratioVisual} is VISIBLE in the silhouette.
      5. Clothing must CONFORM to curves, not hide them.

      FINAL CHECK (ALL MUST BE YES):
      - Face matches [FACE_ANCHOR] exactly?
      - ${measurements.bust >= 95 ? "Are the BREASTS visually LARGE/PROMINENT?" : "Bust proportional?"}
      - ${measurements.hips >= 95 ? "Are the HIPS/GLUTES visually WIDE/PROMINENT?" : "Hips proportional?"}
      - ${parseFloat(hipWaistRatio) >= 1.35 ? "Is the HOURGLASS waist curve visible?" : ""}
      If ANY is NO, CORRECT IT.
      `;
  } else {
      // Standard Mode
      finalPrompt = `
      ========== GOLDEN RULE: IDENTITY & BODY BEFORE STYLE ==========

      TASK: Generate a photorealistic image of the character.

      ======= IDENTITY LOCK (FACE) =======
      - Facial geometry from [FACE_ANCHOR]
      - Skin texture with visible pores, natural imperfections
      - No airbrushing, no beauty filters

      ======= BODY LOCK (PROPORTIONS) =======
      BUST: ${bustVisual}
      ${measurements.bust >= 95 ? "- BREASTS must be LARGE and PROMINENT" : ""}

      HIPS/GLUTES: ${hipsVisual}
      ${measurements.hips >= 95 ? "- HIPS/REAR must be WIDE and PROMINENT" : ""}

      FIGURE: ${ratioVisual}
      ${parseFloat(hipWaistRatio) >= 1.35 ? "- HOURGLASS waist curve MUST be visible" : ""}

      FULL BODY: ${bodyAdjectives}

      REFERENCE MAPPING:
      ${refMappingText}

      SCENE PROMPT:
      "${prompt}"

      EXECUTION STEPS:
      1. Build face from [FACE_ANCHOR] - exact match.
      2. Build body showing: ${bustVisual} AND ${hipsVisual}
      3. Ensure ${ratioVisual} silhouette.
      4. Render scene from prompt.

      FINAL CHECK:
      - Face matches [FACE_ANCHOR]?
      - ${measurements.bust >= 95 ? "BREASTS are LARGE/PROMINENT?" : "Bust OK?"}
      - ${measurements.hips >= 95 ? "HIPS/GLUTES are WIDE/PROMINENT?" : "Hips OK?"}
      - ${parseFloat(hipWaistRatio) >= 1.35 ? "HOURGLASS silhouette visible?" : ""}
      `;
  }
  
  parts.push({ text: finalPrompt });

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: parts,
      },
      config: {
        imageConfig: {
            aspectRatio: aspectRatio,
        }
      }
    });

    console.log("Gemini API Response Candidate:", response.candidates?.[0]);

    const candidate = response.candidates?.[0];

    if (!candidate) {
      throw new Error("No candidates returned from the API.");
    }

    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      const reason = candidate.finishReason;
      let explanation = "";
      if (candidate.content?.parts) {
        explanation = candidate.content.parts.filter(p => p.text).map(p => p.text).join(" ").slice(0, 150);
      }
      if (reason === 'SAFETY' || reason === 'IMAGE_SAFETY') {
          throw new Error("Safety Block: The model detected content that violates safety guidelines. Try softening the prompt.");
      }
      if (reason === 'IMAGE_OTHER') {
          throw new Error("Generation Failed (IMAGE_OTHER): Complex constraint conflict. Try reducing the number of reference images.");
      }
      if (reason === 'OTHER') {
          throw new Error("Generation stopped (OTHER): The model may be overloaded with high-res images. Resizing applied automatically, please retry.");
      }
      throw new Error(`Generation stopped (${reason})${explanation ? ': ' + explanation : ''}`);
    }

    for (const part of candidate.content?.parts || []) {
      if (part.inlineData) {
        const base64EncodeString: string = part.inlineData.data;
        return `data:image/jpeg;base64,${base64EncodeString}`;
      }
    }

    let refusalText = "";
    for (const part of candidate.content?.parts || []) {
      if (part.text) refusalText += part.text;
    }

    if (refusalText) {
      throw new Error(`Model Refusal: ${refusalText.slice(0, 150)}...`);
    }

    throw new Error("Model returned success but no image data found.");
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    throw error;
  }
};

export const generateVideo = async (
  prompt: string,
  imageInput: ReferenceImage | null,
  avatarReferences: ReferenceImage[] = [], 
  faceRefImage: ReferenceImage | null = null,
  bodyRefImage: ReferenceImage | null = null,
  aspectRatio: AspectRatio,
  provider: GenProvider | null,
  assetReferences: ReferenceImage[] = [],
  sceneReference: ReferenceImage | null = null, // IMPORTANT: Style Ref
  faceDescription: string = "",
  resolution: VideoResolution = "720p",
  cameraMotion: CameraMotion = "NONE",
  subjectAction: SubjectAction = "NONE",
  dialogue: string = "",
  voiceStyle: string = "Realistic",
  noMusic: boolean = false
): Promise<string> => {
    
    if (provider && provider.type !== 'GOOGLE') {
      throw new Error(`Video generation for ${provider.name} is not implemented.`);
    }

    const apiKey = provider ? provider.apiKey : process.env.API_KEY;
    if (!apiKey) throw new Error("API Key not found");
    
    const ai = new GoogleGenAI({ apiKey });

    // Determine Model and References
    let modelName = provider ? provider.model : 'veo-3.1-fast-generate-preview';
    let referenceImagesPayload: any[] = [];
    
    const hasRefs = (avatarReferences && avatarReferences.length > 0) || faceRefImage || bodyRefImage || (assetReferences && assetReferences.length > 0) || sceneReference;
    
    // Default Resolution
    let targetResolution = resolution;
    let targetAspectRatio = aspectRatio === '16:9' ? '16:9' : '9:16'; // Fallback to supported 16:9 or 9:16 only
    if (aspectRatio === '1:1' || aspectRatio === '4:3') targetAspectRatio = '16:9';
    if (aspectRatio === '3:4') targetAspectRatio = '9:16';

    // ENFORCE CHARACTER REFERENCE CONSTRAINTS
    // Veo 3.1 Character Reference (Avatar Mode) currently ONLY supports 16:9 and 720p.
    if (hasRefs && (!imageInput)) {
        if (targetAspectRatio !== '16:9' || targetResolution !== '720p') {
            console.log("Enforcing 16:9 720p for Veo Avatar generation constraints.");
            targetAspectRatio = '16:9';
            targetResolution = '720p';
        }
    }

    // PREPARE REFERENCES (SMART SELECTION - MAX 3)
    if (hasRefs && (!imageInput)) {
        modelName = 'veo-3.1-generate-preview';
        
        // PRIORITY QUEUE FOR VEO REFERENCES
        // 1. FACE (Identity)
        if (faceRefImage) {
            const resized = await resizeBase64Image(faceRefImage.base64, faceRefImage.mimeType);
            referenceImagesPayload.push({
                image: { imageBytes: resized, mimeType: 'image/jpeg' },
                referenceType: 'ASSET'
            });
        }
        
        // 2. STYLE REFERENCE (Crucial if present)
        if (sceneReference && referenceImagesPayload.length < 3) {
             const resized = await resizeBase64Image(sceneReference.base64, sceneReference.mimeType);
             referenceImagesPayload.push({
                image: { imageBytes: resized, mimeType: 'image/jpeg' },
                referenceType: 'ASSET' 
            });
        }

        // 3. BODY REF
        if (bodyRefImage && referenceImagesPayload.length < 3) {
             const resized = await resizeBase64Image(bodyRefImage.base64, bodyRefImage.mimeType);
             referenceImagesPayload.push({
                image: { imageBytes: resized, mimeType: 'image/jpeg' },
                referenceType: 'ASSET'
            });
        }

        // 4. GENERAL AVATAR (Fallback Identity)
        if (referenceImagesPayload.length < 3 && avatarReferences.length > 0) {
             const available = 3 - referenceImagesPayload.length;
             for (const ref of avatarReferences.slice(0, available)) {
                 const resized = await resizeBase64Image(ref.base64, ref.mimeType);
                 referenceImagesPayload.push({
                    image: { imageBytes: resized, mimeType: 'image/jpeg' },
                    referenceType: 'ASSET'
                 });
             }
        }
        
        // 5. ASSETS (Props)
        if (referenceImagesPayload.length < 3 && assetReferences.length > 0) {
             const availableSlots = 3 - referenceImagesPayload.length;
             for (const asset of assetReferences.slice(0, availableSlots)) {
                 const resized = await resizeBase64Image(asset.base64, asset.mimeType);
                 referenceImagesPayload.push({
                    image: { imageBytes: resized, mimeType: 'image/jpeg' },
                    referenceType: 'ASSET'
                });
             }
        }
        
        referenceImagesPayload = referenceImagesPayload.slice(0, 3);
    }

    // SANITIZE & ENHANCE PROMPT
    let finalPrompt = prompt.trim();
    const lowerPrompt = finalPrompt.toLowerCase();
    
    // Inject Camera Motion
    let cameraText = "";
    switch (cameraMotion) {
        case "ZOOM_IN": cameraText = "Slow cinematic zoom in towards the subject."; break;
        case "ZOOM_OUT": cameraText = "Slow pull back zoom out revealing the environment."; break;
        case "PAN_LEFT": cameraText = "Smooth camera pan to the left."; break;
        case "PAN_RIGHT": cameraText = "Smooth camera pan to the right."; break;
        case "TRACKING": cameraText = "Handheld camera tracking the subject movement."; break;
    }
    
    // Inject Action
    let actionText = "";
    if (dialogue) {
        actionText = "Subject is looking directly at the camera, lips moving naturally in synchronization with the speech. High quality portrait video. ";
    } else {
        switch (subjectAction) {
            case "TALKING": actionText = "Subject is looking directly at the camera, lips moving naturally as if speaking, expressive facial gestures."; break;
            case "WALKING": actionText = "Subject is walking confidently through the scene, natural gait."; break;
            case "RUNNING": actionText = "Subject is running, dynamic motion, motion blur."; break;
            case "POSING": actionText = "Subject is posing for a fashion photoshoot, slight shifts in posture, looking at camera."; break;
            case "IDLE": actionText = "Subject is standing still, breathing naturally, subtle movements, looking around."; break;
        }
    }

    if (cameraText || actionText) {
        finalPrompt = `${finalPrompt}. ${actionText} ${cameraText}`;
    }
    
    if (dialogue) {
        const audioInstruction = ` Audio: High-fidelity synchronized audio. Character speaks: "${dialogue}". Voice: ${voiceStyle}.`;
        finalPrompt += audioInstruction;
    }
    
    if (noMusic) {
        finalPrompt += " Audio environment: Dialogue and natural ambient sound effects only. NO background music.";
    }

    // Explicitly link references in prompt
    if (hasRefs && !imageInput) {
        finalPrompt += " The character in the video MUST resemble the provided reference assets.";
    }

    // Safety fallback prompt check
    const riskyKeywords = ['copy', 'clone', 'duplicate', 'same', 'replicate', 'exact'];
    const isRisky = riskyKeywords.some(keyword => lowerPrompt.includes(keyword));
    if (isRisky) {
        finalPrompt = `A cinematic video shot of this character in a natural environment. ${actionText || "Character looks natural."} ${dialogue ? 'Character is speaking.' : ''}`;
    }

    // -- EXECUTE --
    const executeVideoGeneration = async (
        currentModel: string,
        currentPrompt: string,
        refsPayload: any[],
        imgInput: ReferenceImage | null,
        targetAspect: string,
        targetRes: VideoResolution
    ) => {
        let operation;

        if (imgInput) {
            // Animate Mode
            const resizedInput = await resizeBase64Image(imgInput.base64, imgInput.mimeType);
            operation = await ai.models.generateVideos({
                model: 'veo-3.1-fast-generate-preview',
                prompt: currentPrompt || "Animate this scene naturally.",
                image: { imageBytes: resizedInput, mimeType: 'image/jpeg' },
                config: { numberOfVideos: 1, resolution: targetRes, aspectRatio: targetAspect }
            });
        } else {
            // Avatar Mode
            const config: any = { numberOfVideos: 1, resolution: targetRes, aspectRatio: targetAspect };
            if (refsPayload.length > 0) config.referenceImages = refsPayload;
            
            operation = await ai.models.generateVideos({
                model: currentModel,
                prompt: currentPrompt,
                config: config
            });
        }

        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 10000));
            const newOp = await ai.operations.getVideosOperation({ operation: operation });
            operation = newOp;
        }

        if (operation.error) throw new Error(operation.error.message || JSON.stringify(operation.error));
        
        if (operation.response?.raiMediaFilteredReasons?.length > 0) {
            const reasons = operation.response.raiMediaFilteredReasons.join(', ');
            throw new Error(`RAI_FILTERED: ${reasons}`);
        }

        const videoResult = operation.response?.generatedVideos?.[0] || (operation as any).result?.generatedVideos?.[0];
        const videoUri = videoResult?.video?.uri;
        
        if (!videoUri) throw new Error("Video generation completed without output.");
        return videoUri;
    };

    const downloadVideoBlob = async (uri: string) => {
        const response = await fetch(`${uri}&key=${apiKey}`);
        if (!response.ok) throw new Error("Failed to download video file.");
        const blob = await response.blob();
        return URL.createObjectURL(blob);
    };

    let currentError: any = null;

    // ATTEMPT 1: Try with requested (or enforced) Aspect Ratio and References
    try {
        const uri = await executeVideoGeneration(modelName, finalPrompt, referenceImagesPayload, imageInput, targetAspectRatio, targetResolution);
        return await downloadVideoBlob(uri);

    } catch (e: any) {
        console.error("Video Generation Attempt 1 Failed:", e);
        currentError = e;
    }

    // HANDLE 400: INVALID ARGUMENT (Usually Aspect Ratio/Res mismatch with References)
    const errorMessage = currentError?.message || "";
    if (errorMessage.includes('INVALID_ARGUMENT') || errorMessage.includes('400')) {
             console.warn("Invalid Argument detected. Retrying with enforced safe settings (16:9, 720p).");
             // Retry with known safe constraints
             try {
                const uri = await executeVideoGeneration(modelName, finalPrompt, referenceImagesPayload, imageInput, '16:9', '720p');
                return await downloadVideoBlob(uri);
             } catch (retryError: any) {
                 console.error("Retry with safe settings failed:", retryError);
                 currentError = retryError; // Update currentError to the newest one (e.g., RAI_FILTERED)
             }
    }

    // CHECK FOR SAFETY ERROR (From Attempt 1 OR from Safe Settings Retry)
    // Now we check currentError, which might have been updated by the retry block above.
    const finalErrorMessage = currentError?.message || "";
    const isSafetyError = finalErrorMessage.includes('RAI_FILTERED') || finalErrorMessage.includes('SAFETY');

    if (isSafetyError && !imageInput && hasRefs) {
            console.warn("Safety Block Triggered. Starting Intelligent Fallback Sequence.");
            
            // FALLBACK 1: PRESERVE STYLE, DROP FACE (Likeness)
            // If we have a Style Reference, keep it. Drop the Face Ref.
            if (sceneReference && referenceImagesPayload.some(r => r.referenceType === 'ASSET')) {
                    console.warn("Fallback 1: Keeping Style/Scene ref only, using Text for Face.");
                    let safePayload: any[] = [];
                    
                    // Keep Scene Ref
                    const resizedScene = await resizeBase64Image(sceneReference.base64, sceneReference.mimeType);
                    safePayload.push({
                    image: { imageBytes: resizedScene, mimeType: 'image/jpeg' },
                    referenceType: 'ASSET'
                    });
                    
                    // Keep Body Ref if available
                    if (bodyRefImage) {
                        const resizedBody = await resizeBase64Image(bodyRefImage.base64, bodyRefImage.mimeType);
                        safePayload.push({
                        image: { imageBytes: resizedBody, mimeType: 'image/jpeg' },
                        referenceType: 'ASSET'
                        });
                    }

                    const fallbackPrompt = `A cinematic video. ${finalPrompt}. Character appearance: ${faceDescription}.`;
                    try {
                        const uri = await executeVideoGeneration(modelName, fallbackPrompt, safePayload, null, '16:9', '720p');
                        return await downloadVideoBlob(uri);
                    } catch (err) { console.warn("Fallback 1 failed, trying Fallback 2..."); }
            }

            // FALLBACK 2: TEXT ONLY (Last Resort)
            console.warn("Fallback 2: Pure Text-to-Video.");
            const safePayload: any[] = [];
            const fallbackPrompt = `A fictional character animation. ${finalPrompt}. Character appearance: ${faceDescription || "described in text"}.`;
            
            try {
                // Use 16:9 / 720p to be safe as we had issues before
                const uri = await executeVideoGeneration(modelName, fallbackPrompt, safePayload, null, '16:9', '720p');
                return await downloadVideoBlob(uri);
            } catch (retryError: any) {
                console.error("All retries failed:", retryError);
                // Throw the very last error
                throw retryError;
            }
    }

    if (finalErrorMessage.includes('RAI_FILTERED')) {
            const reasons = finalErrorMessage.replace('RAI_FILTERED: ', '');
            throw new Error(`Video blocked by safety filter: ${reasons}. (Fallback failed).`);
    }
    
    // If we haven't returned or thrown by now, throw the last error
    throw new Error(finalErrorMessage || "Video generation failed");
}
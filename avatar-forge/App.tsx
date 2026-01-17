
import React, { useState, useEffect, useRef } from 'react';
import ReferenceUploader from './components/ReferenceUploader';
import ApiKeyBanner from './components/ApiKeyBanner';
import ImagePreviewModal from './components/ImagePreviewModal';
import ProviderManager from './components/ProviderManager';
import PromptLibrary from './components/PromptLibrary';
import { generateAvatar, analyzePromptSafety, describeImageForPrompt, generateVideo, enhancePrompt, getBodyDescriptors, editImage } from './services/geminiService';
import { savePresetToDB, getAllPresetsFromDB, deletePresetFromDB } from './services/storageService';
import { ReferenceImage, GeneratedImage, AppState, AspectRatio, AvatarPreset, PromptAnalysisResult, PhysicalAttributes, GenProvider, MediaType, VideoResolution, CameraMotion, SubjectAction, PromptPreset } from './types';

// Updated with SVG icons for Aspect Ratios
const ASPECT_RATIOS: { value: AspectRatio; label: string; icon: React.ReactNode }[] = [
  { value: "1:1", label: "Square (1:1)", icon: <div className="w-3 h-3 border-2 border-current rounded-sm"></div> },
  { value: "16:9", label: "Landscape (16:9)", icon: <div className="w-4 h-2.5 border-2 border-current rounded-sm"></div> },
  { value: "9:16", label: "Portrait (9:16)", icon: <div className="w-2.5 h-4 border-2 border-current rounded-sm"></div> },
  { value: "4:3", label: "Standard (4:3)", icon: <div className="w-4 h-3 border-2 border-current rounded-sm"></div> },
  { value: "3:4", label: "Vertical (3:4)", icon: <div className="w-3 h-4 border-2 border-current rounded-sm"></div> },
];

const VOICE_STYLES = [
    "Realistic", "Soft Female", "Deep Male", "Energetic", "Whisper", 
    "British Accent", "American Accent", "Robot", "Narrator"
];

const QUICK_STYLES = [
    "Warm, professional lighting",
    "Cinematic lighting",
    "Shallow depth of field",
    "Golden hour lighting",
    "Documentary-style",
    "Corporate clean style",
    "Ultra high-quality 4k cinematic",
    "Cyberpunk Neon",
    "Natural Soft Light",
    "Dramatic Noir"
];

type VideoSubMode = 'ANIMATE' | 'AVATAR';

function App() {
  const [keyReady, setKeyReady] = useState(true);
  
  // App Mode
  const [generationMode, setGenerationMode] = useState<MediaType>('IMAGE');
  const [videoSubMode, setVideoSubMode] = useState<VideoSubMode>('ANIMATE');

  // Avatar & Presets State
  const [avatarImages, setAvatarImages] = useState<ReferenceImage[]>([]);
  // assetImages State - managed here, part of scene
  const [assetImages, setAssetImages] = useState<ReferenceImage[]>([]);
  
  // Specific Refs
  const [faceRefImage, setFaceRefImage] = useState<ReferenceImage | null>(null);
  const [angleRefImage, setAngleRefImage] = useState<ReferenceImage | null>(null); // NEW
  const [bodyRefImage, setBodyRefImage] = useState<ReferenceImage | null>(null);

  const [presets, setPresets] = useState<AvatarPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string>('');
  const [identityWeight, setIdentityWeight] = useState<number>(85);
  
  // Physical Attributes State - Default Age 25
  const [measurements, setMeasurements] = useState<PhysicalAttributes>({ age: 25, bust: 90, waist: 60, hips: 90 });
  const [faceDescription, setFaceDescription] = useState<string>("");

  // Provider State
  const [providers, setProviders] = useState<GenProvider[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string>('');
  const [showProviderManager, setShowProviderManager] = useState(false);

  // Generation State
  const [sceneImage, setSceneImage] = useState<ReferenceImage | null>(null);
  const [styleWeight, setStyleWeight] = useState<number>(50);
  const [showStylePopover, setShowStylePopover] = useState(false); // New state for style popover

  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [videoResolution, setVideoResolution] = useState<VideoResolution>("720p");
  const [cameraMotion, setCameraMotion] = useState<CameraMotion>("NONE");
  const [subjectAction, setSubjectAction] = useState<SubjectAction>("NONE");
  const [videoDialogue, setVideoDialogue] = useState<string>(""); 
  const [voiceStyle, setVoiceStyle] = useState<string>("Realistic"); // NEW
  const [noMusic, setNoMusic] = useState(false); // NEW
  
  // Video specific state
  const [videoInputImage, setVideoInputImage] = useState<ReferenceImage | null>(null);

  // Safety Check & Image Description State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false);
  const [isDescribingImage, setIsDescribingImage] = useState(false);
  const [safetyAnalysis, setSafetyAnalysis] = useState<PromptAnalysisResult | null>(null);
  const [selectedRiskTerm, setSelectedRiskTerm] = useState<string | null>(null);
  
  // Prompt Library State
  const [promptPresets, setPromptPresets] = useState<PromptPreset[]>([]);
  const [isPromptLibraryOpen, setIsPromptLibraryOpen] = useState(false);
  const [showSavePromptInput, setShowSavePromptInput] = useState(false);
  const [newPromptName, setNewPromptName] = useState('');

  // Montage / Studio State
  const [isMontageMode, setIsMontageMode] = useState(false);
  const [montageSelection, setMontageSelection] = useState<string[]>([]);
  const [isStitching, setIsStitching] = useState(false);

  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [gallery, setGallery] = useState<GeneratedImage[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<GeneratedImage | null>(null);

  const isAvatarLocked = appState === AppState.AVATAR_DEFINED || appState === AppState.GENERATING || appState === AppState.SUCCESS;
  // Computed: Has any valid avatar reference been loaded?
  const hasAvatarRefs = avatarImages.length > 0 || faceRefImage !== null || bodyRefImage !== null;

  // Load Presets (IndexedDB), Providers, Prompts (LocalStorage)
  useEffect(() => {
    refreshPresets();
    
    // Providers
    const savedProviders = localStorage.getItem('avatar_forge_providers');
    if (savedProviders) {
      try {
        const parsed = JSON.parse(savedProviders);
        setProviders(parsed);
        if (parsed.length > 0) setActiveProviderId(parsed[0].id);
      } catch (e) { console.error(e); }
    }

    // Prompts
    const savedPrompts = localStorage.getItem('avatar_forge_prompts');
    if (savedPrompts) {
        try {
            setPromptPresets(JSON.parse(savedPrompts));
        } catch (e) { console.error(e); }
    }
  }, []);

  const refreshPresets = async () => {
      try {
        // Migration Check
        const legacyPresets = localStorage.getItem('avatar_forge_presets');
        if (legacyPresets) {
            console.log("Migrating presets...");
            const parsedLegacy = JSON.parse(legacyPresets) as AvatarPreset[];
            for (const p of parsedLegacy) await savePresetToDB(p);
            localStorage.removeItem('avatar_forge_presets');
        }
        const dbPresets = await getAllPresetsFromDB();
        setPresets(dbPresets);
      } catch (e) { console.error("Failed to load presets", e); }
  };

  const handleUpdateProviders = (updated: GenProvider[]) => {
    setProviders(updated);
    try {
      localStorage.setItem('avatar_forge_providers', JSON.stringify(updated));
    } catch (e) { console.warn(e); }
  };

  // Prompt Library Handlers
  const handleSavePrompt = () => {
      if (!newPromptName.trim() || !prompt.trim()) return;
      
      const newPreset: PromptPreset = {
          id: crypto.randomUUID(),
          name: newPromptName.trim(),
          text: prompt.trim(),
          type: generationMode,
          createdAt: Date.now()
      };
      
      const updated = [...promptPresets, newPreset];
      setPromptPresets(updated);
      localStorage.setItem('avatar_forge_prompts', JSON.stringify(updated));
      
      setNewPromptName('');
      setShowSavePromptInput(false);
  };

  const handleDeletePrompt = (id: string) => {
      const updated = promptPresets.filter(p => p.id !== id);
      setPromptPresets(updated);
      localStorage.setItem('avatar_forge_prompts', JSON.stringify(updated));
  };

  const handleSelectPrompt = (preset: PromptPreset) => {
      setPrompt(preset.text);
      setIsPromptLibraryOpen(false);
  };

  // ... (Existing handlers: handleSavePreset, handleLoadPreset, etc.)
  const handleSavePreset = async (name: string, images: ReferenceImage[], faceRef: ReferenceImage | null, angleRef: ReferenceImage | null, bodyRef: ReferenceImage | null, weight: number, measures: PhysicalAttributes, faceDesc: string, forceNew: boolean = false) => {
    let id = activePresetId;
    let createdTime = Date.now();
    
    if (forceNew || !activePresetId) {
       id = typeof crypto !== 'undefined' && crypto.randomUUID 
        ? crypto.randomUUID() 
        : Date.now().toString(36) + Math.random().toString(36).substr(2);
       createdTime = Date.now();
    } else {
       const existing = presets.find(p => p.id === id);
       if (existing) createdTime = existing.createdAt;
    }

    const newPreset: AvatarPreset = {
      id,
      name: name.trim(),
      images: [...images],
      faceRefImage: faceRef,
      angleRefImage: angleRef, // NEW
      bodyRefImage: bodyRef,
      identityWeight: weight,
      measurements: measures,
      faceDescription: faceDesc,
      createdAt: createdTime
    };

    try {
      await savePresetToDB(newPreset);
      await refreshPresets();
      setActivePresetId(id);
    } catch (e) {
      console.error("Failed to save preset", e);
      alert("Failed to save character. Database might be full.");
    }
  };

  const handleLoadPreset = (preset: AvatarPreset) => {
    setAvatarImages(preset.images);
    setAssetImages([]); 
    setFaceRefImage(preset.faceRefImage || null);
    setAngleRefImage(preset.angleRefImage || null); // NEW
    setBodyRefImage(preset.bodyRefImage || null);
    setActivePresetId(preset.id);
    setIdentityWeight(preset.identityWeight || 85);
    
    // Backwards compatibility for Age
    const loadedMeasurements = preset.measurements || { bust: 90, waist: 60, hips: 90, age: 25 };
    if (loadedMeasurements.age === undefined) loadedMeasurements.age = 25;
    
    setMeasurements(loadedMeasurements);
    setFaceDescription(preset.faceDescription || "");
    setAppState(AppState.AVATAR_DEFINED);
  };

  const handleDeletePreset = async (id: string) => {
    try {
      await deletePresetFromDB(id);
      await refreshPresets();
      if (activePresetId === id) setActivePresetId('');
    } catch (e) { console.error(e); }
  };

  const handleExportData = () => {
      const dataStr = JSON.stringify(presets);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      
      const exportFileDefaultName = 'avatar_forge_backup.json';
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
  };

  const handleImportData = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;
      
      const file = files[0];
      const reader = new FileReader();
      reader.onload = async (e) => {
          try {
              const content = e.target?.result as string;
              const importedPresets = JSON.parse(content) as AvatarPreset[];
              
              if (!Array.isArray(importedPresets)) throw new Error("Invalid file format");
              
              let count = 0;
              for (const p of importedPresets) {
                  if (p.id && p.name && p.images) {
                      await savePresetToDB(p);
                      count++;
                  }
              }
              await refreshPresets();
              alert(`Successfully imported ${count} avatars.`);
          } catch (err) {
              console.error(err);
              alert("Failed to import data. Invalid JSON.");
          }
      };
      reader.readAsText(file);
      event.target.value = '';
  };

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (id === "") {
      // Don't fully clear state, maybe user wants to switch context?
      // For now, allow clearing preset ID
      setActivePresetId("");
      return;
    }
    const preset = presets.find(p => p.id === id);
    if (preset) handleLoadPreset(preset);
  };

  const handleLockAvatar = () => {
    // UPDATED LOGIC: Allow locking if ANY reference type is present
    if (avatarImages.length > 0 || faceRefImage || bodyRefImage || angleRefImage) {
        setAppState(AppState.AVATAR_DEFINED);
    }
  };

  const handleUnlockAvatar = () => setAppState(AppState.IDLE);

  const handleAssetUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;
    Array.from(files).forEach((file: File) => {
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(file.type)) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        const matches = result.match(/^data:(.+);base64,(.+)$/);
        if (matches) {
           const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
           const newImage: ReferenceImage = { id, url: result, mimeType: matches[1], base64: matches[2] };
          setAssetImages(prev => [...prev, newImage]);
        }
      };
      reader.readAsDataURL(file);
    });
    event.target.value = '';
  };

  const handleSceneUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const matches = result.match(/^data:(.+);base64,(.+)$/);
      if (matches) {
        setSceneImage({
          id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
          url: result,
          mimeType: matches[1],
          base64: matches[2]
        });
        setStyleWeight(50);
        setShowStylePopover(true); // Show popover immediately on upload
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };
  
  const handleVideoInputUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (!files || files.length === 0) return;
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
          const result = e.target?.result as string;
          const matches = result.match(/^data:(.+);base64,(.+)$/);
          if (matches) {
              setVideoInputImage({
                  id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
                  url: result,
                  mimeType: matches[1],
                  base64: matches[2]
              });
          }
      };
      reader.readAsDataURL(file);
      event.target.value = '';
  };

  const handleImageDescriptionUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    processDescriptionImage(files[0]);
    event.target.value = '';
  };
  
  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if(e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          if (generationMode === 'VIDEO' && videoSubMode === 'ANIMATE') {
             // Drop to video input
             const file = e.dataTransfer.files[0];
             const reader = new FileReader();
             reader.onload = (evt) => {
                 const result = evt.target?.result as string;
                 const matches = result.match(/^data:(.+);base64,(.+)$/);
                 if (matches) {
                     setVideoInputImage({ id: "dropped-vid", url: result, mimeType: matches[1], base64: matches[2] });
                 }
             };
             reader.readAsDataURL(file);
          } else {
             processDescriptionImage(e.dataTransfer.files[0]);
          }
      }
  };
  
  const processDescriptionImage = (file: File) => {
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(file.type)) return;
      setIsDescribingImage(true);
      const reader = new FileReader();
      reader.onload = async (e) => {
          const result = e.target?.result as string;
          const matches = result.match(/^data:(.+);base64,(.+)$/);
          if (matches) {
              const imgData: ReferenceImage = { id: "temp-desc", url: result, base64: matches[2], mimeType: matches[1] };
              try {
                  let customKey: string | undefined = undefined;
                  if (activeProviderId) {
                      const provider = providers.find(p => p.id === activeProviderId);
                      if (provider && provider.type === 'GOOGLE') customKey = provider.apiKey;
                  }
                  const description = await describeImageForPrompt(imgData, customKey);
                  setPrompt(prev => prev ? `${prev} ${description}` : description);
              } catch (err) { console.error(err); setErrorMsg("Failed to analyze image."); } 
              finally { setIsDescribingImage(false); }
          }
      };
      reader.readAsDataURL(file);
  };

  const handleDeleteImage = (id: string) => {
    setGallery(prev => prev.filter(img => img.id !== id));
    if (previewImage && previewImage.id === id) setPreviewImage(null);
    if (isMontageMode) {
        setMontageSelection(prev => prev.filter(mid => mid !== id));
    }
  };
  
  const handleRemoveAsset = (id: string) => setAssetImages(prev => prev.filter(img => img.id !== id));
  const handleRemoveVideoInput = () => setVideoInputImage(null);

  const handleNextImage = () => {
    if (!previewImage) return;
    const currentIndex = gallery.findIndex(img => img.id === previewImage.id);
    // Invert logic: Next (Right) goes to Older images (higher index)
    if (currentIndex < gallery.length - 1) setPreviewImage(gallery[currentIndex + 1]);
  };

  const handlePrevImage = () => {
    if (!previewImage) return;
    const currentIndex = gallery.findIndex(img => img.id === previewImage.id);
    // Invert logic: Prev (Left) goes to Newer images (lower index)
    if (currentIndex > 0) setPreviewImage(gallery[currentIndex - 1]);
  };

  const hasNextImage = previewImage ? gallery.findIndex(img => img.id === previewImage.id) < gallery.length - 1 : false;
  const hasPrevImage = previewImage ? gallery.findIndex(img => img.id === previewImage.id) > 0 : false;

  const handleAnimateWithVeo = async (img: GeneratedImage) => {
      try {
          const res = await fetch(img.url);
          const blob = await res.blob();
          const reader = new FileReader();
          reader.onload = (e) => {
              const result = e.target?.result as string;
              const matches = result.match(/^data:(.+);base64,(.+)$/);
              if (matches) {
                  const refImg: ReferenceImage = { id: "veo-input-" + img.id, url: result, mimeType: matches[1], base64: matches[2] };
                  setVideoInputImage(refImg);
                  setGenerationMode('VIDEO');
                  setVideoSubMode('ANIMATE');
                  setPreviewImage(null);
                  setPrompt("Cinematic movement, slow motion, high quality.");
              }
          };
          reader.readAsDataURL(blob);
      } catch (e) {
          console.error("Failed to prepare animation", e);
      }
  };
  
  const handleVariant = async (img: GeneratedImage) => {
      try {
          // Prepare image as scene reference
          const res = await fetch(img.url);
          const blob = await res.blob();
          const reader = new FileReader();
          reader.onload = (e) => {
             const result = e.target?.result as string;
             const matches = result.match(/^data:(.+);base64,(.+)$/);
             if (matches) {
                 const refImg: ReferenceImage = { id: "var-" + img.id, url: result, mimeType: matches[1], base64: matches[2] };
                 setSceneImage(refImg);
                 setPrompt(img.prompt);
                 setAspectRatio(img.aspectRatio);
                 // Auto-trigger generation with low weight for variance
                 executeGeneration(refImg, 35);
                 setPreviewImage(null);
             }
          };
          reader.readAsDataURL(blob);
      } catch (e) { console.error("Variant preparation failed", e); }
  };
  
  const handleEditImage = async (originalImg: GeneratedImage, editPrompt: string, maskBase64: string | null) => {
      setPreviewImage(null); // Close modal
      setAppState(AppState.GENERATING);
      
      const activeProvider = activeProviderId ? providers.find(p => p.id === activeProviderId) : null;

      try {
          const resultUrl = await editImage(originalImg.url, editPrompt, maskBase64, activeProvider);
          
          const newImage: GeneratedImage = {
              id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
              url: resultUrl,
              prompt: `Edit: ${editPrompt} (from previous)`,
              aspectRatio: originalImg.aspectRatio,
              timestamp: Date.now(),
              mediaType: 'IMAGE'
          };
          
          setGallery(prev => [newImage, ...prev]);
          setAppState(AppState.SUCCESS);
          setPreviewImage(newImage); // Open new image
      } catch (e: any) {
          console.error(e);
          setAppState(AppState.ERROR);
          setErrorMsg(e.message || "Edit failed");
      }
  };
  
  const handleContinueVideo = async (base64Frame: string, promptSuggestion: string) => {
      const mime = "image/jpeg";
      const base64 = base64Frame.split(',')[1];
      const refImg: ReferenceImage = { id: "cont-" + Date.now(), url: base64Frame, mimeType: mime, base64: base64 };
      
      setVideoInputImage(refImg);
      setGenerationMode('VIDEO');
      setVideoSubMode('ANIMATE');
      setPreviewImage(null);
      setPrompt(promptSuggestion + " (Continued)");
  };

  // MONTAGE / STUDIO LOGIC
  const handleToggleMontage = () => {
      setIsMontageMode(!isMontageMode);
      setMontageSelection([]);
  };

  const handleSelectForMontage = (id: string, mediaType: MediaType) => {
      if (mediaType !== 'VIDEO') return;
      
      if (montageSelection.includes(id)) {
          setMontageSelection(prev => prev.filter(mid => mid !== id));
      } else {
          setMontageSelection(prev => [...prev, id]);
      }
  };

  const handleCreateMontage = async () => {
      if (montageSelection.length < 2) return;
      setIsStitching(true);

      try {
          // 1. Fetch all blobs and prepare hidden video elements
          const selectedVideos = montageSelection
              .map(id => gallery.find(g => g.id === id))
              .filter(v => v !== undefined) as GeneratedImage[];
          
          if (selectedVideos.length === 0) throw new Error("No videos found");

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error("Canvas not supported");

          // Initialize canvas size based on first video
          // We'll determine this dynamically when first video loads
          
          const videoElement = document.createElement('video');
          videoElement.muted = false; // We need audio
          videoElement.crossOrigin = "anonymous";
          videoElement.style.display = 'none';
          document.body.appendChild(videoElement);

          // Stream to recorder
          const stream = canvas.captureStream(30); // 30 FPS
          
          // Setup Audio Context to mix audio
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const destNode = audioCtx.createMediaStreamDestination();
          const sourceNode = audioCtx.createMediaElementSource(videoElement);
          sourceNode.connect(destNode);
          sourceNode.connect(audioCtx.destination); // Optional: hear it while stitching

          // Add audio track to canvas stream
          if (destNode.stream.getAudioTracks().length > 0) {
              stream.addTrack(destNode.stream.getAudioTracks()[0]);
          }

          const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
          const chunks: Blob[] = [];
          
          recorder.ondataavailable = (e) => {
              if (e.data.size > 0) chunks.push(e.data);
          };

          recorder.start();

          // Sequential Playback & Record
          for (const vid of selectedVideos) {
              await new Promise<void>((resolve, reject) => {
                  videoElement.src = vid.url;
                  videoElement.onloadedmetadata = () => {
                      if (canvas.width === 0 || canvas.width === 300) { // Default/Unset
                         canvas.width = videoElement.videoWidth;
                         canvas.height = videoElement.videoHeight;
                      }
                  };
                  
                  videoElement.onended = () => {
                      resolve();
                  };
                  
                  videoElement.onerror = (e) => reject(e);

                  // Draw loop
                  const draw = () => {
                      if (videoElement.paused || videoElement.ended) return;
                      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                      requestAnimationFrame(draw);
                  };

                  videoElement.play().then(() => {
                      draw();
                  }).catch(e => reject(e));
              });
          }

          recorder.stop();
          
          // Cleanup
          videoElement.remove();
          audioCtx.close();

          await new Promise<void>(resolve => {
              recorder.onstop = () => resolve();
          });

          const blob = new Blob(chunks, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          
          // Add to gallery
          const newMontage: GeneratedImage = {
              id: "montage-" + Date.now(),
              url: url,
              prompt: "Video Studio Montage (" + selectedVideos.length + " clips)",
              aspectRatio: selectedVideos[0].aspectRatio,
              timestamp: Date.now(),
              mediaType: 'VIDEO'
          };
          
          setGallery(prev => [newMontage, ...prev]);
          handleToggleMontage(); // Exit mode

      } catch (e) {
          console.error("Stitching failed", e);
          alert("Failed to stitch videos. Ensure format compatibility.");
      } finally {
          setIsStitching(false);
      }
  };

  const executeGeneration = async (overrideSceneImage: ReferenceImage | null = null, overrideStyleWeight: number | null = null) => {
    if (appState === AppState.GENERATING || !keyReady) return;
    if (!prompt.trim()) { alert("Please enter a prompt."); return; }

    const activeProvider = activeProviderId ? providers.find(p => p.id === activeProviderId) : null;
    if (activeProvider && activeProvider.type !== 'GOOGLE') {
        alert("Only Google provider is currently implemented for full generation.");
        return;
    }

    setAppState(AppState.GENERATING);
    setErrorMsg(null);
    setSafetyAnalysis(null);

    // Params
    const finalSceneImage = overrideSceneImage || sceneImage;
    const finalStyleWeight = overrideStyleWeight !== null ? overrideStyleWeight : styleWeight;

    try {
      let resultUrl: string = "";
      
      if (generationMode === 'IMAGE') {
          // IMAGE MODE
          resultUrl = await generateAvatar(
            prompt,
            avatarImages,
            assetImages,
            finalSceneImage,
            faceRefImage,
            bodyRefImage,
            angleRefImage, // NEW
            aspectRatio,
            identityWeight,
            finalStyleWeight,
            measurements,
            faceDescription,
            activeProvider
          );
      } else {
          // VIDEO MODE
          // Check SubMode
          if (videoSubMode === 'ANIMATE') {
             if (!videoInputImage) throw new Error("Please upload a start frame image to animate.");
             resultUrl = await generateVideo(
                 prompt, 
                 videoInputImage, 
                 [], null, null, 
                 aspectRatio, 
                 activeProvider, [], null, "", 
                 videoResolution, cameraMotion, subjectAction, videoDialogue, voiceStyle,
                 noMusic // Pass new param
             );
          } else {
             // CHARACTER SCENE MODE
             // We need at least an avatar or valid setup (Relaxed check, at least some identity info)
             if (avatarImages.length === 0 && !faceRefImage && !bodyRefImage) {
                 throw new Error("Please confirm/select an avatar from the sidebar first (or add at least a Face/Body ref).");
             }
             
             // CONSTRUCT CHARACTER PROMPT FOR VEO
             // Veo needs text instructions to know WHO is acting. We prepend the avatar description.
             const bodyDesc = getBodyDescriptors(measurements);
             const characterContext = `A ${measurements.age || 25} year old woman. Appearance: ${faceDescription || "Beautiful face"}. Body: ${bodyDesc}. `;
             const enhancedVideoPrompt = characterContext + prompt;
             
             resultUrl = await generateVideo(
                 enhancedVideoPrompt, // PASS ENHANCED PROMPT
                 null, 
                 avatarImages, 
                 faceRefImage, 
                 bodyRefImage, 
                 aspectRatio, 
                 activeProvider, 
                 assetImages, 
                 finalSceneImage, 
                 faceDescription,
                 videoResolution,
                 cameraMotion,
                 subjectAction,
                 videoDialogue, // Pass dialogue
                 voiceStyle, // Pass voice
                 noMusic // Pass new param
             );
          }
      }

      const newImage: GeneratedImage = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
        url: resultUrl,
        prompt: prompt,
        aspectRatio: aspectRatio,
        timestamp: Date.now(),
        mediaType: generationMode
      };

      setGallery(prev => [newImage, ...prev]);
      setAppState(AppState.SUCCESS);
    } catch (e: any) {
      console.error(e);
      setAppState(AppState.ERROR);
      setErrorMsg(e.message || "Generation failed");
    }
  };

  const handleGenerate = () => executeGeneration(null, null);

  const handleCheckSafety = async () => {
      setIsAnalyzing(true);
      setSafetyAnalysis(null);
      try {
          const result = await analyzePromptSafety(prompt);
          setSafetyAnalysis(result);
      } catch (e) {
          console.error(e);
      } finally {
          setIsAnalyzing(false);
      }
  };
  
  const handleEnhancePrompt = async () => {
      if (!prompt.trim()) return;
      setIsEnhancingPrompt(true);
      try {
          // Context image depends on mode
          let contextImg: ReferenceImage | null = null;
          if (generationMode === 'VIDEO' && videoSubMode === 'ANIMATE') {
              contextImg = videoInputImage;
          } else if (faceRefImage) {
              contextImg = faceRefImage; // Use face as context for avatar description
          } else if (avatarImages.length > 0) {
              contextImg = avatarImages[0];
          }
          
          // Get Active Provider Key
          const provider = activeProviderId ? providers.find(p => p.id === activeProviderId) : null;
          const apiKey = provider && provider.type === 'GOOGLE' ? provider.apiKey : undefined;
          
          const enhanced = await enhancePrompt(prompt, contextImg, apiKey);
          setPrompt(enhanced);
      } catch (e) {
          console.error(e);
      } finally {
          setIsEnhancingPrompt(false);
      }
  };

  const handleApplyCorrection = (correction: { term: string; alternatives: string[] }) => {
      if (!safetyAnalysis) return;
      const regex = new RegExp(correction.term, 'i');
      const newPrompt = prompt.replace(regex, correction.alternatives[0]); // Default to first alternative
      setPrompt(newPrompt);
      
      const newCorrections = safetyAnalysis.corrections.filter(c => c.term !== correction.term);
      setSafetyAnalysis({
          ...safetyAnalysis,
          corrections: newCorrections,
          isSafe: newCorrections.length === 0
      });
      setSelectedRiskTerm(null);
  };
  
  const handleApplyAlternative = (term: string, alternative: string) => {
      const regex = new RegExp(term, 'i');
      const newPrompt = prompt.replace(regex, alternative);
      setPrompt(newPrompt);
       
      if (safetyAnalysis) {
          const newCorrections = safetyAnalysis.corrections.filter(c => c.term !== term);
          setSafetyAnalysis({
              ...safetyAnalysis,
              corrections: newCorrections,
              isSafe: newCorrections.length === 0
          });
      }
      setSelectedRiskTerm(null);
  };

  const getStyleWeightLabel = (w: number) => {
      if (w < 30) return "Inspiration (Color Only)";
      if (w > 85) return "Strict (Copy Structure)";
      return "Balanced (Guide)";
  };

  const onReady = () => setKeyReady(true);
  
  // Logic to determine if a linked badge should show
  const activeAvatarName = activePresetId ? presets.find(p => p.id === activePresetId)?.name : null;
  const isLinked = activeAvatarName || (isAvatarLocked && hasAvatarRefs);

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden">
      <ApiKeyBanner onReady={onReady} />
      
      {/* Sidebar */}
      <ReferenceUploader 
        images={avatarImages} 
        setImages={setAvatarImages}
        faceRefImage={faceRefImage}
        setFaceRefImage={setFaceRefImage}
        angleRefImage={angleRefImage} // NEW
        setAngleRefImage={setAngleRefImage} // NEW
        bodyRefImage={bodyRefImage}
        setBodyRefImage={setBodyRefImage}
        isLocked={isAvatarLocked}
        onLock={handleLockAvatar}
        onUnlock={handleUnlockAvatar}
        presets={presets}
        onSavePreset={handleSavePreset}
        onLoadPreset={handleLoadPreset}
        onDeletePreset={handleDeletePreset}
        identityWeight={identityWeight}
        setIdentityWeight={setIdentityWeight}
        measurements={measurements}
        setMeasurements={setMeasurements}
        faceDescription={faceDescription}
        setFaceDescription={setFaceDescription}
        activePresetId={activePresetId}
        onExportDB={handleExportData}
        onImportDB={handleImportData}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full relative">
        {/* Header */}
        <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur flex items-center justify-between px-6 flex-shrink-0 z-20">
          <div className="flex items-center gap-4">
             <div>
               <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">Avatar Forge</h1>
               <p className="text-[10px] text-slate-500 uppercase tracking-widest">Consistent Character Generator</p>
             </div>
             
             {/* MODE SWITCHER */}
             <div className="flex items-center gap-2 ml-4">
                 <div className="bg-slate-800 p-1 rounded-lg flex text-xs font-bold border border-slate-700">
                    <button 
                      onClick={() => setGenerationMode('IMAGE')} 
                      className={`px-3 py-1 rounded transition-all ${generationMode === 'IMAGE' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                      IMG
                    </button>
                    <button 
                      onClick={() => setGenerationMode('VIDEO')}
                      className={`px-3 py-1 rounded transition-all ${generationMode === 'VIDEO' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                      VIDEO
                    </button>
                 </div>

                 {/* MONTAGE STUDIO TOGGLE */}
                 <button 
                    onClick={handleToggleMontage}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-2 transition-all ${isMontageMode ? 'bg-emerald-900/50 border-emerald-500/50 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" /></svg>
                    Studio
                 </button>
             </div>
          </div>
          
          <div className="flex items-center gap-4">
             {/* Provider Badge */}
             <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setShowProviderManager(true)}>
                <span className={`w-2 h-2 rounded-full ${activeProviderId ? 'bg-emerald-500' : 'bg-slate-500'}`}></span>
                <span className="text-xs font-medium text-slate-400">
                    Provider: <span className="text-white">{activeProviderId ? providers.find(p=>p.id===activeProviderId)?.name : 'Default (Env)'}</span>
                </span>
             </div>
             
             {isLinked && (
               <div className="flex items-center gap-2 px-3 py-1 bg-emerald-900/30 border border-emerald-500/30 rounded-full">
                 <span className={`w-1.5 h-1.5 rounded-full ${isAvatarLocked ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse`}></span>
                 <span className={`text-xs font-medium uppercase ${isAvatarLocked ? 'text-emerald-400' : 'text-amber-400'}`}>
                    Avatar {isAvatarLocked ? 'Active' : 'Editing'}
                 </span>
               </div>
             )}
          </div>
        </header>

        {/* Gallery / Workspace */}
        <main className="flex-1 overflow-y-auto p-6 pb-96 relative custom-scrollbar bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 to-slate-950">
           {gallery.length === 0 && appState === AppState.IDLE && (
             <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
               <div className="w-24 h-24 rounded-full border-4 border-slate-700 flex items-center justify-center mb-4">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7 2a1 1 0 00-.707 1.707L7 4.586 5.293 6.293A1 1 0 007 7.586V11a5.002 5.002 0 003 4.905l-.255 1.02a1 1 0 001.037 1.258l3.418-.855a1 1 0 00.73-1.125L14.735 12H15a1 1 0 001-1V5a1 1 0 00-1-1h-6.828l.828-.828A1 1 0 008.586 2H7zm4 4a1 1 0 00-1 1v6a1 1 0 102 0V7a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
               </div>
               <p className="text-xl font-medium">Ready to Generate</p>
               <p className="text-sm">Describe a scene below. You can also upload assets.</p>
             </div>
           )}

           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-min">
              {/* FIX: Generating Placeholder moved FIRST in grid */}
              {appState === AppState.GENERATING && (
                <div className="rounded-xl bg-slate-800/50 border border-slate-700 animate-pulse flex items-center justify-center aspect-square shadow-lg">
                   <div className="flex flex-col items-center">
                     <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                     <span className="text-xs text-blue-400 font-mono">Generating...</span>
                   </div>
                </div>
              )}

              {gallery.map(img => {
                  const selectionIndex = montageSelection.indexOf(img.id);
                  const isSelected = selectionIndex >= 0;

                  return (
                    <div 
                        key={img.id} 
                        onClick={() => {
                            if (isMontageMode) {
                                handleSelectForMontage(img.id, img.mediaType);
                            } else {
                                setPreviewImage(img);
                            }
                        }} 
                        className={`relative group rounded-xl overflow-hidden cursor-pointer shadow-2xl bg-black aspect-square transition-all ${isMontageMode ? 'border-2' : 'border'} ${isMontageMode && isSelected ? 'border-emerald-500' : 'border-slate-800'} ${isMontageMode && img.mediaType !== 'VIDEO' ? 'opacity-50 grayscale' : ''}`}
                    >
                      {img.mediaType === 'VIDEO' ? (
                          <video src={img.url} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" muted loop onMouseOver={e => !isMontageMode && e.currentTarget.play()} onMouseOut={e => e.currentTarget.pause()} />
                      ) : (
                          <img src={img.url} alt="" className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                      )}
                      
                      {/* Normal Overlay */}
                      {!isMontageMode && (
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-4 flex flex-col justify-end">
                             <p className="text-white text-xs line-clamp-2 mb-2">{img.prompt}</p>
                             <div className="flex gap-2 justify-end">
                               <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded uppercase">{img.aspectRatio}</span>
                               {img.mediaType === 'VIDEO' && <span className="text-[10px] bg-purple-900 text-purple-200 px-1.5 py-0.5 rounded uppercase">VIDEO</span>}
                             </div>
                          </div>
                      )}

                      {/* Montage Overlay */}
                      {isMontageMode && img.mediaType === 'VIDEO' && (
                          <div className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center font-bold shadow-lg transition-transform ${isSelected ? 'bg-emerald-500 text-white scale-110' : 'bg-slate-800/80 text-slate-400 border border-slate-600'}`}>
                              {isSelected ? selectionIndex + 1 : ''}
                          </div>
                      )}
                    </div>
                  )
              })}
           </div>
        </main>
        
        {/* MONTAGE ACTION BAR (Floating) */}
        {isMontageMode && (
            <div className="fixed bottom-32 left-1/2 -translate-x-1/2 bg-slate-800 border border-emerald-500/50 rounded-full px-6 py-3 shadow-2xl z-50 flex items-center gap-4 animate-fadeIn">
                <span className="text-sm font-bold text-slate-200">{montageSelection.length} clips selected</span>
                <button 
                    onClick={handleCreateMontage}
                    disabled={montageSelection.length < 2 || isStitching}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-full text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    {isStitching ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span> : <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg>}
                    Create Montage
                </button>
                <button onClick={handleToggleMontage} className="text-slate-400 hover:text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>
            </div>
        )}

        {/* Control Bar (Fixed Bottom) */}
        <div className="fixed bottom-0 right-0 w-full md:w-[calc(100%-20rem)] bg-slate-900/90 backdrop-blur-md border-t border-slate-800 p-6 z-40 transition-all">
          
          {/* SAFETY ALERTS */}
          {safetyAnalysis && !safetyAnalysis.isSafe && (
            <div className="mb-4 bg-orange-900/20 border border-orange-500/30 rounded-lg p-3 flex flex-col gap-2">
                <div className="flex justify-between items-start">
                    <div>
                        <span className="text-xs font-bold text-orange-400 uppercase tracking-wide">RISKY TERMS DETECTED</span>
                        <p className="text-xs text-slate-300 mt-1">
                            Flagged: <span className="text-orange-300">{safetyAnalysis.corrections.map(c => c.term).join(', ')}</span>
                        </p>
                    </div>
                </div>
                
                {/* Interactive Badges */}
                <div className="flex flex-wrap gap-2 mt-1">
                    {safetyAnalysis.corrections.map((correction, idx) => (
                        <div key={idx} className="relative">
                            <button 
                                onClick={() => setSelectedRiskTerm(selectedRiskTerm === correction.term ? null : correction.term)}
                                className="text-[10px] bg-orange-900/60 hover:bg-orange-800 text-orange-200 border border-orange-500/50 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                {correction.term}
                            </button>
                            
                            {/* Correction Popover */}
                            {selectedRiskTerm === correction.term && (
                                <div className="absolute bottom-full left-0 mb-2 w-48 bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-2 z-50 animate-fadeIn">
                                    <p className="text-[10px] text-slate-400 mb-1 uppercase font-bold">Replace with:</p>
                                    <div className="flex flex-col gap-1">
                                        {correction.alternatives.map((alt, i) => (
                                            <button 
                                                key={i}
                                                onClick={() => handleApplyAlternative(correction.term, alt)}
                                                className="text-left text-xs text-slate-200 hover:bg-blue-600/20 hover:text-blue-300 px-2 py-1.5 rounded transition-colors"
                                            >
                                                {alt}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    
                    {safetyAnalysis.optimizedPrompt && (
                         <button onClick={() => setPrompt(safetyAnalysis.optimizedPrompt!)} className="ml-auto text-xs bg-orange-600 hover:bg-orange-500 text-white px-3 py-1 rounded font-bold transition-colors">
                            Auto-Fix All
                         </button>
                    )}
                </div>
            </div>
          )}

          {errorMsg && (
             <div className="mb-4 bg-red-900/20 border border-red-500/50 rounded-lg p-3 flex items-start gap-3 animate-fadeIn">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500 mt-0.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
               <div className="flex-1">
                 <p className="text-xs font-bold text-red-400 uppercase">Generation Failed</p>
                 <p className="text-sm text-red-200 mt-1">{errorMsg}</p>
               </div>
               <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-white"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
             </div>
          )}

          {/* Config Row */}
          <div className="flex flex-wrap gap-4 items-end mb-4">
             {/* ASPECT RATIO */}
             <div className="flex flex-col gap-1.5">
                <span className="text-[10px] uppercase font-bold text-slate-500">Aspect Ratio</span>
                <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                  {ASPECT_RATIOS.map(r => (
                    <button
                      key={r.value}
                      title={r.label}
                      onClick={() => setAspectRatio(r.value)}
                      className={`px-3 py-1.5 rounded flex items-center gap-1.5 text-xs font-medium transition-all ${aspectRatio === r.value ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      {r.icon}
                      <span>{r.value}</span>
                    </button>
                  ))}
                </div>
             </div>
             
             {/* VIDEO CONTROLS */}
             {generationMode === 'VIDEO' && (
                <>
                   {/* SubMode Toggle */}
                   <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-500">Method</span>
                      <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                          <button onClick={() => setVideoSubMode('ANIMATE')} className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${videoSubMode === 'ANIMATE' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>Animate Image</button>
                          <button onClick={() => setVideoSubMode('AVATAR')} className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${videoSubMode === 'AVATAR' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>Character Scene</button>
                      </div>
                   </div>

                   {/* Resolution */}
                   <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-500">Resolution</span>
                      <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                          <button onClick={() => setVideoResolution('720p')} className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${videoResolution === '720p' ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>720p</button>
                          <button onClick={() => setVideoResolution('1080p')} className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${videoResolution === '1080p' ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>1080p</button>
                      </div>
                   </div>

                   {/* Director Controls */}
                   <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-500">Camera</span>
                      <select value={cameraMotion} onChange={(e) => setCameraMotion(e.target.value as CameraMotion)} className="bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-2 py-1.5 outline-none h-[34px]">
                          <option value="NONE">Static / Default</option>
                          <option value="ZOOM_IN">Zoom In</option>
                          <option value="ZOOM_OUT">Zoom Out</option>
                          <option value="PAN_LEFT">Pan Left</option>
                          <option value="PAN_RIGHT">Pan Right</option>
                          <option value="TRACKING">Tracking Shot</option>
                      </select>
                   </div>
                   <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-500">Action</span>
                      <select value={subjectAction} onChange={(e) => setSubjectAction(e.target.value as SubjectAction)} className="bg-slate-800 border border-slate-700 text-xs text-white rounded-lg px-2 py-1.5 outline-none h-[34px]">
                          <option value="NONE">Default</option>
                          <option value="TALKING">Talking to Camera</option>
                          <option value="WALKING">Walking</option>
                          <option value="RUNNING">Running</option>
                          <option value="POSING">Posing</option>
                          <option value="IDLE">Idle / Waiting</option>
                      </select>
                   </div>
                   
                   {/* DIALOGUE INPUT */}
                   <div className="flex gap-2">
                       <div className="flex flex-col gap-1.5 w-48">
                           <span className="text-[10px] uppercase font-bold text-slate-500">Script / Dialogue</span>
                           <input 
                               type="text" 
                               placeholder="Type what character says..." 
                               value={videoDialogue}
                               onChange={(e) => {
                                   setVideoDialogue(e.target.value);
                                   if (e.target.value.trim() && subjectAction !== 'TALKING') {
                                       setSubjectAction('TALKING'); 
                                   }
                               }}
                               className={`bg-slate-800 border ${videoDialogue ? 'border-purple-500' : 'border-slate-700'} text-xs text-white rounded-lg px-3 py-1.5 outline-none h-[34px] focus:border-purple-500 transition-colors`}
                           />
                       </div>
                       
                       <div className="flex flex-col gap-1.5 w-24">
                           <span className="text-[10px] uppercase font-bold text-slate-500">Voice Style</span>
                           <select 
                               value={voiceStyle} 
                               onChange={(e) => setVoiceStyle(e.target.value)} 
                               disabled={!videoDialogue}
                               className={`bg-slate-800 border ${videoDialogue ? 'border-purple-500/50' : 'border-slate-700'} text-xs text-white rounded-lg px-2 py-1.5 outline-none h-[34px] disabled:opacity-50`}
                           >
                               {VOICE_STYLES.map(v => <option key={v} value={v}>{v}</option>)}
                           </select>
                       </div>
                   </div>

                   {/* NO MUSIC CHECKBOX */}
                   <div className="flex flex-col gap-1.5 items-center justify-end h-[34px]">
                        <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold text-slate-400 hover:text-white uppercase select-none">
                            <input 
                                type="checkbox" 
                                checked={noMusic} 
                                onChange={(e) => setNoMusic(e.target.checked)}
                                className="w-3.5 h-3.5 rounded bg-slate-800 border-slate-600 accent-purple-500 cursor-pointer"
                            />
                            No BGM
                        </label>
                   </div>
                </>
             )}

             {/* IMAGE ASSETS & STYLE */}
             {(generationMode === 'IMAGE' || (generationMode === 'VIDEO' && videoSubMode === 'AVATAR')) && (
                <>
                   <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] uppercase font-bold text-slate-500">Assets</span>
                      <label className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg cursor-pointer transition-colors h-[34px]">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                         <span className="text-xs font-medium text-slate-300">Add Assets</span>
                         <span className="text-[10px] bg-slate-900 px-1.5 rounded text-slate-500">{assetImages.length}</span>
                         <input type="file" className="hidden" multiple accept="image/*" onChange={handleAssetUpload} />
                      </label>
                      
                      {assetImages.length > 0 && (
                         <div className="flex gap-1 absolute -top-12 left-0 bg-slate-800 p-1 rounded border border-slate-700">
                             {assetImages.map(img => (
                                 <div key={img.id} className="w-8 h-8 relative group">
                                     <img src={img.url} className="w-full h-full object-cover rounded border border-slate-600" />
                                     <button onClick={() => handleRemoveAsset(img.id)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                                 </div>
                             ))}
                         </div>
                      )}
                   </div>

                   {/* STYLE REF - NEW UI */}
                   <div className="flex flex-col gap-1.5 relative">
                      <span className="text-[10px] uppercase font-bold text-slate-500">Style Ref</span>
                      <div className="flex items-center gap-1">
                          <label className={`flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg cursor-pointer transition-colors h-[34px] ${sceneImage ? 'border-blue-500/50 bg-blue-900/10' : ''}`}>
                            {sceneImage ? (
                                <>
                                  <div className="w-5 h-5 rounded overflow-hidden border border-slate-600"><img src={sceneImage.url} className="w-full h-full object-cover" /></div>
                                  <span className="text-xs font-medium text-slate-300">Ref Added</span>
                                </>
                            ) : (
                                <>
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" /></svg>
                                  <span className="text-xs font-medium text-slate-300">Add Ref</span>
                                </>
                            )}
                            <input type="file" className="hidden" accept="image/*" onChange={handleSceneUpload} />
                          </label>
                          
                          {sceneImage && (
                              <button 
                                onClick={() => setShowStylePopover(!showStylePopover)}
                                className={`h-[34px] w-[34px] flex items-center justify-center rounded-lg border transition-colors ${showStylePopover ? 'bg-slate-700 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                                title="Edit Style Settings"
                              >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg>
                              </button>
                          )}
                      </div>

                      {sceneImage && showStylePopover && (
                          <div className="absolute bottom-full left-0 mb-2 p-3 bg-slate-800 border border-slate-700 rounded-lg shadow-xl w-56 z-50 animate-fadeIn">
                              <div className="flex justify-between items-center mb-3">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase">Style Settings</span>
                                  <button onClick={() => setSceneImage(null)} className="text-red-400 hover:text-red-300 text-[10px] flex items-center gap-1">
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg> Remove
                                  </button>
                              </div>
                              <div className="space-y-2">
                                  <div className="flex justify-between text-[10px] text-slate-300"><span>Weight</span><span className="text-blue-400 font-bold">{getStyleWeightLabel(styleWeight)}</span></div>
                                  <input type="range" min="0" max="100" value={styleWeight} onChange={(e) => setStyleWeight(parseInt(e.target.value))} className="w-full h-1 bg-slate-700 rounded appearance-none cursor-pointer accent-blue-500" />
                                  <p className="text-[9px] text-slate-500 leading-tight">
                                      {styleWeight < 30 ? "Color & Vibe only." : styleWeight > 85 ? "Copies pose & composition." : "Mixes pose with prompt."}
                                  </p>
                              </div>
                          </div>
                      )}
                   </div>
                </>
             )}
             
             {/* VIDEO ANIMATE INPUT */}
             {generationMode === 'VIDEO' && videoSubMode === 'ANIMATE' && (
                 <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] uppercase font-bold text-slate-500">Start Frame</span>
                    <label 
                        onDragEnter={(e) => handleDrop(e)} onDragLeave={(e) => handleDrop(e)} onDragOver={(e) => handleDrop(e)} onDrop={(e) => handleDrop(e)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors h-[34px] border border-dashed ${videoInputImage ? 'bg-purple-900/20 border-purple-500/50' : 'bg-slate-800 hover:bg-slate-700 border-slate-600'}`}
                    >
                         {videoInputImage ? (
                             <>
                                <div className="w-5 h-5 rounded overflow-hidden border border-purple-500/50"><img src={videoInputImage.url} className="w-full h-full object-cover" /></div>
                                <span className="text-xs font-medium text-purple-200 truncate max-w-[80px]">Loaded</span>
                                <button onClick={(e) => { e.preventDefault(); handleRemoveVideoInput(); }} className="text-purple-400 hover:text-white ml-1">×</button>
                             </>
                         ) : (
                             <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" /></svg>
                                <span className="text-xs font-medium text-slate-300">Upload Start Frame</span>
                             </>
                         )}
                         <input type="file" className="hidden" accept="image/*" onChange={handleVideoInputUpload} />
                    </label>
                 </div>
             )}
          </div>
          
          {/* QUICK STYLE CHIPS (NEW) */}
          <div className="relative mb-0 bg-slate-950/80 border-x border-t border-slate-700 rounded-t-xl px-4 py-2 flex gap-2 overflow-x-auto custom-scrollbar no-scrollbar whitespace-nowrap mask-linear-fade">
             <span className="text-[10px] font-bold text-slate-500 uppercase self-center mr-1">Quick Style:</span>
             {QUICK_STYLES.map(style => (
                 <button 
                    key={style}
                    onClick={() => setPrompt(prev => prev.trim() ? `${prev}, ${style}` : style)}
                    className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-full px-3 py-1 transition-colors"
                 >
                    {style}
                 </button>
             ))}
          </div>

          {/* PROMPT AREA & ACTION BAR */}
          <div className="relative flex flex-col rounded-b-xl rounded-tr-xl overflow-hidden shadow-2xl">
             
             {/* PERSISTENT LINKED BADGE */}
             {isLinked && (
                <div className="absolute -top-7 left-0 flex items-center gap-2">
                   <div className={`text-[10px] font-bold border px-2 py-0.5 rounded flex items-center gap-1 group relative transition-colors ${isAvatarLocked ? 'bg-emerald-900/50 text-emerald-400 border-emerald-500/30' : 'bg-amber-900/50 text-amber-400 border-amber-500/30'}`}>
                      <span className="uppercase">
                          Linked: {activeAvatarName || "Custom Avatar"} {!isAvatarLocked && "(Editing)"}
                      </span>
                      {activeAvatarName && (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 ml-1" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                          <div className="absolute top-full left-0 mt-1 w-40 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden hidden group-hover:block z-50">
                              {presets.map(p => (
                                  <div 
                                    key={p.id} 
                                    onClick={() => handleLoadPreset(p)}
                                    className={`px-3 py-2 text-xs cursor-pointer hover:bg-slate-700 ${activePresetId === p.id ? 'text-emerald-400 bg-slate-700/50' : 'text-slate-300'}`}
                                  >
                                      {p.name}
                                  </div>
                              ))}
                          </div>
                        </>
                      )}
                   </div>
                </div>
             )}

             <textarea 
               value={prompt}
               onChange={(e) => setPrompt(e.target.value)}
               onKeyDown={(e) => {
                   if (e.key === 'Enter' && !e.shiftKey) {
                       e.preventDefault();
                       handleGenerate();
                   }
               }}
               onDrop={handleDrop}
               placeholder={generationMode === 'VIDEO' ? "Describe the video motion... (e.g. A character walking on Mars, cinematic, slow pan)" : "Describe the scene... (e.g. Wearing a red dress in a futuristic city, neon lights)"}
               className="w-full bg-slate-950/80 border-t border-x border-slate-700 p-4 text-sm text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none h-24 shadow-inner transition-all"
             />

             {/* TOOLBAR (Moved out of textarea to avoid overlap) */}
             <div className="bg-slate-900 border border-slate-700 rounded-b-xl p-2 flex items-center justify-between gap-2">
                
                <div className="flex gap-2">
                    {/* Save Prompt */}
                    <button
                        onClick={() => { if(prompt.trim()) { setNewPromptName(''); setShowSavePromptInput(true); } }}
                        disabled={!prompt.trim()}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-blue-400 border border-slate-700 transition-colors"
                        title="Save Prompt"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h5a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h5v5.586l-1.293-1.293zM9 4a1 1 0 012 0v2H9V4z" /></svg>
                    </button>

                    {/* Library */}
                    <button
                        onClick={() => setIsPromptLibraryOpen(true)}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-blue-400 border border-slate-700 transition-colors"
                        title="Prompt Library"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" /></svg>
                    </button>

                    {/* Magic Prompt */}
                    <button 
                      onClick={handleEnhancePrompt}
                      disabled={!prompt.trim() || isEnhancingPrompt}
                      className="p-2 rounded-lg bg-purple-900/50 hover:bg-purple-800 text-purple-300 border border-purple-500/30 transition-colors border-slate-700"
                      title="Magic Enhance Prompt"
                    >
                       {isEnhancingPrompt ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div> : <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" clipRule="evenodd" /></svg>}
                    </button>

                    {/* Safety Check */}
                    <button 
                      onClick={handleCheckSafety}
                      disabled={!prompt.trim() || isAnalyzing}
                      className="p-2 rounded-lg bg-slate-800/50 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-colors"
                      title="Check Safety"
                    >
                      {isAnalyzing ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div> : <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>}
                    </button>
                    
                    {/* Upload Image for Description */}
                    <label className="p-2 rounded-lg bg-slate-800/50 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 cursor-pointer transition-colors" title="Upload Image to Describe">
                      {isDescribingImage ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div> : <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" /></svg>}
                      <input type="file" className="hidden" accept="image/*" onChange={handleImageDescriptionUpload} disabled={isDescribingImage} />
                    </label>
                </div>

                {/* Generate Button */}
                <button 
                  onClick={handleGenerate} 
                  disabled={appState === AppState.GENERATING || !prompt.trim() || (!activePresetId && !videoInputImage && !hasAvatarRefs)}
                  className={`h-9 px-6 rounded-lg font-bold text-sm transition-all shadow-lg flex items-center gap-2 ${appState === AppState.GENERATING || !prompt.trim() ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/50 hover:scale-105'}`}
                >
                   {appState === AppState.GENERATING ? 'Working...' : <><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg> RUN</>}
                </button>
             </div>
          </div>
          
          {/* Save Prompt Input Popover */}
          {showSavePromptInput && (
              <div className="absolute bottom-32 left-6 bg-slate-800 border border-slate-600 p-3 rounded-lg shadow-2xl z-50 w-72 animate-fadeIn">
                  <h4 className="text-xs font-bold text-slate-300 uppercase mb-2">Save Prompt Preset</h4>
                  <input 
                    autoFocus
                    type="text" 
                    placeholder="Name this prompt..." 
                    value={newPromptName}
                    onChange={e => setNewPromptName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSavePrompt()}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none mb-2"
                  />
                  <div className="flex gap-2">
                      <button onClick={() => setShowSavePromptInput(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-xs py-1.5 rounded">Cancel</button>
                      <button onClick={handleSavePrompt} disabled={!newPromptName.trim()} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs py-1.5 rounded disabled:opacity-50 font-bold">Save</button>
                  </div>
              </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <ImagePreviewModal 
        image={previewImage} 
        onClose={() => setPreviewImage(null)} 
        onDelete={() => previewImage && handleDeleteImage(previewImage.id)}
        onNext={handleNextImage}
        onPrev={handlePrevImage}
        hasNext={hasNextImage}
        hasPrev={hasPrevImage}
        onAnimate={handleAnimateWithVeo}
        onVariant={handleVariant}
        onContinue={handleContinueVideo}
        onEdit={handleEditImage} // NEW PROP
      />
      
      <ProviderManager
        providers={providers}
        setProviders={handleUpdateProviders}
        activeProviderId={activeProviderId}
        setActiveProviderId={setActiveProviderId}
        isOpen={showProviderManager}
        onClose={() => setShowProviderManager(false)}
      />
      
      <PromptLibrary
        isOpen={isPromptLibraryOpen}
        onClose={() => setIsPromptLibraryOpen(false)}
        presets={promptPresets}
        onSelect={handleSelectPrompt}
        onDelete={handleDeletePrompt}
        currentMode={generationMode}
      />

    </div>
  );
}

export default App;

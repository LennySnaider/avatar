
import React, { useCallback, useState } from 'react';
import { ReferenceImage, AvatarPreset, PhysicalAttributes } from '../types';
import { analyzeFaceFromImages } from '../services/geminiService';

interface ReferenceUploaderProps {
  images: ReferenceImage[];
  setImages: React.Dispatch<React.SetStateAction<ReferenceImage[]>>;
  faceRefImage: ReferenceImage | null;
  setFaceRefImage: React.Dispatch<React.SetStateAction<ReferenceImage | null>>;
  angleRefImage?: ReferenceImage | null; // NEW
  setAngleRefImage?: React.Dispatch<React.SetStateAction<ReferenceImage | null>>; // NEW
  bodyRefImage: ReferenceImage | null;
  setBodyRefImage: React.Dispatch<React.SetStateAction<ReferenceImage | null>>;
  isLocked: boolean;
  onLock: () => void;
  onUnlock: () => void;
  // Presets
  presets: AvatarPreset[];
  onSavePreset: (name: string, images: ReferenceImage[], faceRef: ReferenceImage | null, angleRef: ReferenceImage | null, bodyRef: ReferenceImage | null, weight: number, measurements: PhysicalAttributes, faceDesc: string, forceNew: boolean) => void;
  onLoadPreset: (preset: AvatarPreset) => void;
  onDeletePreset: (id: string) => void;
  // Identity Weight
  identityWeight: number;
  setIdentityWeight: (w: number) => void;
  // Physical Attributes
  measurements: PhysicalAttributes;
  setMeasurements: (m: PhysicalAttributes) => void;
  faceDescription: string;
  setFaceDescription: (s: string) => void;
  activePresetId: string;
  onExportDB?: () => void;
  onImportDB?: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const ReferenceUploader: React.FC<ReferenceUploaderProps> = ({ 
  images, 
  setImages, 
  faceRefImage,
  setFaceRefImage,
  angleRefImage,
  setAngleRefImage,
  bodyRefImage,
  setBodyRefImage,
  isLocked,
  onLock,
  onUnlock,
  presets,
  onSavePreset,
  onLoadPreset,
  onDeletePreset,
  identityWeight,
  setIdentityWeight,
  measurements,
  setMeasurements,
  faceDescription,
  setFaceDescription,
  activePresetId,
  onExportDB,
  onImportDB
}) => {
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [activeTab, setActiveTab] = useState<'current' | 'library'>('current');
  const [isAnalyzingFace, setIsAnalyzingFace] = useState(false);
  const [dragActive, setDragActive] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // LOGIC CHANGE: Allow saving if ANY reference exists (General OR Face OR Body OR Angle)
  const hasAnyReference = images.length > 0 || faceRefImage !== null || bodyRefImage !== null || (angleRefImage !== undefined && angleRefImage !== null);

  const handleSaveClick = (forceNew: boolean = false) => {
    if (!newPresetName.trim() || !hasAnyReference) return;
    onSavePreset(newPresetName, images, faceRefImage, angleRefImage || null, bodyRefImage, identityWeight, measurements, faceDescription, forceNew);
    setNewPresetName('');
    setShowSaveInput(false);
    setActiveTab('library');
  };

  const processFiles = (fileList: FileList, type: 'general' | 'face' | 'body' | 'angle') => {
    Array.from(fileList).forEach((file: File) => {
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(file.type)) {
        console.warn('Unsupported file type:', file.type);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        const matches = result.match(/^data:(.+);base64,(.+)$/);
        if (matches) {
          const id = typeof crypto !== 'undefined' && crypto.randomUUID 
            ? crypto.randomUUID() 
            : Date.now().toString(36) + Math.random().toString(36).substr(2);
            
          const newImage: ReferenceImage = {
            id,
            url: result,
            mimeType: matches[1],
            base64: matches[2]
          };

          if (type === 'general') setImages(prev => [...prev, newImage]);
          else if (type === 'face') setFaceRefImage(newImage);
          else if (type === 'body') setBodyRefImage(newImage);
          else if (type === 'angle' && setAngleRefImage) setAngleRefImage(newImage);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>, type: 'general' | 'face' | 'body' | 'angle') => {
    if (isLocked) return;
    const files = event.target.files;
    if (!files) return;
    processFiles(files, type);
    event.target.value = '';
  }, [setImages, setFaceRefImage, setBodyRefImage, setAngleRefImage, isLocked]);

  const handleDrag = (e: React.DragEvent, type: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (isLocked) return;
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(type);
    } else if (e.type === 'dragleave') {
      setDragActive(null);
    }
  };

  const handleDrop = (e: React.DragEvent, type: 'general' | 'face' | 'body' | 'angle') => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(null);
    if (isLocked) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files, type);
    }
  };

  const removeImage = (id: string, type: 'general' | 'face' | 'body' | 'angle') => {
    if (isLocked) return;
    if (type === 'general') setImages(prev => prev.filter(img => img.id !== id));
    else if (type === 'face') setFaceRefImage(null);
    else if (type === 'body') setBodyRefImage(null);
    else if (type === 'angle' && setAngleRefImage) setAngleRefImage(null);
  };

  const updateMeasurement = (key: keyof PhysicalAttributes, val: number) => {
    setMeasurements({ ...measurements, [key]: val });
  };

  const handleAutoDescribeFace = async () => {
    // Modified check: Allow analyzing if FaceRef exists OR General images exist
    if (images.length === 0 && !faceRefImage) return;
    setIsAnalyzingFace(true);
    try {
      const sources = faceRefImage ? [faceRefImage] : images;
      const description = await analyzeFaceFromImages(sources);
      if (description) {
        setFaceDescription(description);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsAnalyzingFace(false);
    }
  };

  const getWeightLabel = (w: number) => {
    if (w < 40) return "Creative";
    if (w < 75) return "Balanced";
    return "Strict";
  };

  const getWeightColor = (w: number) => {
    if (w < 40) return "bg-blue-500";
    if (w < 75) return "bg-emerald-500";
    return "bg-rose-500";
  };
  
  const currentPresetName = activePresetId ? presets.find(p=>p.id===activePresetId)?.name : '';

  return (
    <div className="bg-slate-900/50 border-r border-slate-800 w-full md:w-80 flex-shrink-0 flex flex-col h-full transition-colors overflow-hidden relative">
      
      <div className="flex border-b border-slate-800 flex-shrink-0">
        <button 
          onClick={() => setActiveTab('current')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'current' ? 'text-white border-b-2 border-blue-500 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Create
        </button>
        <button 
          onClick={() => setActiveTab('library')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'library' ? 'text-white border-b-2 border-blue-500 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Library
        </button>
      </div>

      {activeTab === 'current' ? (
        <div className="flex flex-col h-full overflow-y-auto">
          <div className={`p-4 border-b border-slate-800 flex-shrink-0 ${isLocked ? 'bg-emerald-900/20' : ''}`}>
            <h2 className={`text-lg font-semibold flex items-center gap-2 ${isLocked ? 'text-emerald-400' : 'text-white'}`}>
              {isLocked ? (
                 <>
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                   Active
                 </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                  Setup Avatar
                </>
              )}
            </h2>
          </div>

          <div className="p-4 space-y-6">
            <div className="space-y-2">
               <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">1. Identity Photos (Optional)</h3>
               </div>
               <div className="grid grid-cols-3 gap-2">
                 {images.map((img) => (
                   <div 
                      key={img.id} 
                      className={`relative group rounded-lg overflow-hidden border aspect-square bg-slate-800 cursor-pointer ${isLocked ? 'border-emerald-500/30' : 'border-slate-700'}`}
                      onClick={() => setPreviewUrl(img.url)}
                    >
                     <img src={img.url} alt="Reference" className="w-full h-full object-cover" />
                     {!isLocked && (
                       <button 
                         onClick={(e) => { e.stopPropagation(); removeImage(img.id, 'general'); }} 
                         className="absolute top-1 right-1 z-20 bg-red-600 text-white w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md hover:scale-110"
                         title="Remove image"
                        >
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                       </button>
                     )}
                   </div>
                 ))}
                 {!isLocked && (
                   <label 
                      onDragEnter={(e) => handleDrag(e, 'general')} onDragLeave={(e) => handleDrag(e, 'general')} onDragOver={(e) => handleDrag(e, 'general')} onDrop={(e) => handleDrop(e, 'general')}
                      className={`flex items-center justify-center aspect-square border-2 border-dashed rounded-lg cursor-pointer transition-all relative overflow-hidden ${dragActive === 'general' ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700 hover:bg-slate-800/50 hover:border-blue-500/50'}`}
                   >
                     <div className="flex flex-col items-center pointer-events-none">
                       <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 transition-colors ${dragActive === 'general' ? 'text-blue-400' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                     </div>
                     <input type="file" className="hidden" accept="image/*" multiple onChange={(e) => handleFileUpload(e, 'general')} />
                   </label>
                 )}
               </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center"><h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">2. Body & Face</h3></div>
              <div className="grid grid-cols-3 gap-2">
                 {/* Face Ref */}
                 <div className="flex flex-col gap-1">
                   <span className="text-[9px] text-slate-500">Face Ref (Front)</span>
                   {faceRefImage ? (
                      <div 
                        className="relative aspect-square rounded overflow-hidden border border-slate-700 group cursor-pointer"
                        onClick={() => setPreviewUrl(faceRefImage.url)}
                      >
                         <img src={faceRefImage.url} alt="Face Ref" className="w-full h-full object-cover" />
                         {!isLocked && (
                             <button 
                                onClick={(e) => { e.stopPropagation(); removeImage('', 'face'); }} 
                                className="absolute top-1 right-1 z-20 bg-red-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-all shadow-md hover:scale-110"
                                title="Remove image"
                             >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                             </button>
                         )}
                      </div>
                   ) : (
                      <label 
                         onDragEnter={(e) => handleDrag(e, 'face')} onDragLeave={(e) => handleDrag(e, 'face')} onDragOver={(e) => handleDrag(e, 'face')} onDrop={(e) => handleDrop(e, 'face')}
                         className={`aspect-square rounded border border-dashed flex flex-col items-center justify-center cursor-pointer transition-all relative overflow-hidden ${isLocked ? 'pointer-events-none opacity-50' : ''} ${dragActive === 'face' ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700 hover:bg-slate-800'}`}
                      >
                         <span className={`text-[9px] text-center transition-colors ${dragActive === 'face' ? 'text-blue-400' : 'text-slate-600'}`}>Face</span>
                         <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'face')} disabled={isLocked} />
                      </label>
                   )}
                 </div>

                 {/* Angle Ref (NEW) */}
                 <div className="flex flex-col gap-1">
                   <span className="text-[9px] text-slate-500">Angles (Sheet)</span>
                   {angleRefImage ? (
                      <div 
                        className="relative aspect-square rounded overflow-hidden border border-slate-700 group cursor-pointer"
                        onClick={() => setPreviewUrl(angleRefImage.url)}
                      >
                         <img src={angleRefImage.url} alt="Angle Ref" className="w-full h-full object-cover" />
                         {!isLocked && (
                             <button 
                                onClick={(e) => { e.stopPropagation(); removeImage('', 'angle'); }} 
                                className="absolute top-1 right-1 z-20 bg-red-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-all shadow-md hover:scale-110"
                                title="Remove image"
                             >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                             </button>
                         )}
                      </div>
                   ) : (
                      <label 
                         onDragEnter={(e) => handleDrag(e, 'angle')} onDragLeave={(e) => handleDrag(e, 'angle')} onDragOver={(e) => handleDrag(e, 'angle')} onDrop={(e) => handleDrop(e, 'angle')}
                         className={`aspect-square rounded border border-dashed flex flex-col items-center justify-center cursor-pointer transition-all relative overflow-hidden ${isLocked ? 'pointer-events-none opacity-50' : ''} ${dragActive === 'angle' ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700 hover:bg-slate-800'}`}
                      >
                         <span className={`text-[9px] text-center transition-colors ${dragActive === 'angle' ? 'text-blue-400' : 'text-slate-600'}`}>Angles</span>
                         <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'angle')} disabled={isLocked} />
                      </label>
                   )}
                 </div>

                 {/* Body Ref */}
                 <div className="flex flex-col gap-1">
                   <span className="text-[9px] text-slate-500">Body Ref (Shape)</span>
                   {bodyRefImage ? (
                      <div 
                        className="relative aspect-square rounded overflow-hidden border border-slate-700 group cursor-pointer"
                        onClick={() => setPreviewUrl(bodyRefImage.url)}
                      >
                         <img src={bodyRefImage.url} alt="Body Ref" className="w-full h-full object-cover" />
                         {!isLocked && (
                             <button 
                                onClick={(e) => { e.stopPropagation(); removeImage('', 'body'); }} 
                                className="absolute top-1 right-1 z-20 bg-red-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-all shadow-md hover:scale-110"
                                title="Remove image"
                             >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                             </button>
                         )}
                      </div>
                   ) : (
                      <label 
                         onDragEnter={(e) => handleDrag(e, 'body')} onDragLeave={(e) => handleDrag(e, 'body')} onDragOver={(e) => handleDrag(e, 'body')} onDrop={(e) => handleDrop(e, 'body')}
                         className={`aspect-square rounded border border-dashed flex flex-col items-center justify-center cursor-pointer transition-all relative overflow-hidden ${isLocked ? 'pointer-events-none opacity-50' : ''} ${dragActive === 'body' ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700 hover:bg-slate-800'}`}
                      >
                         <span className={`text-[9px] text-center transition-colors ${dragActive === 'body' ? 'text-blue-400' : 'text-slate-600'}`}>Body</span>
                         <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'body')} disabled={isLocked} />
                      </label>
                   )}
                 </div>
              </div>

              <div className="space-y-4 mt-2">
                 <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400"><span>Age</span><span className="text-white">{measurements.age || 25} years</span></div>
                    <input type="range" min="18" max="90" value={measurements.age || 25} onChange={(e) => updateMeasurement('age', parseInt(e.target.value))} disabled={isLocked} className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:opacity-50" />
                 </div>

                 <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400"><span>Bust</span><span className="text-white">{measurements.bust} cm</span></div>
                    <input type="range" min="60" max="150" value={measurements.bust} onChange={(e) => updateMeasurement('bust', parseInt(e.target.value))} disabled={isLocked} className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:opacity-50" />
                 </div>
                 <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400"><span>Waist</span><span className="text-white">{measurements.waist} cm</span></div>
                    <input type="range" min="50" max="130" value={measurements.waist} onChange={(e) => updateMeasurement('waist', parseInt(e.target.value))} disabled={isLocked} className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:opacity-50" />
                 </div>
                 <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400"><span>Hips</span><span className="text-white">{measurements.hips} cm</span></div>
                    <input type="range" min="60" max="150" value={measurements.hips} onChange={(e) => updateMeasurement('hips', parseInt(e.target.value))} disabled={isLocked} className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:opacity-50" />
                 </div>

                 <div className="pt-4">
                   <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Key Facial Features</span>
                      <button onClick={handleAutoDescribeFace} disabled={isLocked || !hasAnyReference || isAnalyzingFace} className="text-[10px] bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                        {isAnalyzingFace ? <span className="animate-spin h-3 w-3 border-2 border-current border-t-transparent rounded-full"></span> : <><svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" clipRule="evenodd" /></svg>Magic Fix</>}
                      </button>
                   </div>
                   <textarea value={faceDescription} onChange={(e) => setFaceDescription(e.target.value)} disabled={isLocked} placeholder="Key features: Green eyes, small mole, sharp jawline..." className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:border-blue-500 outline-none resize-none h-16 disabled:opacity-50" />
                 </div>
              </div>
            </div>

             <div className="space-y-2">
                <div className="flex justify-between items-center"><h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">3. Strictness</h3><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${getWeightColor(identityWeight)}`}>{getWeightLabel(identityWeight)}</span></div>
                <input type="range" min="0" max="100" value={identityWeight} onChange={(e) => setIdentityWeight(parseInt(e.target.value))} disabled={isLocked} className="w-full h-1.5 bg-slate-700 rounded appearance-none cursor-pointer accent-blue-500 disabled:opacity-50" />
             </div>
          </div>

          <div className="p-4 bg-slate-900 border-t border-slate-800 space-y-3 mt-auto">
            {!isLocked ? (
              <button onClick={onLock} disabled={!hasAnyReference} className={`w-full py-3 px-4 rounded-lg font-bold text-sm transition-all shadow-lg ${hasAnyReference ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-900/20' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>ACTIVATE AVATAR</button>
            ) : (
              <div className="flex gap-2">
                 <button onClick={onUnlock} className="flex-1 py-2 px-4 rounded-lg font-medium text-sm text-slate-300 hover:text-white border border-slate-600 hover:border-slate-500 bg-slate-800 transition-all">Edit</button>
                 <button onClick={() => { setNewPresetName(currentPresetName); setShowSaveInput(true); }} className="flex-1 py-2 px-4 rounded-lg font-medium text-sm bg-emerald-700 hover:bg-emerald-600 text-white shadow-lg transition-all">Save Preset</button>
              </div>
            )}
            
            {showSaveInput && (
              <div className="animate-fadeIn mt-2 p-3 bg-slate-800 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-400 mb-2">Preset Name:</p>
                <input type="text" value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSaveClick()} placeholder="My Character" className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm outline-none focus:border-blue-500 mb-2" autoFocus />
                <div className="flex gap-2">
                  {activePresetId && (
                     <button onClick={() => handleSaveClick(false)} disabled={!newPresetName.trim()} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-xs font-medium disabled:opacity-50">Update</button>
                  )}
                  <button onClick={() => handleSaveClick(true)} disabled={!newPresetName.trim()} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded text-xs font-medium disabled:opacity-50">Save New</button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
            <div><h3 className="text-white font-medium">Avatar Library</h3><p className="text-xs text-slate-400">Manage your saved characters</p></div>
            <div className="flex gap-2">
                {onExportDB && <button onClick={onExportDB} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded border border-slate-700" title="Export all avatars">Export</button>}
                {onImportDB && (
                   <label className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded border border-slate-700 cursor-pointer" title="Import avatars JSON">
                      Import <input type="file" className="hidden" accept=".json" onChange={onImportDB} />
                   </label>
                )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
             {presets.length === 0 && <div className="text-center text-slate-500 text-sm mt-8">Library is empty.</div>}
             {presets.map(preset => (
               <div key={preset.id} onClick={() => { onLoadPreset(preset); setActiveTab('current'); }} className={`group p-3 rounded-lg border cursor-pointer transition-all ${activePresetId === preset.id ? 'bg-blue-900/20 border-blue-500/50' : 'bg-slate-800 border-slate-700 hover:border-blue-500/50 hover:bg-slate-700/50'}`}>
                 <div className="flex justify-between items-start mb-2"><span className={`font-bold text-sm transition-colors ${activePresetId === preset.id ? 'text-blue-400' : 'text-slate-200 group-hover:text-blue-300'}`}>{preset.name}</span><button onClick={(e) => { e.stopPropagation(); onDeletePreset(preset.id); }} className="text-slate-600 hover:text-red-400 p-1 rounded hover:bg-slate-900" title="Delete preset"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg></button></div>
                 <div className="flex gap-1 mb-2">
                   {preset.images.slice(0, 3).map((img, i) => ( <div key={i} className="w-8 h-8 rounded overflow-hidden bg-slate-900 border border-slate-700"><img src={img.url} alt="" className="w-full h-full object-cover" /></div> ))}
                   {preset.bodyRefImage && <div className="w-8 h-8 rounded border border-blue-500/50 bg-blue-900/20 text-[8px] flex items-center justify-center text-blue-300">Body</div>}
                   {preset.angleRefImage && <div className="w-8 h-8 rounded border border-emerald-500/50 bg-emerald-900/20 text-[8px] flex items-center justify-center text-emerald-300">Angle</div>}
                 </div>
                 <div className="text-[10px] text-slate-500"><span>W:{preset.identityWeight}%</span></div>
               </div>
             ))}
          </div>
        </div>
      )}

      {/* PREVIEW OVERLAY */}
      {previewUrl && (
        <div 
          className="absolute inset-0 z-50 bg-slate-950/95 flex flex-col items-center justify-center p-6 animate-fadeIn cursor-pointer"
          onClick={() => setPreviewUrl(null)}
        >
           <div className="relative w-full flex items-center justify-center mb-4">
               <img 
                 src={previewUrl} 
                 alt="Preview" 
                 className="max-w-full max-h-[70vh] object-contain rounded-lg border border-slate-700 shadow-2xl bg-black"
                 onClick={(e) => e.stopPropagation()} 
               />
           </div>
           <button onClick={() => setPreviewUrl(null)} className="text-xs text-slate-300 hover:text-white flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-full border border-slate-600 transition-colors shadow-lg">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
             Close Preview
           </button>
        </div>
      )}
    </div>
  );
};

export default ReferenceUploader;

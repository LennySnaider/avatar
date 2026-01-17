
import React, { useState, useEffect, useRef } from 'react';
import { GeneratedImage } from '../types';

interface ImagePreviewModalProps {
  image: GeneratedImage | null;
  onClose: () => void;
  onDelete?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  onAnimate?: (img: GeneratedImage) => void;
  onVariant?: (img: GeneratedImage) => void;
  onContinue?: (base64Frame: string, promptSuggestion: string) => void;
  onEdit?: (originalImg: GeneratedImage, editPrompt: string, maskBase64: string | null) => void;
}

const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({ 
  image, 
  onClose, 
  onDelete,
  onNext,
  onPrev,
  hasNext,
  hasPrev,
  onAnimate,
  onVariant,
  onContinue,
  onEdit
}) => {
  const [copied, setCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isCapturing, setIsCapturing] = useState(false);
  
  // Edit / Refine State
  const [isRefineMode, setIsRefineMode] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const [currentTool, setCurrentTool] = useState<'brush' | 'eraser'>('brush');
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [brushSize, setBrushSize] = useState(30);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!image) return;
      if (e.key === 'Escape') {
          if (isRefineMode) setIsRefineMode(false);
          else onClose();
      }
      if (!isRefineMode) {
          if (e.key === 'ArrowRight' && onNext && hasNext) onNext();
          if (e.key === 'ArrowLeft' && onPrev && hasPrev) onPrev();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [image, onNext, onPrev, hasNext, hasPrev, onClose, isRefineMode]);

  // Canvas Sizing Logic
  useEffect(() => {
      if (isRefineMode && imgRef.current && canvasRef.current) {
          const img = imgRef.current;
          const canvas = canvasRef.current;
          // Match canvas size to displayed image size exactly
          const updateCanvasSize = () => {
              if (img.width > 0 && img.height > 0) {
                  canvas.width = img.width;
                  canvas.height = img.height;
                  canvas.style.width = `${img.width}px`;
                  canvas.style.height = `${img.height}px`;
              }
          };
          
          // Initial size
          if (img.complete) updateCanvasSize();
          else img.onload = updateCanvasSize;

          window.addEventListener('resize', updateCanvasSize);
          return () => window.removeEventListener('resize', updateCanvasSize);
      }
  }, [isRefineMode, image]);

  if (!image) return null;

  const handleDownload = async () => {
    try {
      const res = await fetch(image.url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const ext = image.mediaType === 'VIDEO' ? 'mp4' : 'jpg';
      a.download = `avatar-forge-${image.id.slice(0, 8)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      const a = document.createElement('a');
      a.href = image.url;
      const ext = image.mediaType === 'VIDEO' ? 'mp4' : 'jpg';
      a.download = `avatar-forge-${image.id.slice(0, 8)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(image.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  const handleContinueClick = () => {
      if (!videoRef.current || !onContinue) return;
      setIsCapturing(true);
      const video = videoRef.current;
      video.pause();
      video.currentTime = Math.max(0, video.duration - 0.1);
      setTimeout(() => {
          try {
              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                  const base64Data = canvas.toDataURL('image/jpeg', 0.95);
                  onContinue(base64Data, image.prompt);
              }
          } catch (e) { console.error(e); } 
          finally { setIsCapturing(false); }
      }, 300);
  };

  // EDITING DRAW LOGIC
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      setIsDrawing(true);
      setHasDrawn(true);
      
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = brushSize;
      
      if (currentTool === 'brush') {
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.5)'; // Purple semi-transparent
          ctx.globalCompositeOperation = 'source-over';
      } else {
          ctx.globalCompositeOperation = 'destination-out';
      }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      ctx.lineTo(x, y);
      ctx.stroke();
  };

  const stopDrawing = () => {
      setIsDrawing(false);
      const ctx = canvasRef.current?.getContext('2d');
      ctx?.closePath();
  };

  const clearCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      setHasDrawn(false);
  };

  const submitEdit = () => {
      if (!editPrompt.trim()) return;
      
      let maskBase64: string | null = null;
      if (hasDrawn && canvasRef.current) {
          maskBase64 = canvasRef.current.toDataURL('image/png');
      }
      
      if (onEdit) onEdit(image, editPrompt, maskBase64);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 animate-fadeIn select-none">
      
      {/* Navigation Buttons (Hidden in Refine Mode) */}
      {!isRefineMode && hasPrev && (
        <button 
          onClick={(e) => { e.stopPropagation(); onPrev && onPrev(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/5 hover:bg-white/20 rounded-full text-white/50 hover:text-white transition-all z-[110]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
      )}

      {!isRefineMode && hasNext && (
        <button 
          onClick={(e) => { e.stopPropagation(); onNext && onNext(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/5 hover:bg-white/20 rounded-full text-white/50 hover:text-white transition-all z-[110]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      )}

      {/* TOP ACTIONS */}
      <div className="absolute top-4 right-4 flex gap-4 z-[120]">
        {!isRefineMode && (
            <>
                {/* Refine / Edit Button */}
                {onEdit && image.mediaType === 'IMAGE' && (
                    <button
                        onClick={() => setIsRefineMode(true)}
                        className="bg-indigo-600/20 hover:bg-indigo-600 text-indigo-200 hover:text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all border border-indigo-500/30"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                        Refine
                    </button>
                )}
                {onAnimate && image.mediaType === 'IMAGE' && (
                    <button onClick={() => onAnimate(image)} className="bg-purple-600/20 hover:bg-purple-600 text-purple-200 hover:text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all border border-purple-500/30">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l4 2A1 1 0 0020 14V6a1 1 0 00-1.447-.894l-4 2z" /></svg>
                        Animate with Veo
                    </button>
                )}
                {onContinue && image.mediaType === 'VIDEO' && (
                    <button onClick={handleContinueClick} disabled={isCapturing} className="bg-purple-600/20 hover:bg-purple-600 text-purple-200 hover:text-white w-10 h-10 flex items-center justify-center rounded-lg transition-all border border-purple-500/30 group relative">
                        {isCapturing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>}
                        <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] bg-slate-800 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">Continue Video</span>
                    </button>
                )}
            </>
        )}

        {/* Create Variant (Image Only) */}
        {!isRefineMode && onVariant && image.mediaType === 'IMAGE' && (
            <button 
              onClick={() => onVariant(image)}
              className="bg-slate-800/50 hover:bg-slate-700 text-slate-300 hover:text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all border border-slate-700 hover:border-slate-500"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z" clipRule="evenodd" /></svg>
              Create Variant
            </button>
        )}

        {/* Standard Actions */}
        {!isRefineMode && onDelete && (
          <button onClick={onDelete} className="bg-red-900/20 hover:bg-red-600 text-red-400 hover:text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all border border-red-900/30 hover:border-red-500">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
            Trash
          </button>
        )}
        {!isRefineMode && (
            <>
                <button onClick={handleDownload} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all border border-slate-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                  Download
                </button>
                <button onClick={onClose} className="bg-slate-800 hover:bg-slate-700 text-white p-2 rounded-lg transition-all border border-slate-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </>
        )}
      </div>

      {/* Main Preview */}
      <div className="relative w-full h-full flex items-center justify-center p-8">
        
        {/* REFINE MODE TOOLBAR */}
        {isRefineMode && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900 border border-slate-700 rounded-full px-4 py-2 shadow-2xl flex items-center gap-2 z-[130]">
                <button className="text-slate-400 hover:text-white p-1" title="Drag to move">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                </button>
                <div className="h-4 w-px bg-slate-700 mx-1"></div>
                
                <button onClick={() => setIsRefineMode(false)} className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-1.5 rounded-full" title="Cancel">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" /></svg>
                </button>

                <button 
                    onClick={() => setCurrentTool('brush')}
                    className={`p-2 rounded-lg transition-all ${currentTool === 'brush' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                    title="Brush Mask"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                </button>
                
                <button 
                    onClick={() => setCurrentTool('eraser')}
                    className={`p-2 rounded-lg transition-all ${currentTool === 'eraser' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                    title="Eraser"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                </button>

                <button onClick={clearCanvas} className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg" title="Clear Mask">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>

                {/* Brush Size Slider */}
                <div className="flex items-center gap-2 border-l border-slate-700 pl-3 ml-1">
                    <div className="rounded-full bg-indigo-500 transition-all" style={{ width: brushSize/4, height: brushSize/4, minWidth: 4, minHeight: 4, maxWidth: 16, maxHeight: 16 }}></div>
                    <input
                        type="range"
                        min="2"
                        max="100"
                        value={brushSize}
                        onChange={(e) => setBrushSize(parseInt(e.target.value))}
                        className="w-16 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        title="Brush Size"
                    />
                </div>

                <div className="h-4 w-px bg-slate-700 mx-1"></div>

                <input 
                    type="text" 
                    placeholder="Add to chat (e.g. make hair red)" 
                    value={editPrompt}
                    onChange={e => setEditPrompt(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitEdit()}
                    className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-indigo-500 w-48"
                    autoFocus
                />
                
                <button onClick={submitEdit} disabled={!editPrompt.trim()} className="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" /></svg>
                </button>
            </div>
        )}

        <div className={`relative max-w-full max-h-full transition-all duration-300 ${isRefineMode ? 'scale-90' : ''}`}>
          {image.mediaType === 'VIDEO' ? (
            <video 
              ref={videoRef}
              src={image.url} 
              controls 
              autoPlay 
              loop
              className="max-h-[85vh] max-w-full rounded-lg shadow-2xl border border-slate-800 object-contain" // Force object-contain
            />
          ) : (
            <div className="relative inline-block">
                <img 
                  ref={imgRef}
                  src={image.url} 
                  alt={image.prompt} 
                  className={`max-h-[85vh] max-w-full rounded-lg shadow-2xl border border-slate-800 object-contain transition-all ${isRefineMode ? 'brightness-50' : ''}`} // Dim original when editing
                />
                
                {isRefineMode && (
                    <canvas
                        ref={canvasRef}
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        className="absolute top-0 left-0 cursor-crosshair touch-none"
                    />
                )}
            </div>
          )}
        </div>
      </div>

      {/* Info & Copy (Hidden in Refine Mode) */}
      {!isRefineMode && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 max-w-2xl w-full z-[120]">
            <div className="bg-slate-900/90 backdrop-blur border border-slate-700 rounded-full px-6 py-3 shadow-xl flex items-center gap-4 w-full">
              <p className="text-sm text-slate-300 truncate flex-1 font-medium">{image.prompt}</p>
              <button 
                onClick={handleCopyPrompt}
                className="text-slate-400 hover:text-white transition-colors"
                title="Copy Prompt"
              >
                {copied ? <span className="text-green-400 text-xs font-bold">Copied!</span> : <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" /><path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" /></svg>}
              </button>
            </div>
          </div>
      )}
    </div>
  );
};

export default ImagePreviewModal;

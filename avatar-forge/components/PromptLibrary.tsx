
import React from 'react';
import { PromptPreset, MediaType } from '../types';

interface PromptLibraryProps {
    isOpen: boolean;
    onClose: () => void;
    presets: PromptPreset[];
    onSelect: (preset: PromptPreset) => void;
    onDelete: (id: string) => void;
    currentMode: MediaType;
}

const PromptLibrary: React.FC<PromptLibraryProps> = ({ isOpen, onClose, presets, onSelect, onDelete, currentMode }) => {
    if (!isOpen) return null;

    const filtered = presets.filter(p => p.type === currentMode);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[80vh]">
                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                        </svg>
                        Prompt Library <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700 ml-2">{currentMode}</span>
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    {filtered.length === 0 && (
                        <div className="text-center py-12">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-slate-700 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                            <p className="text-slate-500 text-sm">No saved prompts for {currentMode} mode.</p>
                            <p className="text-slate-600 text-xs mt-1">Save your current prompt to see it here.</p>
                        </div>
                    )}
                    {filtered.map(p => (
                        <div key={p.id} onClick={() => onSelect(p)} className="group p-4 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-blue-500 hover:bg-slate-800 cursor-pointer transition-all shadow-sm hover:shadow-md">
                             <div className="flex justify-between items-start mb-2">
                                 <span className="font-bold text-slate-200 text-sm">{p.name}</span>
                                 <button onClick={(e) => {e.stopPropagation(); onDelete(p.id)}} className="text-slate-600 hover:text-red-400 p-1 rounded hover:bg-slate-900 transition-colors" title="Delete prompt"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg></button>
                             </div>
                             <p className="text-xs text-slate-400 line-clamp-2 group-hover:text-slate-300 transition-colors font-mono bg-black/20 p-2 rounded">{p.text}</p>
                             <div className="flex justify-between items-center mt-2">
                                <span className="text-[10px] text-slate-600">{new Date(p.createdAt).toLocaleDateString()}</span>
                                <span className="text-[10px] text-blue-400 font-medium group-hover:underline">Use Prompt →</span>
                             </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
export default PromptLibrary;

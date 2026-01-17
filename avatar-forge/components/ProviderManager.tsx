
import React, { useState, useEffect } from 'react';
import { GenProvider, ProviderType } from '../types';

interface ProviderManagerProps {
  providers: GenProvider[];
  setProviders: (providers: GenProvider[]) => void;
  activeProviderId: string;
  setActiveProviderId: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

const PROVIDER_TYPES: { value: ProviderType; label: string }[] = [
  { value: 'GOOGLE', label: 'Google Gemini' },
  { value: 'KLING', label: 'Kling AI (Video)' },
  { value: 'QWEN', label: 'Qwen / Alibaba' },
  { value: 'OPENAI', label: 'OpenAI (DALL-E)' },
  { value: 'RUNWAY', label: 'RunwayML' },
  { value: 'CUSTOM', label: 'Custom / Other' },
];

const ProviderManager: React.FC<ProviderManagerProps> = ({
  providers,
  setProviders,
  activeProviderId,
  setActiveProviderId,
  isOpen,
  onClose
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<ProviderType>('GOOGLE');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gemini-3-pro-image-preview');
  const [endpoint, setEndpoint] = useState('');

  // Reset defaults when type changes
  useEffect(() => {
      if (type === 'GOOGLE') {
          setModel('gemini-3-pro-image-preview');
          setEndpoint('');
      } else if (type === 'KLING') {
          setModel('kling-v1');
          setEndpoint('https://api.klingai.com/v1');
      } else if (type === 'QWEN') {
          setModel('qwen-vl-max');
          setEndpoint('');
      } else {
          setModel('');
          setEndpoint('');
      }
  }, [type]);

  if (!isOpen) return null;

  const handleAdd = () => {
    if (!name.trim() || !apiKey.trim()) return;
    
    const newProvider: GenProvider = {
      id: crypto.randomUUID(),
      name: name.trim(),
      type: type,
      apiKey: apiKey.trim(),
      model: model.trim(),
      endpoint: endpoint.trim() || undefined
    };
    
    const updated = [...providers, newProvider];
    setProviders(updated);
    setActiveProviderId(newProvider.id);
    
    // Clear form
    setName('');
    setApiKey('');
    setType('GOOGLE');
    setModel('gemini-3-pro-image-preview');
    setEndpoint('');
  };

  const handleRemove = (id: string) => {
    const updated = providers.filter(p => p.id !== id);
    setProviders(updated);
    if (activeProviderId === id) {
      setActiveProviderId(updated.length > 0 ? updated[0].id : '');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50 flex-shrink-0">
          <h2 className="text-lg font-bold text-white">Generation Providers</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>
        </div>
        
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* List */}
          <div className="space-y-3">
             <h3 className="text-xs font-bold text-slate-400 uppercase">Configured Providers</h3>
             {providers.length === 0 && (
               <p className="text-sm text-slate-500 italic">No custom providers added. Using default environment key (Google).</p>
             )}
             {providers.map(p => (
               <div key={p.id} className={`flex justify-between items-center p-3 rounded-lg border ${activeProviderId === p.id ? 'bg-blue-900/20 border-blue-500/50' : 'bg-slate-800 border-slate-700'}`}>
                 <div className="flex flex-col cursor-pointer flex-1" onClick={() => setActiveProviderId(p.id)}>
                   <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-slate-200">{p.name}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded border ${
                          p.type === 'GOOGLE' ? 'border-blue-500/30 text-blue-400' : 
                          p.type === 'KLING' ? 'border-purple-500/30 text-purple-400' : 
                          'border-slate-500 text-slate-400'
                      }`}>
                          {p.type}
                      </span>
                      {activeProviderId === p.id && <span className="text-[9px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-bold">ACTIVE</span>}
                   </div>
                   <div className="flex gap-2 items-center">
                      <span className="text-xs text-slate-500 font-mono bg-slate-950 px-1 rounded">
                        {p.apiKey.slice(0, 4)}...{p.apiKey.slice(-4)}
                      </span>
                      <span className="text-xs text-slate-500 truncate max-w-[150px]">
                         {p.model}
                      </span>
                   </div>
                 </div>
                 <button onClick={() => handleRemove(p.id)} className="text-slate-500 hover:text-red-400 p-2 ml-2">
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                 </button>
               </div>
             ))}
          </div>

          {/* Add Form */}
          <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 space-y-4">
             <h3 className="text-xs font-bold text-slate-400 uppercase border-b border-slate-700 pb-2">Add New Provider</h3>
             
             <div className="grid grid-cols-2 gap-3">
                 <div className="col-span-1">
                    <label className="text-[10px] uppercase text-slate-500 font-bold mb-1 block">Provider Type</label>
                    <select 
                        value={type}
                        onChange={(e) => setType(e.target.value as ProviderType)}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                    >
                        {PROVIDER_TYPES.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                    </select>
                 </div>
                 <div className="col-span-1">
                    <label className="text-[10px] uppercase text-slate-500 font-bold mb-1 block">Display Name</label>
                    <input 
                        type="text" 
                        placeholder="e.g. My Kling Account" 
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                    />
                 </div>
             </div>

             <div>
                <label className="text-[10px] uppercase text-slate-500 font-bold mb-1 block">API Key / Token</label>
                <input 
                    type="password" 
                    placeholder="Enter Secret Key" 
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none font-mono"
                />
             </div>

             <div className="grid grid-cols-2 gap-3">
                <div className="col-span-1">
                   <label className="text-[10px] uppercase text-slate-500 font-bold mb-1 block">Model ID</label>
                   <input 
                     type="text" 
                     placeholder="Model ID" 
                     value={model}
                     onChange={e => setModel(e.target.value)}
                     className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none font-mono"
                   />
                </div>
                <div className="col-span-1">
                   <label className="text-[10px] uppercase text-slate-500 font-bold mb-1 block">Endpoint URL (Optional)</label>
                   <input 
                     type="text" 
                     placeholder="https://api..." 
                     value={endpoint}
                     onChange={e => setEndpoint(e.target.value)}
                     className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none font-mono"
                   />
                </div>
             </div>

             <button 
               onClick={handleAdd}
               disabled={!name.trim() || !apiKey.trim()}
               className="w-full mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-bold transition-all shadow-lg"
             >
               Save Configuration
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProviderManager;

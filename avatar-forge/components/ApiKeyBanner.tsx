import React, { useEffect, useState } from 'react';
import { checkApiKey, selectApiKey } from '../services/geminiService';

interface ApiKeyBannerProps {
  onReady: () => void;
}

const ApiKeyBanner: React.FC<ApiKeyBannerProps> = ({ onReady }) => {
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    const verifyKey = async () => {
      const selected = await checkApiKey();
      setHasKey(selected);
      if (selected) onReady();
    };
    verifyKey();
  }, [onReady]);

  const handleSelectKey = async () => {
    await selectApiKey();
    // Assume success to avoid race conditions, but verify quickly after
    setHasKey(true);
    onReady();
  };

  if (hasKey) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 max-w-md w-full shadow-2xl text-center">
        <h2 className="text-2xl font-bold text-white mb-4">Access Required</h2>
        <p className="text-slate-300 mb-6">
          To generate high-quality consistent avatars with Gemini 3 Pro, you need to connect your paid API Key.
        </p>
        <div className="flex flex-col gap-4">
          <button
            onClick={handleSelectKey}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 px-6 rounded-lg transition-all transform hover:scale-105"
          >
            Connect Google Cloud Project
          </button>
          <a
            href="https://ai.google.dev/gemini-api/docs/billing"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-slate-500 hover:text-slate-400 underline"
          >
            Learn about billing & API keys
          </a>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyBanner;
'use client'

import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { HiOutlineCheck, HiOutlineX, HiOutlinePhotograph, HiOutlineVideoCamera } from 'react-icons/hi'
import type { AIProvider } from '@/@types/supabase'

interface ProviderListProps {
    providers: AIProvider[]
}

const ProviderList = ({ providers }: ProviderListProps) => {
    const getProviderIcon = (type: string) => {
        switch (type) {
            case 'GOOGLE':
                return '🔵'
            case 'KLING':
                return '🟣'
            case 'OPENAI':
                return '🟢'
            case 'RUNWAY':
                return '🟠'
            case 'QWEN':
                return '🔴'
            case 'STABILITY':
                return '⚫'
            case 'PIKA':
                return '🩷'
            case 'LUMA':
                return '🔷'
            default:
                return '⚪'
        }
    }

    const getEnvVarStatus = (envVar: string | null) => {
        // In production, we'd check if the env var is set
        // For now, we show the expected env var name
        return envVar || 'Not configured'
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h3 className="text-xl font-semibold mb-2">AI Providers</h3>
                <p className="text-sm text-gray-500">
                    Manage your AI generation providers. API keys are configured via environment variables.
                </p>
            </div>

            {/* Info Banner */}
            <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <h4 className="font-medium text-blue-700 dark:text-blue-400 mb-2">
                    🔑 API Key Configuration
                </h4>
                <p className="text-sm text-blue-600 dark:text-blue-300">
                    API keys are configured in your <code className="px-1 bg-blue-100 dark:bg-blue-800 rounded">.env</code> file.
                    Set the appropriate environment variable for each provider you want to use.
                </p>
            </Card>

            {/* Provider Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {providers.map((provider) => (
                    <Card key={provider.id} className="p-4">
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <span className="text-2xl">{getProviderIcon(provider.type)}</span>
                                <div>
                                    <h4 className="font-medium">{provider.name}</h4>
                                    <p className="text-xs text-gray-500">{provider.model}</p>
                                </div>
                            </div>
                            <Badge
                                className={provider.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}
                            >
                                {provider.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                        </div>

                        {/* Capabilities */}
                        <div className="flex gap-3 mb-3">
                            <div className="flex items-center gap-1 text-sm">
                                <HiOutlinePhotograph className={provider.supports_image ? 'text-blue-500' : 'text-gray-300'} />
                                <span className={provider.supports_image ? 'text-blue-600' : 'text-gray-400'}>
                                    Image
                                </span>
                                {provider.supports_image ? (
                                    <HiOutlineCheck className="w-3 h-3 text-green-500" />
                                ) : (
                                    <HiOutlineX className="w-3 h-3 text-gray-300" />
                                )}
                            </div>
                            <div className="flex items-center gap-1 text-sm">
                                <HiOutlineVideoCamera className={provider.supports_video ? 'text-purple-500' : 'text-gray-300'} />
                                <span className={provider.supports_video ? 'text-purple-600' : 'text-gray-400'}>
                                    Video
                                </span>
                                {provider.supports_video ? (
                                    <HiOutlineCheck className="w-3 h-3 text-green-500" />
                                ) : (
                                    <HiOutlineX className="w-3 h-3 text-gray-300" />
                                )}
                            </div>
                        </div>

                        {/* API Key Status */}
                        {provider.requires_api_key && (
                            <div className="text-xs bg-gray-50 dark:bg-gray-800 rounded p-2">
                                <span className="text-gray-500">Env Variable: </span>
                                <code className="font-mono text-primary">
                                    {getEnvVarStatus(provider.api_key_env_var)}
                                </code>
                            </div>
                        )}
                    </Card>
                ))}
            </div>

            {/* Setup Instructions */}
            <Card className="p-4">
                <h4 className="font-medium mb-3">Setup Instructions</h4>
                <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                    <p>1. Copy the environment variable name from the provider card above</p>
                    <p>2. Add it to your <code className="px-1 bg-gray-100 dark:bg-gray-800 rounded">.env.local</code> file:</p>
                    <pre className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto">
{`# Example
GEMINI_API_KEY=your_api_key_here
KLING_API_KEY=your_api_key_here
OPENAI_API_KEY=your_api_key_here`}
                    </pre>
                    <p>3. Restart your development server</p>
                </div>
            </Card>
        </div>
    )
}

export default ProviderList

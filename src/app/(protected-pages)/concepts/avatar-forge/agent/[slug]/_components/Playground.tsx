'use client'

import { useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

interface PlaygroundProps {
    avatarId: string
    avatarName: string
    hasPersona: boolean
}

interface RetrievalMeta {
    retrieval?: { title: string | null; kind: string; similarity: number }[]
}

/** Remount wrapper: bumping the key resets the whole chat session. */
const Playground = (props: PlaygroundProps) => {
    const [sessionKey, setSessionKey] = useState(0)
    return (
        <PlaygroundChat
            key={sessionKey}
            {...props}
            onReset={() => setSessionKey((k) => k + 1)}
        />
    )
}

const PlaygroundChat = ({
    avatarId,
    avatarName,
    hasPersona,
    onReset,
}: PlaygroundProps & { onReset: () => void }) => {
    const [input, setInput] = useState('')
    const bottomRef = useRef<HTMLDivElement>(null)

    const { messages, sendMessage, status, error } = useChat({
        transport: new DefaultChatTransport({
            api: '/api/agent/chat',
            body: { avatarId },
        }),
    })

    const isBusy = status === 'submitted' || status === 'streaming'

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleSend = () => {
        const text = input.trim()
        if (!text || isBusy) return
        setInput('')
        void sendMessage({ text })
    }

    if (!hasPersona) {
        return (
            <Card>
                <p className="text-sm text-amber-600 dark:text-amber-400">
                    Create and save a persona first — then come back here to chat with{' '}
                    {avatarName}.
                </p>
            </Card>
        )
    }

    return (
        <Card className="max-w-3xl">
            <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">Chat with {avatarName}</p>
                <Button size="xs" variant="plain" onClick={onReset} disabled={isBusy}>
                    Reset conversation
                </Button>
            </div>

            <div className="flex flex-col gap-3 h-[50vh] overflow-y-auto pr-1 mb-3">
                {messages.length === 0 && (
                    <p className="text-sm text-gray-400">
                        Say hi — the reply streams in-character, grounded on this avatar&apos;s
                        knowledge base.
                    </p>
                )}
                {messages.map((message) => {
                    const text = message.parts
                        .map((p) => (p.type === 'text' ? p.text : ''))
                        .join('')
                    const retrieval = (message.metadata as RetrievalMeta | undefined)?.retrieval
                    return (
                        <div
                            key={message.id}
                            className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}
                        >
                            <div
                                className={`px-3 py-2 rounded-2xl max-w-[85%] whitespace-pre-wrap text-sm ${
                                    message.role === 'user'
                                        ? 'bg-primary text-white rounded-br-sm'
                                        : 'bg-gray-100 dark:bg-gray-700 rounded-bl-sm'
                                }`}
                            >
                                {text || '…'}
                            </div>
                            {message.role === 'assistant' && retrieval && retrieval.length > 0 && (
                                <p
                                    className="text-[10px] text-gray-400 mt-1"
                                    title={retrieval
                                        .map((r) => `${r.kind}${r.title ? ` · ${r.title}` : ''} (${(r.similarity * 100).toFixed(0)}%)`)
                                        .join('\n')}
                                >
                                    {retrieval.length} knowledge chunk{retrieval.length > 1 ? 's' : ''} used
                                </p>
                            )}
                        </div>
                    )
                })}
                {error && (
                    <div className="p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
                        <p className="text-xs text-red-600 dark:text-red-400">
                            {error.message || 'The model failed to answer'} — check the provider,
                            model and API key in the Persona tab.
                        </p>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            <div className="flex items-center gap-2">
                <Input
                    value={input}
                    placeholder={`Message ${avatarName}…`}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleSend()
                        }
                    }}
                />
                <Button variant="solid" loading={isBusy} onClick={handleSend}>
                    Send
                </Button>
            </div>
        </Card>
    )
}

export default Playground

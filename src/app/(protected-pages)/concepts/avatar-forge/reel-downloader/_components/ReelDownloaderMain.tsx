'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Alert from '@/components/ui/Alert'

/**
 * Snapinsta-style standalone downloader: paste an Instagram Reel link, click
 * Download, and the MP4 saves to disk.
 *
 * The client hits our own /api/instagram/download route (same origin, so the
 * auth cookie rides along), which resolves the Reel and streams the video back
 * as an attachment. We read it as a Blob and trigger an anchor download so the
 * filename and progress stay in our control. On failure the route returns JSON,
 * which we surface as an inline error.
 */
const ReelDownloaderMain = () => {
    const [url, setUrl] = useState('')
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleDownload = async () => {
        const trimmed = url.trim()
        if (!trimmed || isBusy) return

        setError(null)
        setIsBusy(true)
        try {
            const res = await fetch(
                `/api/instagram/download?url=${encodeURIComponent(trimmed)}`,
            )

            // A JSON body means the route failed (it streams video on success).
            const contentType = res.headers.get('content-type') || ''
            if (!res.ok || contentType.includes('application/json')) {
                let message = `Download failed (${res.status})`
                try {
                    const data = await res.json()
                    if (data?.error) message = data.error
                } catch {
                    // keep the status-based message
                }
                setError(message)
                return
            }

            const blob = await res.blob()

            // Pull the server-suggested filename out of Content-Disposition.
            const disposition = res.headers.get('content-disposition') || ''
            const match = disposition.match(/filename="?([^"]+)"?/)
            const filename = match?.[1] || 'instagram-reel.mp4'

            const objectUrl = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = objectUrl
            a.download = filename
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(objectUrl)
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Something went wrong while downloading.',
            )
        } finally {
            setIsBusy(false)
        }
    }

    return (
        <div className="flex justify-center">
            <Card className="w-full max-w-xl">
                <div className="flex flex-col gap-4">
                    <div>
                        <h4 className="mb-1">Instagram Reel Downloader</h4>
                        <p className="text-sm text-gray-500">
                            Paste a public Instagram Reel link and download the
                            video as an MP4.
                        </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://www.instagram.com/reel/..."
                            disabled={isBusy}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleDownload()
                            }}
                        />
                        <Button
                            variant="solid"
                            loading={isBusy}
                            disabled={isBusy || !url.trim()}
                            onClick={handleDownload}
                            className="shrink-0"
                        >
                            {isBusy ? 'Downloading…' : 'Download'}
                        </Button>
                    </div>

                    {error && (
                        <Alert type="danger" showIcon>
                            {error}
                        </Alert>
                    )}

                    <p className="text-xs text-gray-400">
                        Only public Reels can be resolved. Private, deleted, or
                        login-gated posts may require a configured session.
                    </p>
                </div>
            </Card>
        </div>
    )
}

export default ReelDownloaderMain

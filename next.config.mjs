import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
    serverActions: {
        bodySizeLimit: '50mb',
    },
    experimental: {
        serverActions: {
            bodySizeLimit: '50mb',
        },
        middlewareClientMaxBodySize: '50mb',
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '**',
            },
        ],
    },
    // Headers for FFmpeg WASM (requires SharedArrayBuffer)
    // Using 'credentialless' instead of 'require-corp' to allow loading external resources.
    // Under COEP, even same-origin resources need CORP — without it, the
    // FFmpeg class worker at /ffmpeg-runtime/worker.js is blocked silently
    // (no error, just never executes), so we set CORP on that path too.
    async headers() {
        const coepHeaders = [
            { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
            { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ];
        return [
            {
                source: '/concepts/avatar-forge/avatar-studio',
                headers: coepHeaders,
            },
            {
                source: '/concepts/avatar-forge/avatar-studio/:path*',
                headers: coepHeaders,
            },
            {
                source: '/ffmpeg-runtime/:path*',
                headers: [
                    { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
                    { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
                    { key: 'Content-Type', value: 'text/javascript; charset=utf-8' },
                ],
            },
        ];
    },
};

export default withNextIntl(nextConfig);

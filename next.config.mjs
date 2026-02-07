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
    // Using 'credentialless' instead of 'require-corp' to allow loading external resources
    async headers() {
        return [
            {
                source: '/concepts/avatar-forge/avatar-studio',
                headers: [
                    {
                        key: 'Cross-Origin-Opener-Policy',
                        value: 'same-origin',
                    },
                    {
                        key: 'Cross-Origin-Embedder-Policy',
                        value: 'credentialless',
                    },
                ],
            },
            {
                source: '/concepts/avatar-forge/avatar-studio/:path*',
                headers: [
                    {
                        key: 'Cross-Origin-Opener-Policy',
                        value: 'same-origin',
                    },
                    {
                        key: 'Cross-Origin-Embedder-Policy',
                        value: 'credentialless',
                    },
                ],
            },
        ];
    },
};

export default withNextIntl(nextConfig);

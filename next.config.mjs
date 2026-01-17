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
};

export default withNextIntl(nextConfig);

'use client'

import SyntaxHighlighter from '@/components/shared/SyntaxHighlighter'
import CodeToggleTabs from '@/components/docs/DemoCard/CodeToggleTabs'

const Page = () => {
    return (
        <>
            <p>
                Ecme uses NextAuth.js as the authentication solution, offering a
                robust and flexible way to handle user authentication, it
                supports custom authentication flows and provides a wide range
                of authentication providers, including Google, GitHub, and more.
            </p>
            <div className="mt-10" id="configuration">
                <p>
                    NextAuth relies on environment variables for secure
                    configuration. By default, our template includes the
                    following variables in the <code>.env</code> file:
                </p>
                <SyntaxHighlighter>{`# Authentication Secret
AUTH_SECRET=your-secret-key

# Base URL for NextAuth callbacks
NEXTAUTH_URL=http://localhost:3000

# OAuth Provider (Google)
GOOGLE_AUTH_CLIENT_ID=your-google-client-id
GOOGLE_AUTH_CLIENT_SECRET=GOCSPX-your-google-secret

# OAuth Provider (Github)
GITHUB_AUTH_CLIENT_ID=your-github-client-id
GITHUB_AUTH_CLIENT_SECRET=your-github-secret`}</SyntaxHighlighter>
                <ul>
                    <li>
                        <strong>
                            <code>AUTH_SECRET</code>
                        </strong>
                        : A random string used to encrypt session tokens.
                    </li>
                    <li>
                        <strong>
                            <code>NEXTAUTH_URL</code>
                        </strong>
                        : The base URL for your application, used in redirect
                        callbacks. Update this in production to match your
                        deployed domain.
                    </li>
                    <li>
                        <strong>
                            <code>GOOGLE_CLIENT_ID</code>,
                            <code>GOOGLE_CLIENT_SECRET</code>,{' '}
                            <code>GITHUB_CLIENT_ID</code>,
                            <code>GITHUB_CLIENT_SECRET</code>
                        </strong>
                        , : Credentials for integrating with OAuth.
                    </li>
                </ul>
                <p>
                    In our template, the NextAuth configuration is centralized
                    in the <code>auth.config.ts</code> file located in{' '}
                    <code>src/configs/</code>
                    This file defines the authentication providers and callback
                    handlers to extend session attributes.
                </p>
            </div>
            <div className="mt-10" id="credentials">
                <h5>Credentials Provider</h5>
                <p>
                    The <code>Credentials</code> provider allows custom
                    authentication logic via the authorize method, when the user
                    signs in, the credentials are validated using a backend
                    action <code>validateCredential</code>. If validation
                    passes, the user object is returned; otherwise, null is
                    returned. You can impletment your own user validate logic in{' '}
                    <code>validateCredential</code> method, it can be an api
                    call or a database query.
                </p>
                <CodeToggleTabs
                    languages={['jsx', 'jsx']}
                    tsMarkdown={`\`\`\`tsx
import type { NextAuthConfig } from "next-auth";
import validateCredential from "../server/actions/user/validateCredential";
import Credentials from "next-auth/providers/credentials";
import Github from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import type { SignInCredential } from "@/@types/auth";

export default {
    providers: [
        ..., // other providers, e.g., Github, Google
        Credentials({
            async authorize(credentials) {
                /** validate credentials from backend here */
                const user = await validateCredential(credentials as SignInCredential)
                if(!user) {
                    return null
                }

                return {
                    id: user.id,
                    name: user.userName,
                    email: user.email,
                    image: user.avatar,
                };
            },
        }),
    ],
    callbacks: {
        async session(payload) {
            
            /** apply extra user attributes here, for example, we add 'authority' & 'id' in this section */
            return {
                ...payload.session,
                user: {
                  ...payload.session.user,
                  id: payload.token.sub,
                  authority: ['admin', 'user']
                },
            }
        }
    },
} satisfies NextAuthConfig;`}
                    jsMarkdown={`\`\`\`jsx
import type { NextAuthConfig } from "next-auth";
import validateCredential from "../server/actions/user/validateCredential";
import Credentials from "next-auth/providers/credentials";
import Github from "next-auth/providers/github";
import Google from "next-auth/providers/google";

export default {
    providers: [
        ..., // other providers, e.g., Github, Google
        Credentials({
            async authorize(credentials) {
                /** validate credentials from backend here */
                const user = await validateCredential(credentials)
                if(!user) {
                    return null
                }

                return {
                    id: user.id,
                    name: user.userName,
                    email: user.email,
                    image: user.avatar,
                };
            },
        }),
    ],
    callbacks: {
        async session(payload) {
            
            /** apply extra user attributes here, for example, we add 'authority' & 'id' in this section */
            return {
                ...payload.session,
                user: {
                  ...payload.session.user,
                  id: payload.token.sub,
                  authority: ['admin', 'user']
                },
            }
        }
    },
} satisfies NextAuthConfig;`}
                />
            </div>
            <div className="mt-10" id="oauth">
                <h5>OAuth Integration</h5>
                <p>
                    NextAuth supports a wide range of OAuth providers, you can
                    check out this{' '}
                    <a
                        href="https://authjs.dev/getting-started/authentication/oauth"
                        target="_blank"
                    >
                        link
                    </a>{' '}
                    for more built in providers NextAuth supports. Below is an
                    example of integrating Google as an OAuth provider.
                </p>
                <SyntaxHighlighter language="ts">{`export default {
    providers: [
        Google({
            clientId: process.env.GOOGLE_AUTH_CLIENT_ID,
            clientSecret: process.env.GOOGLE_AUTH_CLIENT_SECRET,
        }),
    ]
}`}</SyntaxHighlighter>
            </div>
            <div className="mt-10" id="session">
                <h5>Accessing Sessions on Client and Server</h5>
                <p>
                    Authentication often requires session management both on the
                    client and server. Our template provides utilities for
                    handling sessions seamlessly in both environments
                </p>
                <ul>
                    <li>
                        <strong>Client Side:</strong>
                        <br />
                        <p>
                            While NextAuth provides the <code>useSession</code>{' '}
                            hook, it has known re-render issues. To address
                            this, we includes a custom session hook called{' '}
                            <code>useCurrentSession</code>. It provides a same
                            but lesser defects way to manage the session state
                            on the client.
                        </p>
                        <SyntaxHighlighter language="jsx">{`import useCurrentSession from '@/utils/hooks/useCurrentSession';

const Component = () => { 
    const { session } = useCurrentSession();

    return (
        <div>
            {session ? (
                <>
                    <h1>Welcome, {session.user.name}!</h1>
                    <p>Email: {session.user.email}</p>
                </>
            ) : (
                <p>You are not logged in.</p>
            )}
        </div>
    );
};

export default Component`}</SyntaxHighlighter>
                    </li>
                    <li>
                        <strong>Server Side:</strong>
                        <br />
                        <p>
                            For server-side operations, you can use the{' '}
                            <code>auth()</code> function to securely retrieve
                            session details. This is particularly useful when
                            you are restricting user access to some routes or
                            pre fetching user data before rendering the page
                        </p>
                        <SyntaxHighlighter language="tsx">{`import { auth } from "@/auth";

export default async function Page() { 
    const session = await auth();

    if (!session) {
        // Redirect or show an error for unauthenticated users
        return <p>You must be logged in to view this page.</p>;
    }

    return (
        <div>
            <h1>Welcome, {session.user.name}!</h1>
            <p>Your email: {session.user.email}</p>
        </div>
    );
}`}</SyntaxHighlighter>
                    </li>
                </ul>
            </div>
            <div className="mt-10" id="removing">
                <h5>Removing auth</h5>
                <p>
                    If you choose not to use NextAuth, follow these steps to
                    remove it:
                </p>
                <ol>
                    <li>
                        <strong>Uninstall NextAuth:</strong>
                        <br />
                        <SyntaxHighlighter language="ts">
                            npm uninstall next-auth
                        </SyntaxHighlighter>
                    </li>
                    <li>
                        <strong>Remove next auth related files:</strong>
                        <br />
                        <ul>
                            <li>
                                Remove the{' '}
                                <code>src/configs/auth.config.ts</code>.
                            </li>
                            <li>
                                Delete dynamic API routes at{' '}
                                <code>pages/api/auth/[...nextauth]</code>.
                            </li>
                            <li>
                                Reset or delete
                                <i>
                                    (if you do not need routing protection)
                                </i>{' '}
                                <code>middleware.ts</code>.
                            </li>
                            <li>
                                Remove all <code>auth()</code> &{' '}
                                <code>useCurrentSession()</code> implementations
                                from following components:
                                <ul>
                                    <li>
                                        <code>app/layout.tsx</code>
                                    </li>
                                    <li>
                                        <code>
                                            components/template/HorizontalNav.tsx
                                        </code>
                                    </li>
                                    <li>
                                        <code>
                                            components/template/MobileNav.tsx
                                        </code>
                                    </li>
                                    <li>
                                        <code>
                                            components/template/SideNav.tsx
                                        </code>
                                    </li>
                                    <li>
                                        <code>
                                            components/template/UserProfileDropdown.tsx
                                        </code>
                                    </li>
                                    <li>
                                        <code>
                                            components/template/StackeSideNav.tsx
                                        </code>
                                    </li>
                                </ul>
                            </li>
                        </ul>
                    </li>
                </ol>
                <p>
                    By following these steps, you can successfully remove
                    NextAuth from the template and replace it with your
                    preferred authentication method.
                </p>
            </div>
            <div className="mt-10" id="officialDocumentation">
                <h5>Official Documentation</h5>
                <p>
                    For further details on using NextAuth, visit the{' '}
                    <a
                        href="https://authjs.dev/getting-started/installation?framework=Next.js"
                        target="_blank"
                    >
                        NextAuth.js Documentation
                    </a>
                    .
                </p>
            </div>
        </>
    )
}

export default Page

import SyntaxHighlighter from '@/components/shared/SyntaxHighlighter'

const Page = () => {
    return (
        <>
            <p>
                This section covers the steps to deploy your app to a live
                environment. Whether you&apos;re using Vercel or a custom
                hosting solution, follow these guidelines to ensure a smooth
                deployment process.
            </p>
            <p>
                For detailed instructions on platform-specific deployments,
                refer to the{' '}
                <a
                    href="https://nextjs.org/docs/app/building-your-application/deploying"
                    target="_blank"
                    rel="noopener"
                >
                    Next.js Deployment Documentation
                </a>
                .
            </p>
            <div className="mt-10" id="preparingForDeployment">
                <h5>Preparing for Deployment</h5>
                <p>
                    Before deploying, ensure that your app is production-ready:
                </p>
                <ul>
                    <li>
                        <strong>Environment Variables</strong>: <br /> Verify
                        that all required variables (e.g., API keys, database
                        URLs) are correctly set in your environment
                        configuration.
                    </li>
                    <li>
                        <strong>Build Optimizations</strong>
                        <br />
                        <p>
                            Run the following command to create an optimized
                            production build:
                        </p>
                        <SyntaxHighlighter>{`npm run build`}</SyntaxHighlighter>
                    </li>
                    <li>
                        <strong>Testing</strong>
                        <br />
                        <p>
                            Test your app locally using the production build to
                            identify potential issues:
                        </p>
                        <SyntaxHighlighter>{`npm run start`}</SyntaxHighlighter>
                    </li>
                </ul>
            </div>
            <div className="mt-10" id="deployingToVercel">
                <h5>Deploying to Vercel</h5>
                <p>Vercel is a popular platform for deploying Next.js apps.</p>
                <ol>
                    <li>
                        <strong>Connect to Vercel</strong>: Sign in to
                        <a
                            rel="noopener"
                            target="_new"
                            href="https://vercel.com/"
                        >
                            <span>Vercel</span>
                        </a>{' '}
                        and import your Git repository.
                    </li>
                    <li>
                        <strong>Configure Build Settings</strong>: Ensure the
                        framework is set to
                        <strong>Next.js</strong>, and the build command is
                        <code>npm run build</code>.
                    </li>
                    <li>
                        <strong>Environment Variables</strong>: Add environment
                        variables directly in the Vercel dashboard.
                    </li>
                    <li>
                        <strong>Deploy</strong>: Click
                        <strong>Deploy</strong>, and Vercel will automatically
                        handle the rest.
                    </li>
                </ol>
            </div>
            <div className="mt-10" id="deployingToVercel">
                <h5>Custom Hosting</h5>
                <p>
                    If you&apos;re deploying to a custom server or VPS, make
                    sure Node.js installed on your server.
                </p>
                <ol>
                    <li>
                        <strong>Build the App</strong>: Run the production build{' '}
                        <SyntaxHighlighter>{`npm run build`}</SyntaxHighlighter>
                    </li>
                    <li>
                        <strong>Build the App</strong>{' '}
                        <SyntaxHighlighter>{`npm run start`}</SyntaxHighlighter>
                        <p>
                            You can use a process manager like <code>pm2</code>{' '}
                            or <code>Docker</code> to manage your app
                        </p>
                    </li>
                </ol>
            </div>
        </>
    )
}

export default Page

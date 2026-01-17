import SyntaxHighlighter from '@/components/shared/SyntaxHighlighter'

const Page = () => {
    return (
        <>
            <p>
                Environment variables are a secure way to store and manage
                configuration data or sensitive information, such as API keys,
                database connection strings, or environment-specific settings.
                In Next.js, environment variables are defined in{' '}
                <code>.env</code> files and can be accessed during build time or
                runtime, depending on their prefix.
            </p>
            <div className="mt-10" id="settingUpEnvironmentVariables">
                <h5>Setting Up Environment Variables</h5>
                <p>
                    The template already comes with a <code>.env</code> file
                    located in the root directory. Feel free to modify these
                    variables according to your project requirements.
                    Here&apos;s an example of an environment variables and
                    naming conventions:
                </p>
                <SyntaxHighlighter>{`NEXT_PUBLIC_API_BASE_URL=https://api.example.com
DATABASE_URL=postgres://user:password@localhost:5432/db_name`}</SyntaxHighlighter>
                <ul>
                    <li>
                        <strong>Public Variables</strong>: Variables prefixed
                        with
                        <code>NEXT_PUBLIC_</code> are exposed to the browser.
                        These should not include sensitive data.
                    </li>
                    <li>
                        <strong>Private Variables</strong>: Variables{' '}
                        <strong>without</strong> the
                        <code>NEXT_PUBLIC_</code> prefix are only available on
                        the server side and are never exposed to the client.
                    </li>
                </ul>
            </div>
            <div className="mt-10" id="accessingEnvironmentVariables">
                <h5>Accessing Environment Variables</h5>
                <ol>
                    <li>
                        <strong>Server-Side Access:</strong>
                        <br />
                        Access private variables in server-side functions like
                        API routes or Server Components:
                        <SyntaxHighlighter language="js">{`export async function GET() {
    const databaseUrl = process.env.DATABASE_URL;
    return new Response('Database URL:' + databaseUrl);
}`}</SyntaxHighlighter>
                    </li>
                    <li>
                        <strong>Client-Side Access:</strong>
                        <br />
                        Access public variables in your React components:
                        <SyntaxHighlighter language="jsx">{`const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

useEffect(() => {
    console.log('API Base URL:', apiBaseUrl);
}, []);`}</SyntaxHighlighter>
                    </li>
                </ol>
            </div>
            <div className="mt-10" id="officialDocumentation">
                <h5>Official Documentation</h5>
                <p>
                    For more details, refer to the official{' '}
                    <a
                        href="https://nextjs.org/docs/app/building-your-application/configuring/environment-variables"
                        target="_blank"
                    >
                        Next.js Environment Variables
                    </a>{' '}
                    documentation.
                </p>
            </div>
        </>
    )
}

export default Page

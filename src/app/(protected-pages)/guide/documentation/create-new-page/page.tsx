'use client'
import SyntaxHighlighter from '@/components/shared/SyntaxHighlighter'

const Page = () => {
    return (
        <>
            <p>
                This guide walks you through the steps to create a new page in
                the template. By leveraging Next.js file-system routing and the
                extended routing configuration, you can easily add new pages
                with tailored settings.
            </p>
            <div className="mt-10" id="step1">
                <h5>Create the Page Component</h5>
                <ol>
                    <li>
                        <p>
                            <strong>Navigate to the app directory</strong>
                            <br />
                            In the <code>src/app</code> folder, decide where
                            your new page should go. For example, if the page
                            requires authentication, place it in the
                            <code>src/app/(protected-pages)</code> directory. If
                            it doesn&apos;t require authentication, use the
                            <code>src/app/(public-pages)</code> directory
                            instead.
                        </p>
                    </li>
                    <li>
                        <p>
                            <strong>Create a New File</strong>
                            <br />
                            Create a file named after the new route. For
                            example:
                        </p>
                        <ul>
                            <li>
                                For a static route, create
                                <code>src/app/new-page/page.tsx</code>.
                            </li>
                            <li>
                                For a dynamic route, use brackets to define
                                parameters, e.g.,
                                <code>src/app/new-page/[id]/page.tsx</code>.
                            </li>
                        </ul>
                    </li>
                    <li>
                        <p>
                            <strong>Add Your Page Code</strong>
                            <br />
                            Define the React component for your page. Example:
                        </p>
                        <SyntaxHighlighter language="jsx">{`const Page = () => {
    return (
        <div>
            <h1>Welcome to the New Page</h1>
            <p>This is a custom page.</p>
        </div>
    );
};

export default Page;`}</SyntaxHighlighter>
                    </li>
                </ol>
            </div>
            <div className="mt-10" id="step2">
                <h5>Add Routing Configuration</h5>
                <p>
                    Extend the routing setup, update the{' '}
                    <code>src/configs/route.config/routes.config.ts</code>{' '}
                    <code>protectedRoutes</code> or <code>publicRoutes</code>{' '}
                    configuration to include your new page. For example:
                </p>
                <SyntaxHighlighter language="jsx">{`import { ADMIN, USER } from '@/constants/roles';

export const protectedRoutes = {
    ...protectedRoutes,
    '/new-page': {
        key: 'newPage',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
        },
    },
};`}</SyntaxHighlighter>
                <p>
                    In Next.js, creating a new page is as simple as adding a{' '}
                    <strong>folder</strong> and a <code>page.tsx</code> file
                </p>
            </div>
            <div className="mt-10" id="additional-note">
                <h5>Additional Notes</h5>
                <p>
                    Instead of applying <code>&apos;use client&apos;</code>{' '}
                    directly to the page file, it is recommended to create a
                    separate client component and import it into the page. This
                    approach allows the page itself to remain server-rendered,
                    optimizing server-side rendering (SSR) and letting only the
                    client-side logic be handled in the client component. For
                    example:
                </p>
                <SyntaxHighlighter language="jsx">{`// src/app/(protected-pages)/new-page/page.tsx
import ClientComponent from './ClientComponent';

const NewPage = () => {
    return (
        <div>
            <h1>New Page</h1>
            <ClientComponent />
        </div>
    );
};

export default NewPage;`}</SyntaxHighlighter>
                <SyntaxHighlighter language="jsx">{`// src/app/(protected-pages)/new-page/_components/ClientComponent.tsx
'use client';

const ClientComponent = () => {
    return <p>This component runs on the client.</p>;
};

export default ClientComponent;`}</SyntaxHighlighter>
                <p>
                    This way, the page can process SSR tasks before rendering
                    client-side components.
                </p>
            </div>
        </>
    )
}

export default Page

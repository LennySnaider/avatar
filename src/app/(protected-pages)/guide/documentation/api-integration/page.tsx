'use client'

import CodeToggleTabs from '@/components/docs/DemoCard/CodeToggleTabs'

const Page = () => {
    return (
        <>
            <p>
                Next.js provides a built-in API routing system, enabling you to
                define backend functionality directly within your application.
                This system allows you to handle requests, process data, and
                communicate with external services seamlessly, all while
                colocating your API logic with your Next.js project structure.
            </p>
            <p>
                In this section, we&apos;ll explore how APIs work in Next.js,
                provide examples of creating API routes, and demonstrate how it
                work with Ecme.
            </p>
            <div className="mt-10" id="howApiRoutesWork">
                <h5>How API Routes Work</h5>
                <ol>
                    <li>
                        <p>
                            <strong>File-based API Routes:</strong>
                            <br />
                            API routes are created inside the{' '}
                            <code>/app/api</code> directory. Each file within
                            this directory defines an endpoint. The file name
                            (or folder structure) corresponds to the
                            endpoint&apos;s path.
                        </p>
                    </li>
                    <li>
                        <p>
                            <strong>Request and Response Objects:</strong>
                            <br />
                            API routes handle requests and responses using
                            Node.js-style
                            <code>req</code> and <code>res</code> objects. This
                            makes it easy to process incoming data and send
                            responses.
                        </p>
                    </li>
                    <li>
                        <p>
                            <strong>Server-side Execution:</strong>
                            <br />
                            API routes always run on the server, ensuring secure
                            handling of sensitive operations such as database
                            queries or authentication logic.
                        </p>
                    </li>
                </ol>
                <p>
                    For more comprehensive details, refer to the official{' '}
                    <a
                        href="https://nextjs.org/docs/app/building-your-application/routing"
                        target="_blank"
                    >
                        Next.js documentation on API Routes
                    </a>
                    .
                </p>
            </div>
            <div className="mt-10" id="creatingApiRoutes">
                <h5>Creating API Routes</h5>
                <p>Here&apos;s an example of creating a simple API route</p>
                <ol>
                    <li>
                        <strong>Create the API Route:</strong>
                        <br />
                        Create a file named <code>hello.ts</code> in the{' '}
                        <code>src/app/api/hello/route.ts</code> directory:
                        <CodeToggleTabs
                            languages={['jsx', 'jsx']}
                            tsMarkdown={`\`\`\`tsx
import { NextResponse } from 'next/server';

const mockMethodThatSavesToDatabase = async (data) => {
    // Simulate saving to a database
    console.log('Data saved to database:', data);
};

export async function POST(request: Request) {
    try {
        // Fetch data from an external API
        const externalApiResponse = await fetch('https://jsonplaceholder.typicode.com/posts/1');
        const externalData = await externalApiResponse.json();

        // Save the fetched data to the database
        await mockMethodThatSavesToDatabase(externalData);

        return NextResponse.json({ message: 'Data saved successfully', data: externalData });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to save data', details: error.message }, { status: 500 });
    }
}`}
                            jsMarkdown={`\`\`\`jsx
import { NextResponse } from 'next/server';

const mockMethodThatSavesToDatabase = async (data) => {
    // Simulate saving to a database
    console.log('Data saved to database:', data);
};

export async function POST(request) {
    try {
        // Fetch data from an external API
        const externalApiResponse = await fetch('https://jsonplaceholder.typicode.com/posts/1');
        const externalData = await externalApiResponse.json();

        // Save the fetched data to the database
        await mockMethodThatSavesToDatabase(externalData);

        return NextResponse.json({ message: 'Data saved successfully', data: externalData });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to save data', details: error.message }, { status: 500 });
    }
}`}
                        />
                    </li>
                </ol>
            </div>
            <div className="mt-10" id="callingApiRoutes">
                <h5>Calling an API Route from the Client Side</h5>
                <p>
                    To simplify client-side API calls, our template includes a
                    utility <code>ApiService</code> under the{' '}
                    <code>services</code> directory. This utility: Accepts an
                    Axios request configuration andautomatically handles
                    responses and errors, returning only the relevant data or
                    error details. Here&apos;s how it works:
                </p>
                <ol>
                    <li>
                        <p>
                            Start by creating a new service file specific to
                            your feature or module. For instance, if you&apos;re
                            working on user management, create a file named{' '}
                            <code>UserManagementService.ts</code> in the{' '}
                            <code>services</code> directory.
                        </p>
                    </li>
                    <li>
                        <p>
                            Inside the service file, declare an asynchronous
                            function to handle the API request. This function
                            should utilize <code>ApiService.fetchData</code>,
                            accepting two generic types:{' '}
                            <strong>Response</strong> and{' '}
                            <strong>Request</strong>, along with the Axios
                            configuration. Here&apos;s an example:
                        </p>
                        <CodeToggleTabs
                            languages={['tsx', 'jsx']}
                            tsMarkdown={`\`\`\`tsx
type MyApiResponse = {
    someResponseData: string
    someResponseData2: boolean
}

type MyApiRequest = {
    someRequestData: string
}

export async function myApi (data) {
    return ApiService.fetchData<MyApiResponse,MyApiRequest>({
        url: '/my-api-url',
        method: 'post',
        data
    })
}
...`}
                            jsMarkdown={`\`\`\`jsx
export async function myApi (data) {
    return ApiService.fetchData({
        url: '/my-api-url',
        method: 'post',
        data
    })
}
...`}
                        />
                        <p>
                            or forwarding the type to generic from comsumer
                            level:
                        </p>
                        <CodeToggleTabs
                            languages={['tsx', 'jsx']}
                            tsMarkdown={`\`\`\`tsx
import ApiService from "./ApiService"

export async function myApi<TResponse, TRequest>(data) {
    return ApiService.fetchData<TResponse, TRequest>({
        url: '/my-api-url',
        method: 'post',
        data
    })
}
...`}
                            jsMarkdown={`\`\`\`jsx
import ApiService from "./ApiService"

export async function myApi(data) {
    return ApiService.fetchData({
        url: '/my-api-url',
        method: 'post',
        data
    })
}
...`}
                        />
                    </li>
                    <li>
                        <p>
                            And now you can hook up this API in your component
                        </p>
                        <CodeToggleTabs
                            languages={['tsx', 'jsx']}
                            tsMarkdown={`\`\`\`tsx
type MyApiResponse = {
    someResponseData: string
    someResponseData2: boolean
}

type MyApiRequest = {
    someRequestData: string
}

import { myApi } from './MyService.ts'

const MyComponent = props => {

    const fetchData = async () => {
        const reqeustParam = { key: 'value'}
        try {
            const resp = await myApi<MyApiResponse, MyApiRequest>(reqeustParam)
            if (resp.data) {
                ...do something
            }
        } catch (errors) {
            ...handle errors
        }
    }
    
    // You can
    useEffect(() => {
        fetchData()
    }, [])

    return (
    ...
)`}
                            jsMarkdown={`\`\`\`jsx
import { myApi } from './MyService.ts'

const MyComponent = props => {

    const fetchData = async () => {
        const reqeustParam = { key: 'value'}
        try {
            const resp = await myApi(reqeustParam)
            if (resp.data) {
                ...do something
            }
        } catch (errors) {
            ...handle errors
        }
    }
    
    // You can
    useEffect(() => {
        fetchData()
    }, [])

    return (
    ...
)`}
                        />
                        <p>
                            <strong>Note</strong>: You can also use
                            data-fetching libraries like{' '}
                            <a
                                href="https://swr.vercel.app/"
                                target="_blank"
                                rel="noreferrer"
                            >
                                SWR
                            </a>{' '}
                            or{' '}
                            <a
                                href="https://tanstack.com/query/latest"
                                target="_blank"
                                rel="noreferrer"
                            >
                                TanStack Query
                            </a>{' '}
                            for a more declarative approach to data fetching.
                            The choice depends on your specific needs.
                        </p>
                        <p>
                            With <code>ApiService</code>, handling client-side
                            API calls becomes standardized and easier to
                            maintain. Combined with Next.js API routes, you can
                            seamlessly manage server-side logic and interact
                            with your backend.
                        </p>
                    </li>
                </ol>
            </div>
        </>
    )
}

export default Page

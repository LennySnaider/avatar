import SyntaxHighlighter from '@/components/shared/SyntaxHighlighter'
import CodeToggleTabs from '@/components/docs/DemoCard/CodeToggleTabs'

const Page = () => {
    return (
        <>
            <p>
                Our template uses{' '}
                <a href="https://next-intl.dev/" target="_blank">
                    <code>next-intl</code>
                </a>{' '}
                to handle internationalization (i18n). By default, the starter
                does not include i18n setup, as not every project requires this
                feature. However, we offer two distinct setups to cater to both
                scenarios: Without i18n Routing (default) and With i18n Routing.
            </p>
            <p>
                We integrates i18n into the navigation module by default. If you
                need to having i18n in your app, you might need to toggle the{' '}
                <code>activeNavTranslation</code> field in{' '}
                <code>src/configs/app.config.ts</code> to <code>true</code>.
            </p>
            <SyntaxHighlighter language="ts">{`
// src/configs/app.config.ts
export const appConfig: AppConfig = {
    ...
    activeNavTranslation: true
}`}</SyntaxHighlighter>
            <div className="my-10" id="without-i18n-routing">
                <h5>Without i18n Routing</h5>
                <p>
                    This setup is designed for simplicity, allowing you to
                    manage translations without involving URL structures, which
                    we implemented in our demo.
                </p>
                <ol>
                    <li>
                        <p>
                            Add your translation files to the{' '}
                            <code>messages</code> folder in the root directory:
                        </p>
                        <SyntaxHighlighter>{`messages/
├── en.json
├── es.json
└── fr.json
`}</SyntaxHighlighter>
                        <p>
                            This is a simplest example to add your translation
                            key to a JSON files
                        </p>
                        <SyntaxHighlighter language="json">{`// messages/en.json
{
    "title": "Home",
}`}</SyntaxHighlighter>
                        <SyntaxHighlighter language="json">{`// messages/es.json
{
    "title": "Inicio",
}`}</SyntaxHighlighter>
                    </li>
                    <li>
                        <p>
                            Wrap the application with{' '}
                            <code>LocaleProvider</code> in{' '}
                            <code>src/app/layout.tsx</code> and inject necessary
                            props
                        </p>
                        <CodeToggleTabs
                            languages={['tsx', 'jsx']}
                            tsMarkdown={`\`\`\`tsx
// src/app/layout.tsx
...
import LocaleProvider from "@/components/template/LocaleProvider";
import { getLocale, getMessages } from "next-intl/server";

export default async function RootLayout({
    children,
}: Readonly<{
    children: ReactNode;
}>) {

    const locale = await getLocale();

    const messages = await getMessages();

    ...                          

    return (
        <html suppressHydrationWarning>
            <body suppressHydrationWarning>
                <LocaleProvider locale={locale} messages={messages}>
                    <ThemeProvider locale={locale} theme={theme}>
                        ...other components
                        {children}
                    </ThemeProvider>
                </LocaleProvider>  
            </body>
        </html>
    );
}`}
                            jsMarkdown={`\`\`\`jsx
// src/app/layout.jsx
...
import LocaleProvider from "@/components/template/LocaleProvider";
import { getLocale, getMessages } from "next-intl/server";

export default async function RootLayout({
    children,
}) {

    const locale = await getLocale();

    const messages = await getMessages();

    ...                          

    return (
        <html suppressHydrationWarning>
            <body suppressHydrationWarning>
                <LocaleProvider locale={locale} messages={messages}>
                    <ThemeProvider locale={locale} theme={theme}>
                        ...other components
                        {children}
                    </ThemeProvider>
                </LocaleProvider>  
            </body>
        </html>
    );
}`}
                        />
                    </li>
                    <li>
                        <p>
                            Now you can use translations in your page components
                            or anywhere else with useTranslation hook
                        </p>
                        <SyntaxHighlighter language="tsx">{`import {useTranslations} from 'next-intl';
 
export default function HomePage() {
    const t = useTranslations();
    return <h1>{t('title')}</h1>;
}`}</SyntaxHighlighter>
                    </li>
                </ol>
            </div>
            <div className="my-10" id="with-i18n-routing">
                <h5>With i18n Routing</h5>
                <p>
                    Next Intl provide i18n Routing setup, it use unique
                    pathnames for every language that your app supports, this
                    setup can be useful if you need a Prefix-based routing (e.g.{' '}
                    <code>/en/about</code>) or Domain-based routing (e.g.{' '}
                    <code>en.example.com</code>)
                </p>
                <p>
                    Setting up i18n routing in a Next.js app requires more
                    effort compared with the above one. This setup involves
                    changes to the project structure and additional
                    configurations.
                </p>
                <p>
                    If you&apos;re considering implementing i18n routing, refer
                    to the official next-intl documentation for a comprehensive
                    guide:{' '}
                    <a
                        href="https://next-intl.dev/docs/getting-started/app-router/with-i18n-routing"
                        target="_blank"
                    >
                        App Router setup with i18n routing
                    </a>
                </p>
            </div>
            <div className="mt-10" id="changingLanguage">
                <h5>Changing language</h5>
                <p className="mt-1">
                    If you need to switch languages dynamically(Without i18n
                    Routing), you can use the <code>i18n</code> object provided
                    by the <code>useTranslation</code> hook to change the
                    current language.
                </p>
                <CodeToggleTabs
                    languages={['tsx', 'jsx']}
                    tsMarkdown={`\`\`\`tsx
'use client'
                
import { setLocale } from '@/server/actions/locale'

const Component = () => {

    const handleUpdateLocale = async (locale: string) => {
        await setLocale(locale)
    }

    return (
        <button onClick={() => handleUpdateLocale('fr')}>Change language</button>
    )
}

export default Component`}
                    jsMarkdown={`\`\`\`jsx
'use client'
                
import { setLocale } from '@/server/actions/locale'

const Component = () => {

    const handleUpdateLocale = async (locale) => {
        await setLocale(locale)
    }

    return (
        <button onClick={() => handleUpdateLocale('fr')}>Change language</button>
    )
}

export default Component`}
                />
            </div>
            <div className="mt-10" id="settingDefaultLanguage">
                <h5>Setting the Default Language</h5>
                <p className="mt-1">
                    To set the default language, you might need to visit{' '}
                    <code>src/configs/app.config.ts</code> and change the{' '}
                    <code>locale</code> field value
                </p>
                <SyntaxHighlighter language="ts">{`export const appConfig: AppConfig = {
    ...
    locale: 'fr'
}`}</SyntaxHighlighter>
                <div className="mt-10" id="addNewLocale">
                    <h5>Adding new locale</h5>
                    <p>
                        To support a new language in your app, create a new JSON
                        file for the locale inside the <code>messages</code>{' '}
                        folder. For example, to add French translations, create
                        a file named <code>messages/fr.json</code>:
                    </p>
                    <SyntaxHighlighter language="json">{`// messages/fr.json
{
    "HomePage": {
        "title": "Bonjour le monde!",
        "about": "Aller à la page à propos"
    }
}`}</SyntaxHighlighter>
                    <p>
                        Register the new locale value in{' '}
                        <code>src/i18n/dateLocales.ts</code>
                    </p>
                    <CodeToggleTabs
                        languages={['tsx', 'jsx']}
                        tsMarkdown={`\`\`\`tsx
export const dateLocales: {
    [key: string]: () => Promise<ILocale>
} = {
    ...
    fr: () => import('dayjs/locale/fr'),
}`}
                        jsMarkdown={`\`\`\`jsx
export const dateLocales = {
    ...
    fr: () => import('dayjs/locale/fr'),
}`}
                    />
                    <p>
                        For i18n Routing, you might need to include the new
                        locale value to routing configuration & middleware
                    </p>
                </div>
            </div>
        </>
    )
}

export default Page

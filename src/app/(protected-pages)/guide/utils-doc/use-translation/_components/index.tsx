'use client'
import DemoComponentApi from '@/components/docs/DemoComponentApi'
import DemoLayout from '@/components/docs/DemoLayout'

// Demo
import Example from './Example'

const mdPath = 'UseTranslationDoc'

const demoHeader = {
    title: 'useTranslation',
    desc: `<code>useTranslation</code> is a custom wrapper around <code>next-intl</code>'s <code>useTranslation</code>.`,
}

const demos = [
    {
        mdName: 'Example',
        mdPath: mdPath,
        title: 'Example',
        desc: ``,
        component: <Example />,
    },
]

const demoApi = [
    {
        component: 'Params',
        api: [
            {
                propName: 'namespaces',
                type: `<code>string</code>	`,
                default: '-',
                desc: 'Access the namespace of the translation message.',
            },
        ],
    },
]

const extra = (
    <DemoComponentApi
        hideApiTitle
        keyText="return"
        api={[
            {
                api: [
                    {
                        propName: 't',
                        type: `<code>(key: string, nameSpace?: string) => string</code>`,
                        default: '-',
                        desc: 'A translation function that returns the translated string. It also provided other translation functions, refer to <a class="text-primary underline" href="https://next-intl.dev/docs/usage/messages#rendering-messages-with-usetranslations">next-intl</a> docs for more details usage.',
                    },
                ],
            },
        ]}
    />
)

const UseTranslationDoc = () => {
    return (
        <DemoLayout
            hideApiTitle
            hideFooter
            innerFrame={false}
            header={demoHeader}
            demos={demos}
            mdPrefixPath="utils"
            extra={extra}
            api={demoApi}
            keyText="param"
        />
    )
}

export default UseTranslationDoc

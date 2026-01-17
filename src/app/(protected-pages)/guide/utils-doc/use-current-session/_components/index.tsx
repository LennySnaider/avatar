'use client'

import DemoComponentApi from '@/components/docs/DemoComponentApi'
import DemoLayout from '@/components/docs/DemoLayout'

// Demo
import Example from './Example'

const mdPath = 'UseCurrentSessionDoc'

const demoHeader = {
    title: 'useCurrentSession',
    desc: 'useCurrentSession hook help to retreive current user session.',
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

const extra = (
    <DemoComponentApi
        hideApiTitle
        keyText="return"
        api={[
            {
                component: 'Return',
                api: [
                    {
                        propName: 'session',
                        type: `<code>{name?: string, image?: string, id?: string, email?: string}</code>`,
                        default: `-`,
                        desc: 'User information',
                    },
                ],
            },
        ]}
    />
)

const UseAuthorityDoc = () => {
    return (
        <DemoLayout
            hideApiTitle
            hideFooter
            innerFrame={false}
            header={demoHeader}
            demos={demos}
            mdPrefixPath="utils"
            extra={extra}
            keyText="param"
        />
    )
}

export default UseAuthorityDoc

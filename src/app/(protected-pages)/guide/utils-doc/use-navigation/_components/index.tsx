'use client'

import DemoComponentApi from '@/components/docs/DemoComponentApi'
import DemoLayout from '@/components/docs/DemoLayout'

// Demo
import Example from './Example'

const mdPath = 'UseNavigationDoc'

const demoHeader = {
    title: 'useNavigation',
    desc: 'useNavigation helps to retrieve whole navigation tree.',
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
                        propName: 'navigationTree',
                        type: `<code>NavConfigMeta</code>`,
                        default: `-`,
                        desc: 'The whole navigation tree',
                    },
                ],
            },
        ]}
    />
)

const UseMenuActiveDoc = () => {
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

export default UseMenuActiveDoc

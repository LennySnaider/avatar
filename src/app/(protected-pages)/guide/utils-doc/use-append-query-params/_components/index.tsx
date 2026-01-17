'use client'

import DemoComponentApi from '@/components/docs/DemoComponentApi'
import DemoLayout from '@/components/docs/DemoLayout'

// Demo
import Example from './Example'

const mdPath = 'UseAppendQueryParamsDoc'

const demoHeader = {
    title: 'useAppendQueryParams',
    desc: 'useAppendQueryParams hook is used to append query params to current url.',
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
                        propName: 'onAppendQueryParams',
                        type: `<code>(payload: Record< string, any >) => void</code>`,
                        default: `-`,
                        desc: 'Function that append query params to url',
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

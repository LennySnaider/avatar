'use client'

import DemoLayout from '@/components/docs/DemoLayout'

// Demo
import Example from './Example'

const mdPath = 'IsBrowserDoc'

const demoHeader = {
    title: 'isBrowser',
    desc: 'A boolean value to check if the code is running in a browser environment.',
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

const IsBrowserDoc = () => {
    return (
        <DemoLayout
            hideApiTitle
            hideFooter
            innerFrame={false}
            header={demoHeader}
            demos={demos}
            mdPrefixPath="utils"
            keyText="param"
        />
    )
}

export default IsBrowserDoc

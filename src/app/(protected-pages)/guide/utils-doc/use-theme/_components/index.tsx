'use client'
import DemoComponentApi from '@/components/docs/DemoComponentApi'
import DemoLayout from '@/components/docs/DemoLayout'

// Demo
import Example from './Example'

const mdPath = 'UseThemeDoc'

const demoHeader = {
    title: 'useTheme',
    desc: 'A hook for managing and accessing theme-related states and actions.',
}

const demos = [
    {
        mdName: 'Example',
        mdPath: mdPath,
        title: 'Example',
        desc: `An example showcasing how to use the useTheme hook to toggle modes, change directions, and adjust layout settings.`,
        component: <Example />,
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
                        propName: 'setSchema',
                        type: `<code>(schema: string) => void</code>`,
                        default: `-`,
                        desc: 'Updates the current theme schema and applies the new schema.',
                    },
                    {
                        propName: 'setMode',
                        type: `<code>(mode: Mode) => void</code>`,
                        default: `-`,
                        desc: 'Sets the theme mode (e.g., light or dark) and applies it to the document.',
                    },
                    {
                        propName: 'setSideNavCollapse',
                        type: `<code>(sideNavCollapse: boolean) => void</code>`,
                        default: `-`,
                        desc: 'Toggles the collapse state of the side navigation.',
                    },
                    {
                        propName: 'setDirection',
                        type: `<code>(direction: Direction) => void</code>`,
                        default: `-`,
                        desc: 'Sets the text direction of the document (e.g., ltr or rtl).',
                    },
                    {
                        propName: 'setPanelExpand',
                        type: `<code>(panelExpand: boolean) => void</code>`,
                        default: `-`,
                        desc: 'Expands or collapses a panel based on the provided value.',
                    },
                    {
                        propName: 'setLayout',
                        type: `<code>(layout: LayoutType) => void</code>`,
                        default: `-`,
                        desc: 'Sets the layout type of the application (e.g., vertical, horizontal).',
                    },
                    {
                        propName: 'mode',
                        type: `<code>Mode</code>`,
                        default: `-`,
                        desc: 'The current theme mode (e.g., light or dark).',
                    },
                    {
                        propName: 'direction',
                        type: `<code>Direction</code>`,
                        default: `-`,
                        desc: 'The current text direction (e.g., ltr or rtl).',
                    },
                    {
                        propName: 'layout',
                        type: `<code>LayoutType</code>`,
                        default: `-`,
                        desc: 'The current layout type of the application.',
                    },
                ],
            },
        ]}
    />
)

const UseResponsiveDoc = () => {
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

export default UseResponsiveDoc

import DemoComponentApi from '@/components/docs/DemoComponentApi'
import CodeToggleTabs from '@/components/docs/DemoCard/CodeToggleTabs'

const Page = () => {
    return (
        <>
            <p>
                The file <code>src/configs/theme.config.ts</code> contains the
                default theme settings for the template. These configurations
                are predefined but can be customized to suit your needs. Below
                is the default configuration:
            </p>
            <p>
                If you realize that the theme did not change after setting a new
                value to the configuration, you could consider to clear the{' '}
                <code>theme</code> key from <code>cookies</code>
            </p>
            <CodeToggleTabs
                languages={['tsx', 'jsx']}
                tsMarkdown={`\`\`\`tsx
import { THEME_ENUM } from '@/constants/theme.constant'
import {
    Direction,
    Mode,
    ControlSize,
    LayoutType,
} from '@/@types/theme'

export type ThemeConfig = {
    themeSchema: string
    direction: Direction
    mode: Mode
    panelExpand: boolean
    controlSize: ControlSize
    layout: {
        type: LayoutType
        sideNavCollapse: boolean
    }
}

export const themeConfig: ThemeConfig = {
    themeSchema: '',
    direction: THEME_ENUM.DIR_LTR,
    mode: THEME_ENUM.MODE_LIGHT,
    panelExpand: false,
    controlSize: 'md',
    layout: {
        type: THEME_ENUM.LAYOUT_COLLAPSIBLE_SIDE,
        sideNavCollapse: false,
    },
}`}
                jsMarkdown={`\`\`\`jsx
import { THEME_ENUM } from '@/constants/theme.constant'

export const themeConfig = {
    themeSchema: '',
    direction: THEME_ENUM.DIR_LTR,
    mode: THEME_ENUM.MODE_LIGHT,
    panelExpand: false,
    controlSize: 'md',
    layout: {
        type: THEME_ENUM.LAYOUT_COLLAPSIBLE_SIDE,
        sideNavCollapse: false,
    },
}`}
            />
            <div className="mt-10" id="properties">
                <h5>Configuration Properties</h5>
                <DemoComponentApi
                    hideApiTitle
                    api={[
                        {
                            api: [
                                {
                                    propName: 'themeSchema',
                                    type: `<code>string</code>`,
                                    default: `<code>''</code>`,
                                    desc: 'Sets the color scheme of the template. you can leave this field empty if you are having dynamic theme in your app',
                                },
                                {
                                    propName: 'direction',
                                    type: `<code>'ltr'</code> | <code>'rtl'</code>`,
                                    default: `<code>'ltr'</code>`,
                                    desc: 'Defines the text direction for the template.',
                                },
                                {
                                    propName: 'mode',
                                    type: `<code>'light'</code> | <code>'dark'</code>`,
                                    default: `<code>'light'</code>`,
                                    desc: 'Toggles between Light and Dark mode.',
                                },
                                {
                                    propName: 'panelExpand',
                                    type: `<code>boolean</code>`,
                                    default: `<code>false</code>`,
                                    desc: 'Determines whether the side panel is expanded by default.',
                                },
                                {
                                    propName: 'controlSize',
                                    type: `<code>'xs'</code> | <code>'sm'</code> | <code>'md'</code> | <code>'lg'</code>`,
                                    default: `<code>'md'</code>`,
                                    desc: 'Sets the initial size of control inputs.',
                                },
                                {
                                    propName: 'layout.type',
                                    type: `<code>'blank'</code>  | <code>'collapsibleSide'</code> | <code>'stackedSide'</code> | <code>'topBarClassic'</code> | <code>'framelessSide'</code> | <code>'contentOverlay'</code>`,
                                    default: `<code>'modern'</code>`,
                                    desc: 'Defines the overall layout style of the application.',
                                },
                                {
                                    propName: 'layout.sideNavCollapse',
                                    type: `<code>boolean</code>`,
                                    default: `<code>false</code>`,
                                    desc: `Specifies whether the side navigation is collapsed. This option is only applicable when <code>type</code> is set to <code>'collapsibleSide'</code> or <code>'framelessSide'</code>.`,
                                },
                            ],
                        },
                    ]}
                />
            </div>
            <div className="mt-10" id="persistence">
                <h5>State Persistence</h5>
                <p>
                    We store the theme configuration in cookies, but it&apos;s
                    only saved there when the theme is changed using the{' '}
                    <code>useTheme</code> hook. By default, the theme
                    configuration is loaded from <code>theme.config.tsx</code>.
                </p>
            </div>
        </>
    )
}

export default Page

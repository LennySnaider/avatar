import SyntaxHighlighter from '@/components/shared/SyntaxHighlighter'
import CodeToggleTabs from '@/components/docs/DemoCard/CodeToggleTabs'

const Page = () => {
    return (
        <>
            <p>
                To initialize the app direction, simply set{' '}
                <code>direction</code> field as
                <code>&apos;ltr&apos;</code> or <code>&apos;rtl&apos;</code> in{' '}
                <code>src/configs/theme.config.ts</code>. For example:
            </p>
            <SyntaxHighlighter language="ts">{`export const themeConfig = {
	...
	direction: 'rtl'
}`}</SyntaxHighlighter>
            <div className="mt-10" id="hook">
                <h5>Hook</h5>
                <p className="mt-1">
                    You can access or update the direction in a component via
                    our prepared hook.
                </p>
                <CodeToggleTabs
                    languages={['tsx', 'jsx']}
                    tsMarkdown={`\`\`\`tsx
'use client'

import Button from '@/components/ui/Button'
import InputGroup from '@/components/ui/InputGroup'
import useTheme from '@/utils/hooks/useTheme'
import { THEME_ENUM } from '@/constants/theme.constant'
import type { Direction } from '@/@types/theme'

const dirList = [
    { value: THEME_ENUM.DIR_LTR, label: 'LTR' },
    { value: THEME_ENUM.DIR_RTL, label: 'RTL' },
]

const DirectionSwitcher = (props: {
    callBackClose?: () => void
}) => {

    const setDirection = useTheme((state) => state.setDirection)
    const direction = useTheme((state) => state.direction)

    const onDirChange = (val: Direction) => {
        setDirection(val)
    }

    return (
        <InputGroup size="sm">
            {dirList.map((dir) => (
                <Button
                    key={dir.value}
                    active={direction === dir.value}
                    onClick={() => onDirChange(dir.value)}
                >
                    {dir.label}
                </Button>
            ))}
        </InputGroup>
    )
}

export default DirectionSwitcher`}
                    jsMarkdown={`\`\`\`jsx
'use client'

import Button from '@/components/ui/Button'
import InputGroup from '@/components/ui/InputGroup'
import useTheme from '@/utils/hooks/useTheme'
import { THEME_ENUM } from '@/constants/theme.constant'

const dirList = [
    { value: THEME_ENUM.DIR_LTR, label: 'LTR' },
    { value: THEME_ENUM.DIR_RTL, label: 'RTL' },
]

const DirectionSwitcher = (props) => {

    const setDirection = useTheme((state) => state.setDirection)
    const direction = useTheme((state) => state.direction)

    const onDirChange = (val) => {
        setDirection(val)
    }

    return (
        <InputGroup size="sm">
            {dirList.map((dir) => (
                <Button
                    key={dir.value}
                    active={direction === dir.value}
                    onClick={() => onDirChange(dir.value)}
                >
                    {dir.label}
                </Button>
            ))}
        </InputGroup>
    )
}

export default DirectionSwitcher`}
                />
            </div>
        </>
    )
}

export default Page

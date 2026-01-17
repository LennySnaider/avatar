import SyntaxHighlighter from '@/components/shared/SyntaxHighlighter'

const Example = () => {
    return (
        <SyntaxHighlighter language="js">{`import useNavigation from '@/utils/hooks/useNavigation'

const Component = () => {

    const { navigationTree } = useNavigation()

	return (...)
}
`}</SyntaxHighlighter>
    )
}

export default Example

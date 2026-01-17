import SyntaxHighlighter from '@/components/shared/SyntaxHighlighter'

const Example = () => {
    return (
        <SyntaxHighlighter language="js">{`import useAppendQueryParams from '@/utils/hooks/useAppendQueryParams'

const Component = () => {

	const { onAppendQueryParams } = useAppendQueryParams()

	const handleInputChange = (query: string) => {
        onAppendQueryParams(
            {
                exampleParam: 'something',
				anotherParam: 'else',
            }
        )
    }

	return (...)
}
`}</SyntaxHighlighter>
    )
}

export default Example

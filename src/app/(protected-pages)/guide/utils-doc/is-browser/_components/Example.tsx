import SyntaxHighlighter from '@/components/shared/SyntaxHighlighter'

const Example = () => {
    return (
        <SyntaxHighlighter language="js">{`import isBrowser from '@/utils/isBrowser'

console.log(isBrowser)

// output: true in browser, false in server
`}</SyntaxHighlighter>
    )
}

export default Example

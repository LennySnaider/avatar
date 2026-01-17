import SyntaxHighlighter from '@/components/shared/SyntaxHighlighter'

const Example = () => {
    return (
        <SyntaxHighlighter language="js">{`import useCurrentSession from '@/utils/hooks/useCurrentSession'

const Component = () => {

	const { session } = useCurrentSession()

	// {
	// 	"expires": "2023-09-01T00:00:00.000Z",
	// 	"user": {
	// 		"email": "H2WtM@example.com",
	// 		"name": "John Doe",
	// 		"id": "1",
	// 		"image": "https://randomuser.me/api/portraits/lego/1.jpg",
	// 	}	
	// }
	console.log(session)

	return (...)
}
`}</SyntaxHighlighter>
    )
}

export default Example

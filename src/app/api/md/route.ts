import { NextResponse, NextRequest } from 'next/server'

const BASE_PATH =
    'https://storage.googleapis.com/www.themenate.net/markdown/ecme-next'

export async function GET(request: NextRequest) {
    const mdPath = request.nextUrl.searchParams.get('mdPath')
    const mdName = request.nextUrl.searchParams.get('mdName')
    const mdPrefixPath = request.nextUrl.searchParams.get('mdPrefixPath')
    const mdType = request.nextUrl.searchParams.get('mdType')

    try {
        const resp = await fetch(
            `${BASE_PATH}/${mdType}/${mdPrefixPath}/${mdPath}/${mdName}.md`,
        )

        const md = await resp.text()

        return NextResponse.json({ content: md })
    } catch (error) {
        console.log(error)
        return NextResponse.json(
            { error: 'Failed to get markdown' },
            { status: 500 },
        )
    }
}

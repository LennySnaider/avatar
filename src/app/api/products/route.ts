import { NextResponse, NextRequest } from 'next/server'
import getProducts from '@/server/actions/getProducts'

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams

    try {
        const response = await getProducts({
            pageIndex: searchParams.get('pageIndex') || undefined,
            pageSize: searchParams.get('pageSize') || undefined,
            sortKey: searchParams.get('sortKey') || undefined,
            order: searchParams.get('order') || undefined,
            query: searchParams.get('query') || undefined,
        })
        return NextResponse.json(response)
    } catch (error) {
        console.log(error)
        return NextResponse.json({ error: error }, { status: 500 })
    }
}

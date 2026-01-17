/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, NextRequest } from 'next/server'
import getLogs from '@/server/actions/getLogs'

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const activityIndex = searchParams.get('activityIndex') as any
    const filter = searchParams.get('filter') as any

    try {
        const response = await getLogs(activityIndex, filter)
        return NextResponse.json(response)
    } catch (error) {
        console.log(error)
        return NextResponse.json({ error: error }, { status: 500 })
    }
}

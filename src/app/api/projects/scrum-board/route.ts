import { NextResponse } from 'next/server'
import getScrumboardData from '@/server/actions/getScrumboardData'

export async function GET() {
    try {
        const scrumboardData = await getScrumboardData()

        return NextResponse.json(scrumboardData)
    } catch (error) {
        console.log(error)
        return NextResponse.json({ error: error }, { status: 500 })
    }
}

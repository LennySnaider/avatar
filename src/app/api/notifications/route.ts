import { NextResponse } from 'next/server'
import { notificationListData } from '@/mock/data/commonData'

export async function GET() {
    try {
        return NextResponse.json(notificationListData)
    } catch (error) {
        console.log(error)
        return NextResponse.json({ error: error }, { status: 500 })
    }
}

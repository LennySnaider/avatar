import { NextResponse } from 'next/server'
import { notificationListData } from '@/mock/data/commonData'

export async function GET() {
    try {
        const unreadNotification = notificationListData.filter(
            (notification) => !notification.readed,
        )
        return NextResponse.json({ count: unreadNotification.length })
    } catch (error) {
        console.log(error)
        return NextResponse.json({ error: error }, { status: 500 })
    }
}

import { NextResponse } from 'next/server'
import { notificationSettingsData } from '@/mock/data/accountsData'

export async function GET() {
    try {
        return NextResponse.json(notificationSettingsData)
    } catch (error) {
        console.log(error)
        return NextResponse.json({ error: error }, { status: 500 })
    }
}

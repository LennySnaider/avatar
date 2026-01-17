import { NextResponse } from 'next/server'
import { billingSettingsData } from '@/mock/data/accountsData'

export async function GET() {
    try {
        return NextResponse.json(billingSettingsData)
    } catch (error) {
        console.log(error)
        return NextResponse.json({ error: error }, { status: 500 })
    }
}

import { NextResponse } from 'next/server'
import { intergrationSettingData } from '@/mock/data/accountsData'

export async function GET() {
    try {
        return NextResponse.json(intergrationSettingData)
    } catch (error) {
        console.log(error)
        return NextResponse.json({ error: error }, { status: 500 })
    }
}

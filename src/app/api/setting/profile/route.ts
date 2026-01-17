import { NextResponse } from 'next/server'
import { profileData } from '@/mock/data/accountsData'

export async function GET() {
    try {
        return NextResponse.json(profileData)
    } catch (error) {
        console.log(error)
        return NextResponse.json({ error: error }, { status: 500 })
    }
}

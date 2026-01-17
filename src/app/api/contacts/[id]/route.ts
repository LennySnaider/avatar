import { NextResponse, NextRequest } from 'next/server'
import { userDetailData } from '@/mock/data/usersData'
import { groupsData } from '@/mock/data/chatData'

export async function GET(
    _: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const id = (await params).id

    console.log('contact id:', id)

    try {
        const groupsId = ['16', '17', '18']

        const userDetails = groupsId.includes(id || '')
            ? groupsData.find((user) => user.id === id)
            : userDetailData.find((user) => user.id === id)

        return NextResponse.json(userDetails)
    } catch (error) {
        console.log(error)
        return NextResponse.json({ error: error }, { status: 500 })
    }
}

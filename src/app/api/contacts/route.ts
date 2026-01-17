import { NextResponse } from 'next/server'
import { userDetailData } from '@/mock/data/usersData'

export async function GET() {
    try {
        const contactsId = ['4', '8', '6', '3', '2', '9']
        const contacts = userDetailData.filter(
            (user) => !contactsId.includes(user.id),
        )

        return NextResponse.json(contacts)
    } catch (error) {
        console.log(error)
        return NextResponse.json({ error: error }, { status: 500 })
    }
}

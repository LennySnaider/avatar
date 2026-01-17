import { NextRequest, NextResponse } from 'next/server'
import { imageData, generatedImageData } from '@/mock/data/aiData'
import sleep from '@/utils/sleep'

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams
        const index = parseInt(searchParams.get('index') || '0')
        const itemCount = parseInt(searchParams.get('itemCount') || '4')

        let loadable = true
        const maxGetItem = itemCount
        const count = (index - 1) * maxGetItem
        let images = imageData
        if (count >= images.length) {
            loadable = false
        }
        images = images.slice(count, index * maxGetItem)
        const response = {
            data: images,
            loadable,
        }

        return NextResponse.json(response)
    } catch (error) {
        console.log(error)
        return NextResponse.json({ error: error }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    const { prompt } = await req.json()

    const imageSet = generatedImageData[
        Math.floor(Math.random() * generatedImageData.length)
    ].map((img) => {
        img.prompt = prompt
        return img
    })

    await sleep(200)

    return NextResponse.json(imageSet)
}

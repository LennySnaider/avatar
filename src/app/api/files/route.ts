import { NextResponse, NextRequest } from 'next/server'
import { fileListData } from '@/mock/data/filesData'

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get('id')

    const directoryList = fileListData.filter(
        (file) => file.fileType === 'directory',
    )
    const directoryIdList = directoryList.map((directory) => directory.id)

    try {
        let list = fileListData
        let filesIncluded: string[] = []
        let directory: { id: string; label: string }[] = []

        if (directoryList.some((directory) => directory.id === id)) {
            switch (id) {
                case '6':
                    filesIncluded = ['2', '7', '8', '9', '15', '16']
                    break
                case '12':
                    filesIncluded = ['1', '2', '5']
                    break
                case '18':
                    filesIncluded = ['11', '13', '7', '4']
                    break
                case '19':
                    filesIncluded = ['15', '17', '3', '8', '7']
                    break
                case '20':
                    filesIncluded = ['3', '4', '10', '14']
                    break
                default:
                    break
            }
        }

        if (filesIncluded.length > 0) {
            list = fileListData.filter((file) =>
                filesIncluded.includes(file.id),
            )
            const dir = fileListData.find((file) => file.id === id)

            if (dir && directoryIdList.includes(id as string)) {
                directory = [{ id: dir.id, label: dir.name }]
            }
        }

        const resp = {
            list,
            directory: directory,
        }

        return NextResponse.json(resp)
    } catch (error) {
        console.log(error)
        return NextResponse.json({ error: error }, { status: 500 })
    }
}

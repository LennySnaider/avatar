import Generator from './_components/Generator'
import Gallery from './_components/Gallery'
import ImageDialog from './_components/ImageDialog'

export default function Page() {
    return (
        <>
            <Generator />
            <div className="mt-6">
                <Gallery />
            </div>
            <ImageDialog />
        </>
    )
}

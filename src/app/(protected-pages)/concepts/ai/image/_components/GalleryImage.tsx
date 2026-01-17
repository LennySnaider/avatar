'use client'

import type { GelleryItem } from '../type'

type GalleryImageProps = {
    galleryItem: GelleryItem
    onImageClick: (galleryItem: GelleryItem) => void
}

const GalleryImage = (props: GalleryImageProps) => {
    const { galleryItem, onImageClick } = props

    return (
        <div
            key={galleryItem.id}
            className="rounded-lg cursor-pointer relative group"
            onClick={() => onImageClick(galleryItem)}
        >
            <img
                className="rounded-xl w-full"
                src={galleryItem.image}
                alt={galleryItem.id}
            />
        </div>
    )
}

export default GalleryImage

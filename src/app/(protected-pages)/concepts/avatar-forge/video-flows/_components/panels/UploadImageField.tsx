'use client'

import { useRef } from 'react'
import { HiOutlineUpload, HiOutlineX } from 'react-icons/hi'

interface UploadImageValue {
    imageUrl?: string
    imageBase64?: string
    fileName?: string
}

interface UploadImageFieldProps {
    value: UploadImageValue
    onChange: (patch: Record<string, unknown>) => void
}

export default function UploadImageField({ value, onChange }: UploadImageFieldProps) {
    const inputRef = useRef<HTMLInputElement>(null)

    const handleFile = async (file: File) => {
        if (!file.type.startsWith('image/')) {
            console.warn('Selected file is not an image')
            return
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(file)
        })
        const base64 = dataUrl.split(',')[1] ?? ''
        onChange({
            imageUrl: dataUrl,
            imageBase64: base64,
            fileName: file.name,
        })
    }

    const handleClear = () => {
        onChange({ imageUrl: '', imageBase64: '', fileName: '' })
        if (inputRef.current) inputRef.current.value = ''
    }

    return (
        <div>
            <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">Image</span>
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFile(file)
                }}
            />
            {value.imageUrl ? (
                <div className="mt-0.5 relative bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded overflow-hidden">
                    <img
                        src={value.imageUrl}
                        alt={value.fileName ?? 'Uploaded'}
                        className="w-full max-h-40 object-contain"
                    />
                    <div className="flex items-center justify-between p-2 border-t border-gray-200 dark:border-gray-700">
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate flex-1">
                            {value.fileName ?? 'Image uploaded'}
                        </span>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => inputRef.current?.click()}
                                className="text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-1.5 py-0.5"
                            >
                                Replace
                            </button>
                            <button
                                type="button"
                                onClick={handleClear}
                                className="text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 p-0.5"
                                title="Remove"
                            >
                                <HiOutlineX className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="mt-0.5 w-full flex flex-col items-center justify-center gap-2 bg-gray-50 dark:bg-gray-900 border border-dashed border-gray-300 dark:border-gray-700 rounded px-2 py-6 hover:border-primary transition-colors"
                >
                    <HiOutlineUpload className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">Click to upload image</span>
                </button>
            )}
        </div>
    )
}

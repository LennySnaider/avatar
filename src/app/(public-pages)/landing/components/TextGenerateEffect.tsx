import { useState, useEffect } from 'react'
import classNames from '@/utils/classNames'

const TextGenerateEffect = ({
    words,
    className,
    wordClassName,
    filter = true,
    duration = 0.5,
    wordsCallbackClass,
}: {
    words: string
    className?: string
    wordClassName?: string
    filter?: boolean
    duration?: number
    wordsCallbackClass?: (payload: { word: string }) => string
}) => {
    const wordsArray = words.split(' ')
    const [isAnimated, setIsAnimated] = useState(false)

    useEffect(() => {
        const timer = setTimeout(() => setIsAnimated(true), 100)
        return () => clearTimeout(timer)
    }, [])

    const renderWords = () => {
        return (
            <div className={wordClassName}>
                {wordsArray.map((word, idx) => {
                    return (
                        <span
                            key={word + idx}
                            className={classNames(
                                wordsCallbackClass &&
                                    wordsCallbackClass({ word }),
                            )}
                            style={{
                                opacity: isAnimated ? 1 : 0,
                                filter: isAnimated ? 'blur(0px)' : (filter ? 'blur(10px)' : 'none'),
                                transition: `opacity ${duration}s ease-out ${idx * 0.075}s, filter ${duration}s ease-out ${idx * 0.075}s`,
                                display: 'inline-block',
                            }}
                        >
                            {word}{' '}
                        </span>
                    )
                })}
            </div>
        )
    }

    return (
        <div className={classNames('font-bold', className)}>
            <div className="mt-4">
                <div className=" dark:text-white text-black text-2xl leading-snug">
                    {renderWords()}
                </div>
            </div>
        </div>
    )
}

export default TextGenerateEffect

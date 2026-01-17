'use client'

import { useState, useEffect } from 'react'
import Button from '@/components/ui/Button'
import TextGenerateEffect from './TextGenerateEffect'
import { MODE_DARK, MODE_LIGHT } from '@/constants/theme.constant'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import type { Mode } from '@/@types/theme'

const HeroContent = ({ mode }: { mode: Mode }) => {
    const router = useRouter()
    const [isAnimated, setIsAnimated] = useState(false)

    useEffect(() => {
        const timer = setTimeout(() => setIsAnimated(true), 500)
        return () => clearTimeout(timer)
    }, [])

    const handlePreview = () => {
        router.push('/dashboards/ecommerce')
    }

    const handleGetTemplate = () => {
        window.open(
            'https://themeforest.net/item/ecme-nextjs-tailwind-admin-template-app-router/56475600',
            '_blank',
        )
    }

    return (
        <div className="max-w-7xl mx-auto px-4 flex min-h-screen flex-col items-center justify-between">
            <div className="flex flex-col min-h-screen pt-20 md:pt-40 relative overflow-hidden">
                <div>
                    <TextGenerateEffect
                        wordClassName="text-2xl md:text-4xl lg:text-8xl font-bold max-w-7xl mx-auto text-center mt-6 relative z-10"
                        words="Unlock Ultimate Control with the Perfect Template"
                        wordsCallbackClass={({ word }) => {
                            if (word === 'Perfect') {
                                return 'bg-gradient-to-r from-[#2feaa8] to-[#0eb9ce] bg-clip-text text-transparent'
                            }

                            if (word === 'Template') {
                                return 'bg-gradient-to-r from-[#02bcca] to-[#028cf3] bg-clip-text text-transparent'
                            }

                            return ''
                        }}
                    />
                    <p
                        className="text-center mt-6 text-base md:text-xl text-muted dark:text-muted-dark max-w-5xl mx-auto relative z-10 font-normal"
                        style={{
                            opacity: isAnimated ? 1 : 0,
                            transform: isAnimated ? 'translateY(0)' : 'translateY(40px)',
                            transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
                        }}
                    >
                        Experience a powerful, intuitive, and customizable admin
                        dashboard that adapts to your needs. Built for
                        developers, by developers, to simplify workflow
                        management and enhance user experiences.
                    </p>
                    <div
                        className="flex items-center gap-4 justify-center mt-10 relative z-10"
                        style={{
                            opacity: isAnimated ? 1 : 0,
                            transform: isAnimated ? 'translateY(0)' : 'translateY(40px)',
                            transition: 'opacity 0.3s ease-out 0.1s, transform 0.3s ease-out 0.1s',
                        }}
                    >
                        <Button variant="solid" onClick={handlePreview}>
                            Preview
                        </Button>
                        <Button onClick={handleGetTemplate}>
                            Get this template
                        </Button>
                    </div>
                </div>
                <div className="p-2 lg:p-4 border border-gray-200 bg-gray-50 dark:bg-gray-700 dark:border-gray-700 rounded-2xl lg:rounded-[32px] mt-20 relative">
                    <div className="absolute inset-x-0 bottom-0 h-40 w-full bg-gradient-to-b from-transparent via-white to-white dark:via-black/50 dark:to-black scale-[1.1] pointer-events-none" />
                    <div className="bg-white dark:bg-black dark:border-gray-700 border border-gray-200 rounded-[24px]">
                        {mode === MODE_LIGHT && (
                            <Image
                                className="rounded-2xl lg:rounded-[24px]"
                                src="/img/landing/hero/hero.webp"
                                width={1920}
                                height={1040}
                                alt="Ecme homepage"
                            />
                        )}
                        {mode === MODE_DARK && (
                            <Image
                                className="rounded-2xl lg:rounded-[24px]"
                                src="/img/landing/hero/hero-dark.webp"
                                width={1920}
                                height={1040}
                                alt="Ecme homepage"
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default HeroContent

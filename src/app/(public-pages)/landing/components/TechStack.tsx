import { useState } from 'react'
import Container from './LandingContainer'

const stackList = [
    {
        id: 'react',
        title: 'React',
        description:
            'A component-based JavaScript library for building user interfaces.',
    },
    {
        id: 'tailwind',
        title: 'TailwindCSS',
        description:
            'A utility-first CSS framework that allows for rapid, responsive design.',
    },
    {
        id: 'typescript',
        title: 'TypeScript',
        description:
            'Static typing for improved code quality and development efficiency.',
    },
    {
        id: 'nextjs',
        title: 'Next.js',
        description:
            'A React framework for building full-stack web applications.',
    },
    {
        id: 'react-hook-form',
        title: 'React Hook Form',
        description:
            'Efficient form management with minimal performance impact.',
    },
    {
        id: 'zod',
        title: 'Zod',
        description:
            'Schema validation made easy with TypeScript-first design.',
    },
    {
        id: 'zustand',
        title: 'Zustand',
        description:
            'A lightweight state management solution for managing complex application states.',
    },
    {
        id: 'next-auth',
        title: 'Auth.js',
        description:
            'Auth.js is a Web API-based library for simple, secure, and extensible authentication.',
    },
]

const TechStack = () => {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

    return (
        <div id="demos" className="relative z-20 py-10 md:py-40">
            <div className="text-center mb-12">
                <h2 className="my-6 text-5xl">
                    Core Technologies Powering
                </h2>
                <p className="mx-auto max-w-[600px]">
                    Ecme built using cutting-edge technologies to ensure
                    streamlined, scalability, and a seamless developer
                    experience.
                </p>
            </div>
            <Container>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                    {stackList.map((stack, index) => (
                        <div
                            key={stack.id}
                            className="relative p-4"
                            onMouseEnter={() => setHoveredIndex(index)}
                            onMouseLeave={() => setHoveredIndex(null)}
                        >
                            {hoveredIndex === index && (
                                <span
                                    className="absolute inset-0 h-full w-full bg-gray-100 dark:bg-zinc-800/[0.8] block rounded-3xl transition-opacity duration-150"
                                    style={{ opacity: 1 }}
                                />
                            )}
                            <div className="p-4 rounded-2xl z-10 relative bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 h-full group">
                                <div className="flex flex-col">
                                    <div className="w-16 h-16 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-600 group-hover:border-primary">
                                        <img
                                            className="max-h-8"
                                            src={`/img/landing/tech/${stack.id}.png`}
                                            alt={stack.title}
                                        />
                                    </div>
                                    <div className="mt-6">
                                        <h3 className="text-lg mb-2">
                                            {stack.title}
                                        </h3>
                                        <p className="text-muted dark:text-muted-dark">
                                            {stack.description}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </Container>
        </div>
    )
}

export default TechStack

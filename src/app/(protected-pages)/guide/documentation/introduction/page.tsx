const Page = () => {
    return (
        <>
            <div id="introduction" className="mb-8">
                <p>
                    Ecme is not just another web template—it&apos;s a
                    meticulously crafted masterpiece that stands out in a market
                    flooded with generic, poorly designed options. Every aspect
                    of Ecme, from its elegant UI to its robust code
                    architecture, has been thoughtfully designed to ensure
                    unparalleled flexibility and scalability for your projects.
                </p>
                <p>
                    Unlike other templates that rely on common open-source
                    libraries, Ecme features a comprehensive suite of
                    custom-built UI components. These components are not only
                    rich in functionality but also offer greater control,
                    allowing you to tailor every detail to meet your specific
                    needs.
                </p>
                <p>
                    Ecme is equipped with advanced features like multi-language
                    support, dark and light mode, right-to-left layout, theme
                    color customization, and the ability to switch seamlessly
                    between six pre-designed layouts. Whether you&apos;re
                    building a global platform or a niche application,
                    Ecme&apos;s versatility has you covered.
                </p>
                <p>
                    Moreover, the included application examples are grounded in
                    real-world use cases, giving you practical, ready-to-use
                    solutions for your projects. With Ecme, you&apos;re not just
                    buying a template—you&apos;re investing in a powerful,
                    flexible foundation for your web development success.
                </p>
            </div>
            <div id="coreLibrary">
                <h4>Core libraries used</h4>
                <p>Here&apos;s a list of the core libraries we use in Ecme</p>
                <div className="grid grid-cols-2 gap-4">
                    {[
                        {
                            id: 'react',
                            name: 'React',
                            img: '/img/thumbs/react.png',
                            src: 'https://reactjs.org/',
                            description:
                                'A popular JavaScript library for building user interfaces.',
                        },
                        {
                            id: 'nextjs',
                            name: 'Next.js',
                            img: '/img/thumbs/next.js.png',
                            src: 'https://nextjs.org/',
                            description: 'The React Framework for the Web',
                        },
                        {
                            id: 'typeScript',
                            name: 'TypeScript',
                            img: '/img/thumbs/typeScript.png',
                            src: 'https://www.typescriptlang.org/',
                            description:
                                'TypeScript is a strongly typed programming language that builds on JavaScript',
                        },
                        {
                            id: 'tailwind',
                            name: 'Tailwind Css',
                            img: '/img/thumbs/tailwind.png',
                            src: 'https://tailwindcss.com/',
                            description:
                                'A utility-first CSS framework packed with classes.',
                        },
                    ].map((feat) => (
                        <a
                            key={feat.id}
                            className="border-2 border-gray-200 dark:border-gray-700 hover:border-primary flex flex-col items-center justify-center py-4 rounded-xl gap-2 no-underline"
                            href={feat.src}
                            target="_blank"
                            rel="noreferrer"
                        >
                            <img
                                className="max-h-16"
                                src={feat.img}
                                alt={feat.name}
                            />
                            <div className="text-center">
                                <div className="heading-text font-bold">
                                    {feat.name}
                                </div>
                            </div>
                        </a>
                    ))}
                </div>
            </div>
        </>
    )
}

export default Page

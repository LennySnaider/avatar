import Container from './LandingContainer'
import RegionMap from '@/components/shared/RegionMap'
import { TbCircleCheck } from 'react-icons/tb'
import type { ReactNode } from 'react'

const mapMeta: Record<string, { img: string }> = {
    us: { img: '/img/countries/US.png' },
    cn: { img: '/img/countries/CN.png' },
    es: { img: '/img/countries/ES.png' },
    sa: { img: '/img/countries/SA.png' },
}

const data = [
    {
        id: 'us',
        name: 'United States',
        value: 38.61,
        coordinates: [-95.7129, 37.0902],
    },
    {
        id: 'es',
        name: 'India',
        value: 26.42,
        coordinates: [-51.9253, -14.235],
    },
    {
        id: 'cn',
        name: 'Brazil',
        value: 32.79,
        coordinates: [78.9629, 20.5937],
    },
    {
        id: 'sa',
        name: 'United Kingdom',
        value: 17.42,
        coordinates: [0.1278, 51.5074],
    },
]

const PointList = ({ children }: { children: ReactNode }) => {
    return (
        <div className="flex items-center gap-2">
            <TbCircleCheck className="text-xl" />
            <span>{children}</span>
        </div>
    )
}

const OtherFeatures = () => {
    return (
        <div id="otherFeatures" className="relative z-20 py-10 md:py-40">
            <Container>
                <div className="text-center mb-12">
                    <h2 className="my-6 text-5xl">
                        Tailored for Every Need
                    </h2>
                    <p className="mx-auto max-w-[600px]">
                        Built to adapt to any user or region, delivering
                        seamless performance across all devices and languages.
                    </p>
                </div>
                <div className="mt-20">
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-3xl py-12 px-10 lg:py-24 lg:px-16 overflow-hidden mb-10">
                        <div className="grid lg:grid-cols-2 gap-8 lg:gap-4">
                            <div>
                                <h3 className="text-4xl">Responsive Design</h3>
                                <p className="mt-6 max-w-[550px] text-lg">
                                    Your app will look stunning on all devices,
                                    from desktops to tablets to mobile phones.
                                    No need to worry about scaling—it&apos;s
                                    built to work flawlessly on every screen
                                    size.
                                </p>
                                <div className="mt-12 flex flex-col gap-4">
                                    <PointList>
                                        Automatically adjusts layouts for
                                        different screen resolutions.
                                    </PointList>
                                    <PointList>
                                        Optimized media queries for performance
                                        on smaller devices.
                                    </PointList>
                                    <PointList>
                                        Smooth transitions and fluid design for
                                        touch interactions.
                                    </PointList>
                                </div>
                            </div>
                            <div className="relative flex justify-center">
                                <div className="p-2 border border-gray-200 bg-gray-50 dark:bg-gray-700 dark:border-gray-700 rounded-[32px] max-w-[300px] lg:absolute lg:top-[-50px] transition-transform duration-300 hover:-translate-y-5">
                                    <div className="absolute inset-x-0 bottom-0 h-20 w-full bg-gradient-to-b from-transparent via-gray-100 to-gray-100 dark:via-zinc-800/70 dark:to-gray-800 scale-[1.1] pointer-events-none" />
                                    <div className="bg-white dark:bg-black dark:border-gray-700 border border-gray-200 rounded-[24px] overflow-hidden max-h-[450px]">
                                        <img
                                            src="/img/landing/features/mobile.png"
                                            alt="Mobile view"
                                            className="rounded-[24px]"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-3xl py-12 px-10 lg:py-24 lg:px-16 overflow-hidden mb-10">
                        <div className="grid lg:grid-cols-2 gap-8 lg:gap-4">
                            <div className="relative flex justify-center">
                                <div className="lg:absolute h-full w-full left-0 md:left-[-50px] scale-[1.1]">
                                    <RegionMap
                                        data={data}
                                        valueSuffix="%"
                                        hoverable={false}
                                        marker={(Marker) => (
                                            <>
                                                {data.map(
                                                    ({
                                                        name,
                                                        coordinates,
                                                        id,
                                                    }) => (
                                                        <Marker
                                                            key={name}
                                                            coordinates={
                                                                coordinates as [
                                                                    number,
                                                                    number,
                                                                ]
                                                            }
                                                            className="cursor-pointer group"
                                                        >
                                                            <image
                                                                className="shadow-lg transition-transform duration-200 hover:scale-110"
                                                                href={
                                                                    mapMeta[id]
                                                                        .img
                                                                }
                                                                height="80"
                                                                width="80"
                                                            />
                                                        </Marker>
                                                    ),
                                                )}
                                            </>
                                        )}
                                    />
                                </div>
                            </div>
                            <div>
                                <h3 className="text-4xl">
                                    Multilanguage Support
                                </h3>
                                <p className="mt-6 max-w-[550px] text-lg">
                                    Expand your reach with built-in multilingual
                                    support. Easily switch between languages and
                                    ensure a smooth experience for users around
                                    the globe.
                                </p>
                                <div className="mt-12 flex flex-col gap-4">
                                    <PointList>
                                        Quick and easy language switching from a
                                        dropdown.
                                    </PointList>
                                    <PointList>
                                        Supports all major languages and easily
                                        extensible to new ones.
                                    </PointList>
                                    <PointList>
                                        Integrated with{' '}
                                        <code>react-i18next</code> for seamless
                                        translations.
                                    </PointList>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-3xl py-12 px-10 lg:py-24 lg:px-16 overflow-hidden mb-10">
                        <div className="grid lg:grid-cols-2 gap-8 lg:gap-4">
                            <div>
                                <h3 className="text-4xl">RTL Layout Ready</h3>
                                <p className="mt-6 max-w-[550px] text-lg">
                                    Whether your users are in right-to-left
                                    regions or left-to-right, our layout options
                                    have you covered. Effortlessly switch to RTL
                                    for languages like Arabic or Hebrew.
                                </p>
                                <div className="mt-12 flex flex-col gap-4">
                                    <PointList>
                                        Instant RTL conversion with a single
                                        setting change.
                                    </PointList>
                                    <PointList>
                                        Fully tested for visual consistency and
                                        readability.
                                    </PointList>
                                    <PointList>
                                        Works across all components, ensuring
                                        uniform user experience.
                                    </PointList>
                                </div>
                            </div>
                            <div className="relative flex justify-center">
                                <div className="relative flex justify-center w-full transition-transform duration-300 hover:-translate-y-5">
                                    <div className="p-4 border border-gray-200 bg-gray-50 dark:bg-gray-700 dark:border-gray-700 rounded-[32px] max-w-[550px] lg:absolute ">
                                        <div className="absolute inset-x-0 bottom-0 h-20 w-full bg-gradient-to-b from-transparent via-gray-100 to-gray-100 dark:via-zinc-800/50 dark:to-gray-800 scale-[1.1] pointer-events-none" />
                                        <div className="bg-white dark:border-gray-700 border border-gray-200 rounded-[24px] overflow-hidden p-2">
                                            <img
                                                src="/img/landing/features/rtl.png"
                                                alt="App screenshot"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Container>
        </div>
    )
}

export default OtherFeatures

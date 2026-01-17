import Container from '@/components/shared/Container'
import type { ReactNode } from 'react'

type Log = {
    version: string
    date: string
    updateContent: string[]
}

type LogProps = Omit<Log, 'updateContent'> & {
    border?: boolean
    children?: ReactNode
}

const logData: Log[] = [
    {
        version: '1.2.6',
        date: '30 Sep 2025',
        updateContent: [
            `[Fixed] Next auth config extensibility issues`,
            `[Fixed] npm dependencies vulnerability.`,
        ],
    },
    {
        version: '1.2.5',
        date: '29 Sep 2025',
        updateContent: [
            `[Fixed] Slider incorrectly working in rtl.`,
            `[Fixed] SideNav menu border incorrectly aligned in rtl.`,
            `[Fixed] Landing page side nav closed imedietely after opening in mobile view.`,
            `[Fixed] AI chat history gets cleared when closing the history panel in mobile view.`,
            `[Added] 'lockView' prop to Datepicker & Calendar component to prevent view switching.`,
        ],
    },
    {
        version: '1.2.4',
        date: '29 Aug 2025',
        updateContent: [
            `[Fixed] Deprecated zod usage.`,
            `[Fixed] Redundant ZodType explicit declaration.`,
            `[Updated] various dependencies to their latest versions.`,
            `[Updated] @hookform/resolvers to 5.2.1`,
            `[Updated] zod to 4.1.1`,
        ],
    },
    {
        version: '1.2.3',
        date: '23 Jul 2025',
        updateContent: [
            `[Fixed] BottomStickyBar not working in OrderForm component.`,
            `[Fixed] StackedSideNavSecondary scroll bar not working.`,
            `[Updated] various dependencies to their latest versions.`,
        ],
    },
    {
        version: '1.2.2',
        date: '25 Jun 2025',
        updateContent: [
            `[Added] Indeterminate prop to Checkbox component.`,
        ],
    },
    {
        version: '1.2.1',
        date: '22 May 2025',
        updateContent: [
            `[Fixed] Missing no notification image`,
            `[Fixed] Input textarea size issues`,
            `[Added] Slider component`,
        ],
    },
    {
        version: '1.2.0',
        date: '27 Apr 2025',
        updateContent: [
            `[Fixed] Z-index ordering issues bewteen components Dialog, Drawer, Select & Header`,
            `[Fixed] pauseOnHover prop not working in InfiniteMovingCards component`,
            `[Fixed] Missing constant in Search.tsx component`,
            `[Updated] Eslint to latest version`,
            `[Updated] next-intl to latest versions`,
            `[Updated] Next.js to latest versions`,
        ],
    },
    {
        version: '1.1.2',
        date: '03 Apr 2025',
        updateContent: [
            `[Added] JavaScript version of the template`,
            `[Fixed] Checkbox disabled hover style issues`,
            `[Fixed] Form inline alignment issues`,
            `[Fixed] Datepicker component not closing automatically issues`,
            `[Fixed] Switcher class override issues`,
            `[Updated] Next.js to latest versions`,
        ],
    },
    {
        version: '1.1.1',
        date: '10 Mar 2025',
        updateContent: [
            `[Added] Landing page.`,
            `[Fixed] Datepicker component focus styling issues`,
            `[Fixed] Select component input contrast issues`,
            `[Updated] Various dependencies to their latest versions.`,
        ],
    },
    {
        version: '1.1.0',
        date: '23 Feb 2025',
        updateContent: [
            `[Updated] Tailwind to version 4.`,
            `[Updated] Various dependencies to their latest versions.`,
            `[Changes] Applied layers to existing CSS.`,
            `[Fixed] Minor styling issues`,
        ],
    },
    {
        version: '1.0.1',
        date: '10 Feb 2025',
        updateContent: [`[Fixed] Application crash on mobile view`],
    },
    {
        version: '1.0.0',
        date: '02 Feb 2025',
        updateContent: ['[Release] Initial Release.'],
    },
]

const Log = (props: LogProps) => {
    return (
        <div className={`py-4 ${props.border && 'border-bottom'}`}>
            <div className="flex items-center">
                <h5 className="font-weight-normal mb-0 mr-3">
                    {props.version}
                </h5>
                <code>{props.date}</code>
            </div>
            <div className="api-container p-0 border-0 mt-3">
                {props.children}
            </div>
        </div>
    )
}

const Page = () => {
    return (
        <Container>
            <div>
                <h4>Changelog</h4>
                {logData.map((elm) => (
                    <Log
                        key={elm.version}
                        version={`v${elm.version}`}
                        date={elm.date}
                    >
                        {elm.updateContent.length > 0 ? (
                            <ul>
                                {elm.updateContent.map((item, i) => (
                                    <li key={i}>- {item}</li>
                                ))}
                            </ul>
                        ) : null}
                    </Log>
                ))}
            </div>
        </Container>
    )
}

export default Page

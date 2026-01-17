import ThemeConfigurator from '@/components/template/ThemeConfigurator'

export type SidePanelContentProps = {
    callBackClose?: () => void
}

const SidePanelContent = (props: SidePanelContentProps) => {
    return <ThemeConfigurator {...props} />
}

export default SidePanelContent

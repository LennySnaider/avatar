import SyntaxHighlighter from '@/components/shared/SyntaxHighlighter'

const Example = () => {
    return (
        <SyntaxHighlighter language="js">{`'use client'
            
import useTheme from '@/hooks/useTheme'
import { MODE_DARK, MODE_LIGHT } from '@/constants/theme.constant'
import { Direction, LayoutType } from '@/@types/theme'

const Component = () => {

    const {
        mode,
        direction,
        layout,
        setMode,
        setDirection,
        setLayout,
        setSideNavCollapse,
        setPanelExpand,
    } = useTheme((state) => ({
        mode: state.mode,
        direction: state.direction,
        layout: state.layout.type,
        setMode: state.setMode,
        setDirection: state.setDirection,
        setLayout: state.setLayout,
        setSideNavCollapse: state.setSideNavCollapse,
        setPanelExpand: state.setPanelExpand,
    }));

    const toggleThemeMode = () => {
        setMode(mode === MODE_LIGHT ? MODE_DARK : MODE_LIGHT);
    };

    const toggleDirection = () => {
        setDirection(direction === 'ltr' ? 'rtl' : 'ltr');
    };

    const changeLayout = (layoutType: LayoutType) => {
        setLayout(layoutType);
    };

    const toggleSideNav = () => {
        setSideNavCollapse(true); // Collapse the side navigation
    };

    const togglePanelExpand = () => {
        setPanelExpand(true); // Expand the panel
    };

	return (...)
}
`}</SyntaxHighlighter>
    )
}

export default Example

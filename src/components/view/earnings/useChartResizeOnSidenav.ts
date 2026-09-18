'use client'

import { useEffect, useRef } from 'react'
import useTheme from '@/utils/hooks/useTheme'

/**
 * ApexCharts mide su contenedor una vez; cuando el menú lateral se pliega o
 * despliega el ancho cambia y la gráfica se queda con la medida vieja. La
 * plantilla (dashboards/ecommerce/Overview.tsx) dispara un `resize` en el
 * momento del cambio, pero la transición del sidenav dura 200 ms
 * (`_side-nav.css`), así que aquí se espera a que termine.
 */
export default function useChartResizeOnSidenav() {
    const sideNavCollapse = useTheme((state) => state.layout.sideNavCollapse)
    const isFirstRender = useRef(true)

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false
            return
        }
        const timer = window.setTimeout(() => {
            window.dispatchEvent(new Event('resize'))
        }, 220)
        return () => window.clearTimeout(timer)
    }, [sideNavCollapse])
}

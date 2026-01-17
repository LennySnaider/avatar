import { useState, useEffect } from 'react'
import classNames from 'classnames'
import Modal from 'react-modal'
import CloseButton from '../CloseButton'
import type ReactModal from 'react-modal'
import type { MouseEvent, ReactNode } from 'react'

export interface DrawerProps extends ReactModal.Props {
    bodyClass?: string
    closable?: boolean
    footer?: string | ReactNode
    footerClass?: string
    headerClass?: string
    height?: string | number
    lockScroll?: boolean
    onClose?: (e: MouseEvent<HTMLSpanElement>) => void
    placement?: 'top' | 'right' | 'bottom' | 'left'
    showBackdrop?: boolean
    title?: string | ReactNode
    width?: string | number
}

const Drawer = (props: DrawerProps) => {
    const [isAnimated, setIsAnimated] = useState(false)

    const {
        bodyOpenClassName,
        bodyClass,
        children,
        className,
        closable = true,
        closeTimeoutMS = 300,
        footer,
        footerClass,
        headerClass,
        height = 400,
        isOpen,
        lockScroll = true,
        onClose,
        overlayClassName,
        placement = 'right',
        portalClassName,
        showBackdrop = true,
        title,
        width = 400,
        ...rest
    } = props

    // Trigger animation after mount
    useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => setIsAnimated(true), 10)
            return () => clearTimeout(timer)
        } else {
            setIsAnimated(false)
        }
    }, [isOpen])

    const onCloseClick = (e: MouseEvent<HTMLSpanElement>) => {
        onClose?.(e)
    }

    const renderCloseButton = <CloseButton onClick={onCloseClick} />

    const getStyle = (): {
        dimensionClass?: string
        contentStyle?: {
            width?: string | number
            height?: string | number
        }
        closedPosition: string
    } => {
        if (placement === 'left' || placement === 'right') {
            const offset = `-${width}${typeof width === 'number' ? 'px' : ''}`
            return {
                dimensionClass: 'vertical',
                contentStyle: { width },
                closedPosition: offset,
            }
        }

        if (placement === 'top' || placement === 'bottom') {
            const offset = `-${height}${typeof height === 'number' ? 'px' : ''}`
            return {
                dimensionClass: 'horizontal',
                contentStyle: { height },
                closedPosition: offset,
            }
        }

        return {
            closedPosition: '0',
        }
    }

    const { dimensionClass, contentStyle, closedPosition } = getStyle()

    // Build animation style based on placement
    const animationStyle: Record<string, string | number> = {
        [placement]: isAnimated ? 0 : closedPosition,
        transition: `${placement} 0.3s ease-out`,
    }

    return (
        <Modal
            className={{
                base: classNames('drawer', className as string),
                afterOpen: 'drawer-after-open',
                beforeClose: 'drawer-before-close',
            }}
            overlayClassName={{
                base: classNames(
                    'drawer-overlay',
                    overlayClassName as string,
                    !showBackdrop && 'bg-transparent',
                ),
                afterOpen: 'drawer-overlay-after-open',
                beforeClose: 'drawer-overlay-before-close',
            }}
            portalClassName={classNames('drawer-portal', portalClassName)}
            bodyOpenClassName={classNames(
                'drawer-open',
                lockScroll && 'drawer-lock-scroll',
                bodyOpenClassName,
            )}
            ariaHideApp={false}
            isOpen={isOpen}
            closeTimeoutMS={closeTimeoutMS}
            {...rest}
        >
            <div
                className={classNames('drawer-content', dimensionClass)}
                style={{ ...contentStyle, ...animationStyle }}
            >
                {title || closable ? (
                    <div className={classNames('drawer-header', headerClass)}>
                        {typeof title === 'string' ? (
                            <h4>{title}</h4>
                        ) : (
                            <span>{title}</span>
                        )}
                        {closable && renderCloseButton}
                    </div>
                ) : null}
                <div className={classNames('drawer-body', bodyClass)}>
                    {children}
                </div>
                {footer && (
                    <div className={classNames('drawer-footer', footerClass)}>
                        {footer}
                    </div>
                )}
            </div>
        </Modal>
    )
}

Drawer.displayName = 'Drawer'

export default Drawer

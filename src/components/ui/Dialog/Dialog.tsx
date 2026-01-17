import { useState, useEffect } from 'react'
import Modal from 'react-modal'
import classNames from 'classnames'
import CloseButton from '../CloseButton'
import useWindowSize from '../hooks/useWindowSize'
import type ReactModal from 'react-modal'
import type { MouseEvent } from 'react'

export interface DialogProps extends ReactModal.Props {
    closable?: boolean
    contentClassName?: string
    height?: string | number
    onClose?: (e: MouseEvent<HTMLSpanElement>) => void
    width?: number
}

const Dialog = (props: DialogProps) => {
    const currentSize = useWindowSize()
    const [isAnimated, setIsAnimated] = useState(false)

    const {
        bodyOpenClassName,
        children,
        className,
        closable = true,
        closeTimeoutMS = 150,
        contentClassName,
        height,
        isOpen,
        onClose,
        overlayClassName,
        portalClassName,
        style,
        width = 520,
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

    const renderCloseButton = (
        <CloseButton
            absolute
            className="ltr:right-6 rtl:left-6 top-4.5"
            onClick={onCloseClick}
        />
    )

    const contentStyle = {
        content: {
            inset: 'unset',
        },
        ...style,
    }

    if (width !== undefined) {
        contentStyle.content.width = width

        if (
            typeof currentSize.width !== 'undefined' &&
            currentSize.width <= width
        ) {
            contentStyle.content.width = 'auto'
        }
    }

    if (height !== undefined) {
        contentStyle.content.height = height
    }

    const defaultDialogContentClass = 'dialog-content'

    const dialogClass = classNames(defaultDialogContentClass, contentClassName)

    return (
        <Modal
            className={{
                base: classNames('dialog', className as string),
                afterOpen: 'dialog-after-open',
                beforeClose: 'dialog-before-close',
            }}
            overlayClassName={{
                base: classNames('dialog-overlay', overlayClassName as string),
                afterOpen: 'dialog-overlay-after-open',
                beforeClose: 'dialog-overlay-before-close',
            }}
            portalClassName={classNames('dialog-portal', portalClassName)}
            bodyOpenClassName={classNames('dialog-open', bodyOpenClassName)}
            ariaHideApp={false}
            isOpen={isOpen}
            style={{ ...contentStyle }}
            closeTimeoutMS={closeTimeoutMS}
            {...rest}
        >
            <div
                className={dialogClass}
                style={{
                    transform: isAnimated ? 'scale(1)' : 'scale(0.9)',
                    transition: 'transform 0.15s ease-out',
                }}
            >
                {closable && renderCloseButton}
                {children}
            </div>
        </Modal>
    )
}

Dialog.displayName = 'Dialog'

export default Dialog

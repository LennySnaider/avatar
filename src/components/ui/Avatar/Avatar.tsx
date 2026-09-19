import { useState, useEffect, useRef } from 'react'
import useMergedRef from '../hooks/useMergeRef'
import classNames from 'classnames'
import type { CommonProps, TypeAttributes } from '../@types/common'
import type { ReactNode, Ref } from 'react'

export interface AvatarProps extends CommonProps {
    alt?: string
    icon?: ReactNode
    onClick?: () => void
    ref?: Ref<HTMLSpanElement>
    size?: 'lg' | 'md' | 'sm' | number
    shape?: Exclude<TypeAttributes.Shape, 'none'> | 'square'
    src?: string
    srcSet?: string
    /**
     * Modo CORS del `<img>` interno. Pásalo como 'anonymous' cuando `src` sea
     * una URL de nuestro R2 que TAMBIÉN se pide con `crossOrigin` en otro
     * sitio (caras de avatar en `getReferenceMediaUrl`): R2 no manda `Vary:
     * Origin` en la respuesta sin CORS y la cachea `immutable` un año, así que
     * un `<img>` sin modo envenena la entrada y el `<img crossOrigin>` de la
     * lista de avatares la rechaza (2026-09-19, caras en blanco tras entrar
     * en los dashboards de ingresos). Ver CORS_CACHE_ESCAPE en storagePaths.
     */
    crossOrigin?: 'anonymous' | 'use-credentials'
}

const Avatar = (props: AvatarProps) => {
    const {
        alt,
        className,
        icon,
        ref = null,
        shape = 'circle',
        size = 'md',
        src,
        srcSet,
        crossOrigin,
        ...rest
    } = props

    let { children } = props
    const [scale, setScale] = useState(1)

    const avatarChildren = useRef<HTMLSpanElement>(null)
    const avatarNode = useRef<HTMLSpanElement>(null)

    const avatarMergeRef = useMergedRef(ref, avatarNode)

    const innerScale = () => {
        if (!avatarChildren.current || !avatarNode.current) {
            return
        }
        const avatarChildrenWidth = avatarChildren.current.offsetWidth
        const avatarNodeWidth = avatarNode.current.offsetWidth
        if (avatarChildrenWidth === 0 || avatarNodeWidth === 0) {
            return
        }
        setScale(
            avatarNodeWidth - 8 < avatarChildrenWidth
                ? (avatarNodeWidth - 8) / avatarChildrenWidth
                : 1,
        )
    }

    useEffect(() => {
        innerScale()
    }, [scale, children])

    const sizeStyle =
        typeof size === 'number'
            ? {
                  width: size,
                  height: size,
                  minWidth: size,
                  lineHeight: `${size}px`,
                  fontSize: icon ? size / 2 : 12,
              }
            : {}

    const classes = classNames(
        'avatar',
        `avatar-${shape}`,
        typeof size === 'string' ? `avatar-${size}` : '',
        className,
    )

    if (src) {
        children = (
            <img
                className={`avatar-img avatar-${shape}`}
                src={src}
                srcSet={srcSet}
                alt={alt}
                loading="lazy"
                crossOrigin={crossOrigin}
            />
        )
    } else if (icon) {
        children = (
            <span className={classNames('avatar-icon', `avatar-icon-${size}`)}>
                {icon}
            </span>
        )
    } else {
        const childrenSizeStyle =
            typeof size === 'number' ? { lineHeight: `${size}px` } : {}
        const stringCentralized = {
            transform: `translateX(-50%) scale(${scale})`,
        }
        children = (
            <span
                ref={avatarChildren}
                className={`avatar-string ${
                    typeof size === 'number' ? '' : `avatar-inner-${size}`
                }`}
                style={{
                    ...childrenSizeStyle,
                    ...stringCentralized,
                    ...(typeof size === 'number' ? { height: size } : {}),
                }}
            >
                {children}
            </span>
        )
    }

    return (
        <span
            ref={avatarMergeRef}
            className={classes}
            style={{ ...sizeStyle, ...rest.style }}
            {...rest}
        >
            {children}
        </span>
    )
}

export default Avatar

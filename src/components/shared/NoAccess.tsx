'use client'

/**
 * Pantalla de "tu rol no puede entrar aquí", para el gate por rama de rutas
 * (ver `src/lib/org/pageGuard.ts` y los `layout.tsx` que lo usan).
 *
 * Nunca un 404 a propósito, igual que `ModuleNotInstalled`: la ruta existe y
 * lo útil es decir qué hace falta.
 *
 * UN SOLO FICHERO, marcado cliente. `ModuleNotInstalled` está partido en dos
 * porque su padre es `async` (consulta el catálogo) y un Server Component de
 * verdad no puede importar `Button`. Este componente NO consulta nada, así que
 * no hereda ese problema — no lo partas por imitación.
 */
import Link from 'next/link'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { ACTION_LABEL } from '@/lib/org/guards'
import type { Permission } from '@/lib/org/permissions'

interface NoAccessProps {
    permission: Permission
    /** Adónde volver. Por defecto, la lista de avatares. */
    backHref?: string
}

export default function NoAccess({
    permission,
    backHref = '/concepts/avatar-forge/avatar-list',
}: NoAccessProps) {
    return (
        <div className="flex justify-center p-6">
            <Card className="max-w-xl">
                <h4 className="mb-2">
                    Esta sección no está disponible para tu rol
                </h4>
                <p className="mb-4">
                    Aquí se puede {ACTION_LABEL[permission]}, y eso queda para
                    un administrador o el propietario de la organización. Si lo
                    necesitas, pídeselo a uno de ellos.
                </p>
                <Link href={backHref}>
                    <Button variant="solid">Volver</Button>
                </Link>
            </Card>
        </div>
    )
}

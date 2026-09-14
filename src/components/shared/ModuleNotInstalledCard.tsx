'use client'

/**
 * La parte VISUAL de `ModuleNotInstalled`. Está separada y marcada como
 * cliente por una razón concreta, no por gusto:
 *
 * `ModuleNotInstalled` es `async` (consulta el catálogo), así que Next lo
 * trata como Server Component de verdad. E importar `Button` desde un Server
 * Component rompe la compilación: `src/components/ui/Button/index.tsx` no
 * lleva `'use client'` (a diferencia de `Card`, `Alert` y `Tabs`, que sí lo
 * llevan), de modo que arrastra `ConfigProvider.ts` —y su `createContext`—
 * al grafo de servidor.
 *
 * Los otros ~70 ficheros del repo que importan `Button` sin marca no fallan
 * porque siempre los renderiza alguien que ya es cliente: un fichero sin
 * directiva no es servidor, es indeterminado. El nuestro sí lo es, por ser
 * asíncrono.
 *
 * Arreglar `Button/index.tsx` sería la corrección de raíz, pero cambia el
 * empaquetado de esos 70 consumidores y no se puede validar sin compilar.
 * Esta separación resuelve el caso sin tocar infraestructura compartida.
 */
import Link from 'next/link'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

interface ModuleNotInstalledCardProps {
    title: string
    suspended: boolean
    /** Línea de precios; ausente si el módulo no está en el catálogo. */
    pricing?: string
}

const ModuleNotInstalledCard = ({
    title,
    suspended,
    pricing,
}: ModuleNotInstalledCardProps) => {
    const href = suspended
        ? '/concepts/account/settings?tab=billing'
        : '/concepts/account/modules'

    return (
        <div className="flex justify-center p-6">
            <Card className="max-w-xl">
                <h4>{title}</h4>
                <p className="mt-2">
                    {suspended
                        ? 'Este módulo está suspendido. Revisa tu saldo para reactivarlo.'
                        : 'Este módulo no está instalado en tu organización.'}
                </p>
                {pricing && <p className="mt-2">{pricing}</p>}
                <div className="mt-4">
                    <Link href={href}>
                        {/* `asElement="div"` evita anidar un <button> dentro de un <a>. */}
                        <Button asElement="div" variant="solid">
                            {suspended ? 'Ver saldo' : 'Ir a Módulos'}
                        </Button>
                    </Link>
                </div>
            </Card>
        </div>
    )
}

export default ModuleNotInstalledCard

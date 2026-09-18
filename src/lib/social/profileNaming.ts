/**
 * Nombres de los perfiles (sub-users) que esta app crea en la cuenta agencia
 * de Upload-Post. Fichero PURO (sin IO) para poder testearlo y para que lo
 * importe cualquiera sin arrastrar el cliente HTTP de `provider.ts`.
 */

/**
 * Nombre determinista para el perfil de un avatar, p.ej. MiaUltra →
 * `miaultra-3d2bfe4e`. Determinista a propósito: "Create profile" es
 * idempotente (si el perfil ya existe en Upload-Post se reutiliza) y una fila
 * legacy con otro nombre (`prime-avatar`) se renombra a este.
 */
export function deriveUploadPostUsername(avatar: { id: string; name: string }): string {
    const slug =
        avatar.name
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 24) || 'avatar'
    return `${slug}-${avatar.id.slice(0, 8)}`
}

/**
 * ¿Este username lo creó esta app (`slug-<8 hex del id del avatar>`)? La
 * cuenta agencia la comparten otros proyectos de la plataforma (hoy
 * `SalesBot`, `lennys-pizza-pilot`): sus perfiles se listan como libres, pero
 * la UI los marca "external" para que nadie publique por las redes de otro
 * proyecto por error.
 */
export function isAppManagedUsername(username: string): boolean {
    return /^[a-z0-9-]+-[0-9a-f]{8}$/.test(username)
}

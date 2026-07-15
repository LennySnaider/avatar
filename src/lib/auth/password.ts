import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'

// promisify() drops the options overload — wrap manually.
const scrypt = (
    password: string,
    salt: Buffer,
    keylen: number,
    opts: ScryptOptions,
): Promise<Buffer> =>
    new Promise((resolve, reject) => {
        scryptCb(password, salt, keylen, opts, (err, key) =>
            err ? reject(err) : resolve(key),
        )
    })

/**
 * Password hashing with Node's built-in scrypt — no native/npm dependency.
 * Stored format: `scrypt$N$r$p$<salt b64>$<hash b64>` so parameters can be
 * raised later without invalidating existing hashes.
 */
const N = 16384
const R = 8
const P = 1
const KEYLEN = 64

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16)
    const hash = await scrypt(password, salt, KEYLEN, { N, r: R, p: P })
    return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`
}

export async function verifyPassword(
    password: string,
    stored: string,
): Promise<boolean> {
    try {
        const [scheme, n, r, p, saltB64, hashB64] = stored.split('$')
        if (scheme !== 'scrypt') return false
        const salt = Buffer.from(saltB64, 'base64')
        const expected = Buffer.from(hashB64, 'base64')
        const actual = await scrypt(password, salt, expected.length, {
            N: Number(n),
            r: Number(r),
            p: Number(p),
        })
        return timingSafeEqual(actual, expected)
    } catch {
        return false
    }
}

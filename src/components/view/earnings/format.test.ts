// src/components/view/earnings/format.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    formatBucketLabel,
    formatBucketRange,
    formatCompact,
    formatDeltaPct,
    formatRelativeTime,
    formatStars,
    formatUsdCents,
    formatUsdCompact,
} from './format.ts'

test('formatUsdCents redondea centavos y respeta negativos', () => {
    assert.equal(formatUsdCents(123456), '$1,234.56')
    assert.equal(formatUsdCents(0), '$0.00')
    assert.equal(formatUsdCents(-1200), '-$12.00')
    assert.equal(formatUsdCents(99.6), '$1.00')
})

test('formatUsdCompact abrevia a partir de mil dólares', () => {
    assert.equal(formatUsdCompact(99900), '$999.00')
    assert.equal(formatUsdCompact(123456), '$1.2K')
    assert.equal(formatUsdCompact(250000000), '$2.5M')
})

test('formatStars usa el glifo y separador de miles en-US', () => {
    assert.equal(formatStars(1234), '⭐ 1,234')
    assert.equal(formatStars(0), '⭐ 0')
})

test('formatCompact', () => {
    assert.equal(formatCompact(999), '999')
    assert.equal(formatCompact(15300), '15.3K')
})

test('formatDeltaPct: null → —, 0 → 0%, resto con signo', () => {
    assert.equal(formatDeltaPct(null), '—')
    assert.equal(formatDeltaPct(0), '0%')
    assert.equal(formatDeltaPct(12.5), '+12.5%')
    assert.equal(formatDeltaPct(-3), '-3%')
})

test('etiquetas de bucket en español y en UTC', () => {
    assert.match(formatBucketLabel('2026-09-03', 'day'), /^3 sept/)
    assert.match(formatBucketLabel('2026-09-03', 'week'), /^3 sept/)
    assert.match(formatBucketLabel('2026-09-01', 'month'), /sept/)
    assert.match(
        formatBucketRange('2026-09-03', 'week'),
        /3 sept.*9 sept.*2026/,
    )
    assert.match(formatBucketRange('2026-09-01', 'month'), /septiembre.*2026/)
    assert.equal(formatBucketLabel('', 'day'), '')
})

test('formatRelativeTime', () => {
    const now = Date.parse('2026-09-17T12:00:00.000Z')
    assert.equal(formatRelativeTime(null, now), 'nunca')
    assert.equal(
        formatRelativeTime('2026-09-17T11:59:40.000Z', now),
        'hace un momento',
    )
    assert.match(formatRelativeTime('2026-09-17T11:48:00.000Z', now), /12 min/)
    assert.match(formatRelativeTime('2026-09-17T09:00:00.000Z', now), /3 h/)
    assert.equal(formatRelativeTime('2026-09-16T12:00:00.000Z', now), 'ayer')
})

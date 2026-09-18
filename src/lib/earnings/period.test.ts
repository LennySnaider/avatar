// src/lib/earnings/period.test.ts
import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import {
    addDaysIso,
    alignPrevious,
    bucketFor,
    bucketSeries,
    daysBetween,
    emptyPoint,
    enumerateDays,
    isEarningsPreset,
    pctChange,
    resolvePeriod,
    sumPoints,
    toDensePoints,
    utcToday,
    type EarningsPreset,
} from './period.ts'

const NOW = new Date('2026-09-17T15:00:00.000Z')

test('utcToday a las 23:30Z no salta al día siguiente', () => {
    assert.equal(utcToday(new Date('2026-09-17T23:30:00.000Z')), '2026-09-17')
})

test('utcToday sin argumento usa el reloj (mock.timers)', () => {
    mock.timers.enable({
        apis: ['Date'],
        now: Date.parse('2027-01-15T12:00:00.000Z'),
    })
    try {
        assert.equal(utcToday(), '2027-01-15')
    } finally {
        mock.timers.reset()
    }
})

test('addDaysIso y daysBetween cruzan mes y año', () => {
    assert.equal(addDaysIso('2026-12-31', 1), '2027-01-01')
    assert.equal(addDaysIso('2027-01-01', -1), '2026-12-31')
    assert.equal(daysBetween('2026-09-17', '2026-09-17'), 1)
    assert.equal(daysBetween('2026-12-25', '2027-01-03'), 10)
})

test('enumerateDays cubre febrero bisiesto entero', () => {
    const days = enumerateDays('2028-02-27', '2028-03-01')
    assert.deepEqual(days, [
        '2028-02-27',
        '2028-02-28',
        '2028-02-29',
        '2028-03-01',
    ])
})

test('7d: últimos 7 días incluyendo hoy, contra los 7 anteriores', () => {
    const w = resolvePeriod('7d', NOW)
    assert.deepEqual(
        {
            from: w.from,
            to: w.to,
            prevFrom: w.prevFrom,
            prevTo: w.prevTo,
            days: w.days,
            bucket: w.bucket,
        },
        {
            from: '2026-09-11',
            to: '2026-09-17',
            prevFrom: '2026-09-04',
            prevTo: '2026-09-10',
            days: 7,
            bucket: 'day',
        },
    )
})

test('30d y 90d se agrupan por día y no se solapan con su tramo anterior', () => {
    for (const preset of ['30d', '90d'] as EarningsPreset[]) {
        const w = resolvePeriod(preset, NOW)
        assert.equal(w.days, Number(preset.slice(0, -1)))
        assert.equal(daysBetween(w.prevFrom, w.prevTo), w.days)
        assert.equal(addDaysIso(w.prevTo, 1), w.from)
        assert.equal(w.bucket, 'day')
    }
})

test('thisMonth compara del 1 a hoy contra el mismo tramo del mes anterior', () => {
    const w = resolvePeriod('thisMonth', NOW)
    assert.equal(w.from, '2026-09-01')
    assert.equal(w.to, '2026-09-17')
    assert.equal(w.prevFrom, '2026-08-01')
    assert.equal(w.prevTo, '2026-08-17')
    assert.equal(w.days, 17)
})

test('thisMonth el 31 de marzo recorta el tramo anterior al 29 de febrero bisiesto', () => {
    const w = resolvePeriod('thisMonth', new Date('2028-03-31T10:00:00.000Z'))
    assert.equal(w.prevFrom, '2028-02-01')
    assert.equal(w.prevTo, '2028-02-29')
})

test('lastMonth en enero es diciembre del año anterior contra noviembre', () => {
    const w = resolvePeriod('lastMonth', new Date('2027-01-15T12:00:00.000Z'))
    assert.deepEqual(
        { from: w.from, to: w.to, prevFrom: w.prevFrom, prevTo: w.prevTo },
        {
            from: '2026-12-01',
            to: '2026-12-31',
            prevFrom: '2026-11-01',
            prevTo: '2026-11-30',
        },
    )
    assert.equal(w.bucket, 'day')
})

test('12m arranca el día 1 de hace 11 meses y compara contra los 12 meses previos, por mes', () => {
    const w = resolvePeriod('12m', NOW)
    assert.equal(w.from, '2025-10-01')
    assert.equal(w.to, '2026-09-17')
    assert.equal(w.prevFrom, '2024-10-01')
    assert.equal(w.prevTo, '2025-09-30')
    assert.equal(w.bucket, 'month')
})

test('bucketFor: día hasta 92, semana hasta 200, mes después', () => {
    assert.equal(bucketFor(92), 'day')
    assert.equal(bucketFor(93), 'week')
    assert.equal(bucketFor(200), 'week')
    assert.equal(bucketFor(201), 'month')
})

test('isEarningsPreset acepta los presets y rechaza basura; resolvePeriod lanza', () => {
    assert.equal(isEarningsPreset('30d'), true)
    assert.equal(isEarningsPreset('lol'), false)
    assert.equal(isEarningsPreset(undefined), false)
    assert.throws(() => resolvePeriod('lol' as never, NOW))
})

test('toDensePoints rellena ceros, funde las dos fuentes e ignora lo que no toca', () => {
    const points = toDensePoints('2026-09-15', '2026-09-17', [
        {
            day: '2026-09-15',
            source: 'fanvue',
            usd_gross_cents: 1000,
            usd_net_cents: 800,
            stars: 0,
            sales_count: 0,
        },
        {
            day: '2026-09-15',
            source: 'telegram',
            usd_gross_cents: 0,
            usd_net_cents: 0,
            stars: 50,
            sales_count: 2,
        },
        // Fuera de rango: no cuenta.
        {
            day: '2026-09-14',
            source: 'telegram',
            usd_gross_cents: 0,
            usd_net_cents: 0,
            stars: 999,
            sales_count: 9,
        },
        // Fuente desconocida: no cuenta (no mezclar unidades por accidente).
        {
            day: '2026-09-16',
            source: 'stripe',
            usd_gross_cents: 5,
            usd_net_cents: 5,
            stars: 5,
            sales_count: 5,
        },
        // El RPC puede devolver el día con hora; se recorta a la fecha.
        {
            day: '2026-09-17T00:00:00',
            source: 'telegram',
            usd_gross_cents: 0,
            usd_net_cents: 0,
            stars: 7,
            sales_count: 1,
        },
    ])
    assert.equal(points.length, 3)
    assert.deepEqual(points[0], {
        day: '2026-09-15',
        fanvueGrossCents: 1000,
        fanvueNetCents: 800,
        stars: 50,
        telegramSales: 2,
    })
    assert.deepEqual(points[1], emptyPoint('2026-09-16'))
    assert.deepEqual(points[2], {
        day: '2026-09-17',
        fanvueGrossCents: 0,
        fanvueNetCents: 0,
        stars: 7,
        telegramSales: 1,
    })
})

test('bucketSeries por semana agrupa en tramos de 7 días desde el primer punto', () => {
    const points = enumerateDays('2026-09-01', '2026-09-16').map((day, i) => ({
        ...emptyPoint(day),
        stars: i + 1,
        fanvueNetCents: 100,
    }))
    const weekly = bucketSeries(points, 'week')
    assert.equal(weekly.length, 3) // 7 + 7 + 2 días
    assert.deepEqual(
        weekly.map((w) => w.day),
        ['2026-09-01', '2026-09-08', '2026-09-15'],
    )
    assert.equal(weekly[0].stars, 1 + 2 + 3 + 4 + 5 + 6 + 7)
    assert.equal(weekly[0].fanvueNetCents, 700)
    assert.equal(weekly[2].stars, 15 + 16)
})

test('bucketSeries por mes usa el mes natural y suma las cuatro métricas', () => {
    const points = enumerateDays('2026-08-30', '2026-09-02').map((day) => ({
        day,
        fanvueGrossCents: 10,
        fanvueNetCents: 8,
        stars: 3,
        telegramSales: 1,
    }))
    const monthly = bucketSeries(points, 'month')
    assert.deepEqual(monthly, [
        {
            day: '2026-08-01',
            fanvueGrossCents: 20,
            fanvueNetCents: 16,
            stars: 6,
            telegramSales: 2,
        },
        {
            day: '2026-09-01',
            fanvueGrossCents: 20,
            fanvueNetCents: 16,
            stars: 6,
            telegramSales: 2,
        },
    ])
})

test('alignPrevious rellena y recorta a la longitud de la serie actual', () => {
    const current = [emptyPoint('a'), emptyPoint('b'), emptyPoint('c')]
    assert.equal(alignPrevious(current, [emptyPoint('x')]).length, 3)
    assert.equal(alignPrevious(current, [emptyPoint('x')])[2].day, '')
    assert.equal(
        alignPrevious(
            current,
            Array.from({ length: 5 }, () => emptyPoint('y')),
        ).length,
        3,
    )
})

test('sumPoints y pctChange', () => {
    const total = sumPoints([
        {
            day: 'a',
            fanvueGrossCents: 100,
            fanvueNetCents: 80,
            stars: 5,
            telegramSales: 1,
        },
        {
            day: 'b',
            fanvueGrossCents: 50,
            fanvueNetCents: 40,
            stars: 2,
            telegramSales: 1,
        },
    ])
    assert.deepEqual(total, {
        fanvueGrossCents: 150,
        fanvueNetCents: 120,
        stars: 7,
        telegramSales: 2,
    })
    assert.equal(pctChange(0, 0), null)
    assert.equal(pctChange(10, 0), null)
    assert.equal(pctChange(150, 100), 50)
    assert.equal(pctChange(50, 100), -50)
    assert.equal(pctChange(101, 300), -66.3)
})

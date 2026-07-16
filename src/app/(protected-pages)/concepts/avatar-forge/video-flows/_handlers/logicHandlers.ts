import type { VideoNodeHandler } from '../_engine/types'

export const condition: VideoNodeHandler = async (node, inputs) => {
    const { field, operator, compareValue } = node.data.config
    // The wired value may be a bundle (avatar/media object): when a config
    // `field` is set, compare that property of the bundle; otherwise compare
    // the raw wired value.
    const wired = inputs.value
    const value =
        field && wired && typeof wired === 'object'
            ? (wired as Record<string, unknown>)[field as string]
            : wired

    let result = false
    switch (operator) {
        case 'equals':
            result = String(value) === String(compareValue)
            break
        case 'not-equals':
            result = String(value) !== String(compareValue)
            break
        case 'contains':
            result = String(value).includes(String(compareValue))
            break
        case 'greater-than':
            result = Number(value) > Number(compareValue)
            break
        case 'less-than':
            result = Number(value) < Number(compareValue)
            break
    }

    // The engine gates downstream edges on `result`: only edges wired to the
    // taken port ("true"/"false") stay live. Both ports pass the wired value
    // (the full bundle) through.
    return {
        output: { result, true: wired, false: wired },
    }
}

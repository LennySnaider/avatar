import type { VideoNodeHandler } from '../_engine/types'

export const condition: VideoNodeHandler = async (node, inputs) => {
    const { field, operator, compareValue } = node.data.config
    // Evaluate against the named config field when set, otherwise whatever
    // arrived on the `value` input port.
    const value = field ? inputs[field as string] : inputs.value

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
    // taken port ("true"/"false") stay live. Both ports pass the value through.
    return {
        output: { result, true: value, false: value },
    }
}

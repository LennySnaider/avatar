import type { VideoNodeHandler } from '../_engine/types'

export const condition: VideoNodeHandler = async (node, inputs) => {
    const { field, operator, compareValue } = node.data.config
    const value = inputs[field as string]

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

    return {
        output: { result, value },
    }
}

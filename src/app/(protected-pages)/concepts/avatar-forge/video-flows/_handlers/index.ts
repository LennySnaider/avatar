import type { VideoNodeHandler } from '../_engine/types'
import * as inputHandlers from './inputHandlers'
import * as aiHandlers from './aiHandlers'
import * as generationHandlers from './generationHandlers'
import * as transformHandlers from './transformHandlers'
import * as voiceHandlers from './voiceHandlers'
import * as logicHandlers from './logicHandlers'
import * as outputHandlers from './outputHandlers'

export const handlers: Record<string, VideoNodeHandler> = {
    'select-avatar':    inputHandlers.selectAvatar,
    'upload-image':     inputHandlers.uploadImage,
    'prompt-enhance':   aiHandlers.promptEnhance,
    'describe-image':   aiHandlers.describeImage,
    'generate-image':   generationHandlers.generateImage,
    'generate-video':   generationHandlers.generateVideo,
    'stitch':           transformHandlers.stitch,
    'text-overlay':     transformHandlers.textOverlay,
    'script-generator': voiceHandlers.scriptGenerator,
    'text-to-speech':   voiceHandlers.textToSpeech,
    'condition':        logicHandlers.condition,
    'save-to-gallery':  outputHandlers.saveToGallery,
    'webhook':          outputHandlers.webhook,
}

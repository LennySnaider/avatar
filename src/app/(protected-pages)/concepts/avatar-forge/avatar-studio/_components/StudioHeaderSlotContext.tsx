'use client'

import { createContext, useContext } from 'react'

/**
 * DOM node in the StudioTabs tab-bar row where the Avatar Studio header actions
 * (Prompts / Upload / Tools) are portaled, so they sit on the SAME row as the
 * tabs instead of taking their own header row. Null until the tab bar mounts.
 */
export const StudioHeaderSlotContext = createContext<HTMLElement | null>(null)

export const useStudioHeaderSlot = () => useContext(StudioHeaderSlotContext)

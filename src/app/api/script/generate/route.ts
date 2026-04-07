import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/configs/auth.config'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateScript } from '@/services/ScriptService'
import type { ScriptGenerateParams } from '@/@types/voice'

export async function POST(req: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: ScriptGenerateParams & { title?: string; save?: boolean } = await req.json()
    const { template, tone, language, durationSeconds, context, title, save } = body

    if (!template || !tone || !language || !durationSeconds) {
        return NextResponse.json(
            { error: 'template, tone, language, and durationSeconds are required' },
            { status: 400 }
        )
    }

    try {
        const scriptText = await generateScript({
            template,
            tone,
            language,
            durationSeconds,
            context: context || {},
        })

        // Optionally save to DB
        let savedScript = null
        if (save) {
            const supabase = createServerSupabaseClient()
            const { data, error } = await supabase
                .from('audio_scripts')
                .insert({
                    user_id: session.user.id,
                    title: title || `${template} script`,
                    script_text: scriptText,
                    language,
                    tone,
                    duration_target_seconds: durationSeconds,
                    template_type: template,
                    context: context || {},
                })
                .select()
                .single()

            if (error) throw new Error(error.message)
            savedScript = data
        }

        return NextResponse.json({
            success: true,
            script: scriptText,
            saved: savedScript,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Script generation failed'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

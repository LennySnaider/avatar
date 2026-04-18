'use client'

interface ColorPickerFieldProps {
    label: string
    value: string
    onChange: (value: string) => void
}

export default function ColorPickerField({ label, value, onChange }: ColorPickerFieldProps) {
    return (
        <label className="block">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</span>
            <div className="mt-0.5 flex items-center gap-2 bg-slate-900 border border-slate-700 rounded px-2 py-1.5">
                <input
                    type="color"
                    value={value || '#ffffff'}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-8 h-6 rounded cursor-pointer bg-transparent border border-slate-700"
                />
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="flex-1 bg-transparent outline-none text-xs text-slate-300 font-mono uppercase"
                    placeholder="#FFFFFF"
                />
            </div>
        </label>
    )
}

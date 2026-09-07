'use client'

import Menu from '@/components/ui/Menu'
import ScrollBar from '@/components/ui/ScrollBar'
import { useSettingsStore } from '../_store/settingsStore'

import { TbUserSquare, TbLock, TbBell, TbFileDollar } from 'react-icons/tb'
import { useSearchParams } from 'next/navigation'
import type { View } from '../types'
import type { ReactNode } from 'react'

const { MenuItem } = Menu

/**
 * Aqui habia una quinta pestaña, "Integration", y se ha quitado del mapa en vez
 * de dejarla con un cartel. Era el unico caso de las seis maquetas sin ningun
 * valor informativo: interruptores de Google Drive, Slack y compañia que solo
 * hacian `mutate(..., false)` sobre la cache de SWR, con un "Learn more" cuyo
 * texto era el lorem ipsum de cafeteria de ECME ("Wings medium plunger pot,
 * redeye doppio siphon froth iced"). No anunciaban ninguna integracion prevista
 * de este producto — las de verdad (redes sociales, Fanvue) viven en
 * Avatar Forge y no en Settings — asi que un cartel de "todavia no disponible"
 * habria prometido algo que nadie ha planeado. Se fueron con ella el
 * componente, /api/setting/intergration y apiGetSettingsIntergration.
 */
const menuList: { label: string; value: View; icon: ReactNode }[] = [
    { label: 'Profile', value: 'profile', icon: <TbUserSquare /> },
    { label: 'Security', value: 'security', icon: <TbLock /> },
    { label: 'Notification', value: 'notification', icon: <TbBell /> },
    { label: 'Billing', value: 'billing', icon: <TbFileDollar /> },
]

export const SettingsMenu = ({ onChange }: { onChange?: () => void }) => {
    const searchParams = useSearchParams()

    const { currentView, setCurrentView } = useSettingsStore()

    const currentPath =
        searchParams.get('category') || searchParams.get('label') || 'inbox'

    const handleSelect = (value: View) => {
        setCurrentView(value)
        onChange?.()
    }

    return (
        <div className="flex flex-col justify-between h-full">
            <ScrollBar className="h-full overflow-y-auto">
                <Menu className="mx-2 mb-10">
                    {menuList.map((menu) => (
                        <MenuItem
                            key={menu.value}
                            eventKey={menu.value}
                            className={`mb-2 ${
                                currentView === menu.value
                                    ? 'bg-gray-100 dark:bg-gray-700'
                                    : ''
                            }`}
                            isActive={currentPath === menu.value}
                            onSelect={() => handleSelect(menu.value)}
                        >
                            <span className="text-2xl ltr:mr-2 rtl:ml-2">
                                {menu.icon}
                            </span>
                            <span>{menu.label}</span>
                        </MenuItem>
                    ))}
                </Menu>
            </ScrollBar>
        </div>
    )
}

export default SettingsMenu

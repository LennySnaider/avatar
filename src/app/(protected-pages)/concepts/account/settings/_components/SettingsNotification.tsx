'use client'

import Checkbox from '@/components/ui/Checkbox'
import Radio from '@/components/ui/Radio'
import Switcher from '@/components/ui/Switcher'
import Alert from '@/components/ui/Alert'
import { apiGetSettingsNotification } from '@/services/AccontsService'
import useSWR from 'swr'
import { TbMessageCircleCheck } from 'react-icons/tb'
import type { GetSettingsNotificationResponse } from '../types'

type EmailNotificationFields =
    | 'newsAndUpdate'
    | 'tipsAndTutorial'
    | 'offerAndPromotion'
    | 'followUpReminder'

const emailNotificationOption: {
    label: string
    value: EmailNotificationFields
    desc: string
}[] = [
    {
        label: 'News & updates',
        value: 'newsAndUpdate',
        desc: 'New about product and features update',
    },
    {
        label: 'Tips & tutorials',
        value: 'tipsAndTutorial',
        desc: 'Tips & trick in order to increase your performance efficiency',
    },
    {
        label: 'Offer & promotions',
        value: 'offerAndPromotion',
        desc: 'Promotion about product price & lastest discount',
    },
    {
        label: 'Follow up remider',
        value: 'followUpReminder',
        desc: 'Receive notification all the reminder that have been made',
    },
]

const notifyMeOption: {
    label: string
    value: string
    desc: string
}[] = [
    {
        label: 'All new messages',
        value: 'allNewMessage',
        desc: 'Broadcast notifications to the channel for each new message',
    },
    {
        label: 'Mentions only',
        value: 'mentionsOnly',
        desc: 'Only alert me in the channel if someone mentions me in a message',
    },
    {
        label: 'Nothing',
        value: 'nothing',
        desc: `Don't notify me anything`,
    },
]

/**
 * Esta era la maqueta mas silenciosa de las seis, y por eso la mas traicionera:
 * cada handler hacia `mutate(newData, false)` sobre la cache de SWR. Sin toast,
 * sin boton de guardar, sin latencia — el interruptor cambiaba al instante y
 * parecia guardado precisamente porque no habia ceremonia ninguna. En realidad
 * /api/setting/notification es GET-only sobre `notificationSettingsData` de
 * src/mock: no existia el endpoint donde escribir, y al recargar volvia todo a
 * su sitio.
 *
 * Lo que se rompia por ello: alguien apagaba "Email notification" creyendo que
 * dejaba de recibir correo. Hoy da igual porque la app no manda esos correos ni
 * pinta esas notificaciones de escritorio, pero el dia que las mande, este
 * interruptor no las habria apagado.
 *
 * Se deja en SOLO LECTURA con las opciones a la vista, porque enseñan que
 * preferencias estan previstas. Para hacerlo real harian falta: una tabla de
 * preferencias por usuario, un PUT que la escriba, y sobre todo que ALGUIEN LAS
 * LEA — un interruptor que se guarda pero que ningun emisor consulta es la misma
 * mentira con un viaje a la base de datos en medio.
 */
const SettingsNotification = () => {
    const {
        data = {
            email: [],
            desktop: false,
            unreadMessageBadge: false,
            notifymeAbout: '',
        },
    } = useSWR(
        '/api/settings/notification/',
        () => apiGetSettingsNotification<GetSettingsNotificationResponse>(),
        {
            revalidateOnFocus: false,
            revalidateIfStale: false,
            revalidateOnReconnect: false,
        },
    )

    return (
        <div>
            <h4 className="mb-4">Notification</h4>
            <Alert showIcon type="warning">
                Notification preferences are not available yet
            </Alert>
            <p className="mt-4 leading-relaxed">
                These settings are read-only: nothing is stored, and no email or
                desktop notification is sent from this app yet. The values below
                are sample data from the template.
            </p>
            <div className="mt-2">
                <div className="flex items-center justify-between py-6 border-b border-gray-200 dark:border-gray-600">
                    <div>
                        <h5>Enable desktop notification</h5>
                        <p>
                            Decide whether you want to be notified of new
                            message & updates
                        </p>
                    </div>
                    <div>
                        <Switcher disabled checked={data.desktop} />
                    </div>
                </div>
                <div className="flex items-center justify-between py-6 border-b border-gray-200 dark:border-gray-600">
                    <div>
                        <h5>Enable unread notification badge</h5>
                        <p>
                            Display a red indicator on of the notification icon
                            when you have unread message
                        </p>
                    </div>
                    <div>
                        <Switcher disabled checked={data.unreadMessageBadge} />
                    </div>
                </div>
                <div className="py-6 border-b border-gray-200 dark:border-gray-600">
                    <h5>Enable unread notification badge</h5>
                    <div className="mt-4">
                        <Radio.Group
                            disabled
                            vertical
                            className="flex flex-col gap-6"
                            value={data.notifymeAbout}
                        >
                            {notifyMeOption.map((option) => (
                                <div key={option.value} className="flex gap-4">
                                    <div className="mt-1.5">
                                        <Radio value={option.value} />
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="mt-1">
                                            <TbMessageCircleCheck className="text-lg" />
                                        </div>
                                        <div>
                                            <h6>{option.label}</h6>
                                            <p>{option.desc}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </Radio.Group>
                    </div>
                </div>
                <div className="flex items-center justify-between py-6">
                    <div>
                        <h5>Email notification</h5>
                        <p>
                            Substance can send you email notification for any
                            new direct message
                        </p>
                    </div>
                    <div>
                        <Switcher disabled checked={data.email.length > 0} />
                    </div>
                </div>
                <Checkbox.Group
                    vertical
                    className="flex flex-col gap-6"
                    value={data.email}
                >
                    {emailNotificationOption.map((option) => (
                        <div key={option.value} className="flex gap-4">
                            <div className="mt-1.5">
                                <Checkbox disabled value={option.value} />
                            </div>
                            <div>
                                <h6>{option.label}</h6>
                                <p>{option.desc}</p>
                            </div>
                        </div>
                    ))}
                </Checkbox.Group>
            </div>
        </div>
    )
}

export default SettingsNotification

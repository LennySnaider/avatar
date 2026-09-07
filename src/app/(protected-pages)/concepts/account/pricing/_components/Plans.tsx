'use client'

import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Alert from '@/components/ui/Alert'
import { usePricingStore } from '../_store/pricingStore'
import { featuresList } from '../constants'
import classNames from '@/utils/classNames'
import isLastChild from '@/utils/isLastChild'
import { NumericFormat } from 'react-number-format'
import { TbCheck } from 'react-icons/tb'
import type { GetPricingPanResponse } from '../types'

type PlansProps = {
    data: GetPricingPanResponse
}

/**
 * El aviso de cabecera y la desaparicion de "Current plan" van juntos con la
 * limpieza de PaymentDialog: esta pantalla no puede cobrar (no hay pasarela) y
 * sus planes salen de datos mock de la plantilla, asi que enseñar precios sin
 * decirlo era afirmar un catalogo que no existe.
 *
 * Las props `subcription`/`cycle` se han quitado a proposito: pintaban
 * "Current plan" —y deshabilitaban el boton— con lo que viniera en la URL, sin
 * consultar suscripcion alguna. El unico sitio que ponia esos parametros era el
 * boton "Change plan" de Settings > Billing, que tambien se ha retirado; bastaba
 * con teclear ?subcription=basic para que la app afirmara que ese era tu plan.
 */
const Plans = ({ data }: PlansProps) => {
    const { paymentCycle, setPaymentDialog, setSelectedPlan } =
        usePricingStore()

    return (
        <>
            <Alert showIcon type="warning" className="mb-8">
                These plans cannot be purchased yet: checkout is not connected,
                and the prices below are placeholder data from the template.
                Nothing on this page can charge you.
            </Alert>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 xl:gap-4">
                {data?.plans.map((plan, index) => (
                    <div
                        key={plan.id}
                        className={classNames(
                            'px-6 pt-2 flex flex-col justify-between',
                            !isLastChild(data.plans, index) &&
                                'border-r-0 xl:border-r border-gray-200 dark:border-gray-700',
                        )}
                    >
                        <div>
                            <h5 className="mb-6 flex items-center gap-2">
                                <span>{plan.name}</span>
                                {plan.recommended && (
                                    <Tag className="rounded-full bg-green-200 font-bold">
                                        Recommended
                                    </Tag>
                                )}
                            </h5>
                            <div className="">{plan.description}</div>
                            <div className="mt-6">
                                <NumericFormat
                                    className="h1"
                                    displayType="text"
                                    value={plan.price[paymentCycle]}
                                    prefix={'$'}
                                    thousandSeparator={true}
                                />
                                <span className="text-lg font-bold">
                                    {' '}
                                    /{' '}
                                    {paymentCycle === 'monthly'
                                        ? 'month'
                                        : 'year'}
                                </span>
                            </div>
                            <div className="flex flex-col gap-4 border-t border-gray-200 dark:border-gray-700 mt-6 pt-6">
                                {featuresList.map((feature) => (
                                    <div
                                        key={feature.id}
                                        className="flex items-center gap-4 font-semibold heading-text"
                                    >
                                        {plan.features.includes(feature.id) && (
                                            <>
                                                <TbCheck
                                                    className={classNames(
                                                        'text-2xl',
                                                        plan.features.includes(
                                                            feature.id,
                                                        )
                                                            ? 'text-primary'
                                                            : 'text-gray-100',
                                                    )}
                                                />
                                                <span>
                                                    {
                                                        feature.description[
                                                            plan.id as string
                                                        ]
                                                    }
                                                </span>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="mt-10">
                            <Button
                                block
                                onClick={() => {
                                    setSelectedPlan({
                                        paymentCycle,
                                        planName: plan.name,
                                        price: plan.price,
                                    })
                                    setPaymentDialog(true)
                                }}
                            >
                                Select plan
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </>
    )
}

export default Plans

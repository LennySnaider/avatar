'use client'

import { useMemo, useEffect } from 'react'
import Input from '@/components/ui/Input'
import Alert from '@/components/ui/Alert'
import Select, { Option as DefaultOption } from '@/components/ui/Select'
import Avatar from '@/components/ui/Avatar'
import { Form, FormItem } from '@/components/ui/Form'
import NumericInput from '@/components/shared/NumericInput'
import { countryList } from '@/constants/countries.constant'
import { components } from 'react-select'
import type { ControlProps, OptionProps } from 'react-select'
import { apiGetSettingsProfile } from '@/services/AccontsService'
import useSWR from 'swr'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { HiOutlineUser } from 'react-icons/hi'
import type { GetSettingsProfileResponse } from '../types'

type ProfileSchema = {
    firstName: string
    lastName: string
    email: string
    dialCode: string
    phoneNumber: string
    img: string
    country: string
    address: string
    postcode: string
    city: string
}

type CountryOption = {
    label: string
    dialCode: string
    value: string
}

const { Control } = components

// El esquema se conserva aunque hoy no valide nada: es la forma exacta que
// tendra que aceptar el guardado real, y borrarlo obligaria a redescubrirla.
const validationSchema = z.object({
    firstName: z.string().min(1, { message: 'First name required' }),
    lastName: z.string().min(1, { message: 'Last name required' }),
    email: z
        .string()
        .min(1, { message: 'Email required' })
        .email({ message: 'Invalid email' }),
    dialCode: z.string().min(1, { message: 'Please select your country code' }),
    phoneNumber: z
        .string()
        .min(1, { message: 'Please input your mobile number' }),
    country: z.string().min(1, { message: 'Please select a country' }),
    address: z.string().min(1, { message: 'Addrress required' }),
    postcode: z.string().min(1, { message: 'Postcode required' }),
    city: z.string().min(1, { message: 'City required' }),
    img: z.string(),
})

const CustomSelectOption = (
    props: OptionProps<CountryOption> & { variant: 'country' | 'phone' },
) => {
    return (
        <DefaultOption<CountryOption>
            {...props}
            customLabel={(data, label) => (
                <span className="flex items-center gap-2">
                    <Avatar
                        shape="circle"
                        size={20}
                        src={`/img/countries/${data.value}.png`}
                    />
                    {props.variant === 'country' && <span>{label}</span>}
                    {props.variant === 'phone' && <span>{data.dialCode}</span>}
                </span>
            )}
        />
    )
}

const CustomControl = ({ children, ...props }: ControlProps<CountryOption>) => {
    const selected = props.getValue()[0]
    return (
        <Control {...props}>
            {selected && (
                <Avatar
                    className="ltr:ml-4 rtl:mr-4"
                    shape="circle"
                    size={20}
                    src={`/img/countries/${selected.value}.png`}
                />
            )}
            {children}
        </Control>
    )
}

/**
 * "Personal information" fingia guardar: `onSubmit` hacia `sleep(500)` y luego
 * `mutate({ ...data, ...values }, false)`. Ese `false` es el que hacia el daño:
 * le dice a SWR que actualice la cache SIN revalidar contra el servidor, asi que
 * el formulario se quedaba tan campante con los datos nuevos, el boton salia del
 * estado de carga y todo parecia guardado. Al recargar la pagina volvia lo de
 * antes, porque /api/setting/profile es GET-only sobre `profileData` de
 * src/mock: ni siquiera existia un endpoint donde escribir.
 *
 * Ademas los datos que se enseñaban no eran los del usuario, sino los del mock
 * (otro nombre, otro email, otra direccion), de modo que la pantalla afirmaba
 * dos cosas falsas a la vez: que ese era tu perfil y que lo habias cambiado.
 *
 * Se deja en SOLO LECTURA en vez de esconderla: el formulario ya no acepta datos
 * que iban a la basura, y el aviso explica de donde sale lo que se ve. El
 * "Upload image" tambien se fue — creaba un `URL.createObjectURL` que moria con
 * la pestaña.
 *
 * Esta es, de las seis maquetas, la mas barata de hacer real: existe la tabla
 * `users` con `name` y `email`, y la sesion ya trae el id. Harian falta una
 * server action que tome el id de la SESION (nunca de un parametro, como en
 * changePassword), un GET que lea la fila en vez del mock, y decidir donde viven
 * los campos que la tabla no tiene (telefono, direccion, ciudad, pais): o se
 * añaden columnas o se recorta el formulario a lo que de verdad guardamos.
 * Enseñar campos que no se persisten seria volver a mentir, mas discretamente.
 */
const SettingsProfile = () => {
    const { data } = useSWR(
        '/api/settings/profile/',
        () => apiGetSettingsProfile<GetSettingsProfileResponse>(),
        {
            revalidateOnFocus: false,
            revalidateIfStale: false,
            revalidateOnReconnect: false,
        },
    )

    const dialCodeList = useMemo(() => {
        const newCountryList: Array<CountryOption> = JSON.parse(
            JSON.stringify(countryList),
        )

        return newCountryList.map((country) => {
            country.label = country.dialCode
            return country
        })
    }, [])

    const { reset, control } = useForm<ProfileSchema>({
        resolver: zodResolver(validationSchema),
    })

    useEffect(() => {
        if (data) {
            reset(data)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data])

    return (
        <>
            <h4 className="mb-4">Personal information</h4>
            <Alert showIcon type="warning" className="mb-8">
                Editing your personal information is not available yet
            </Alert>
            <p className="mb-8 leading-relaxed">
                These fields are read-only and show sample data from the
                template, not your account. Your sign-in email and password live
                under Security.
            </p>
            {/*
                El form se queda como contenedor por el layout de FormItem, pero
                sin onSubmit: no hay nada que enviar y no debe haber forma de
                intentarlo con la tecla Enter.
            */}
            <Form onSubmit={(e) => e.preventDefault()}>
                <div className="mb-8">
                    <Controller
                        name="img"
                        control={control}
                        render={({ field }) => (
                            <Avatar
                                size={90}
                                className="border-4 border-white bg-gray-100 text-gray-300 shadow-lg"
                                icon={<HiOutlineUser />}
                                src={field.value}
                            />
                        )}
                    />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                    <FormItem label="First name">
                        <Controller
                            name="firstName"
                            control={control}
                            render={({ field }) => (
                                <Input
                                    type="text"
                                    autoComplete="off"
                                    placeholder="First Name"
                                    {...field}
                                    disabled
                                />
                            )}
                        />
                    </FormItem>
                    <FormItem label="User name">
                        <Controller
                            name="lastName"
                            control={control}
                            render={({ field }) => (
                                <Input
                                    type="text"
                                    autoComplete="off"
                                    placeholder="Last Name"
                                    {...field}
                                    disabled
                                />
                            )}
                        />
                    </FormItem>
                </div>
                <FormItem label="Email">
                    <Controller
                        name="email"
                        control={control}
                        render={({ field }) => (
                            <Input
                                type="email"
                                autoComplete="off"
                                placeholder="Email"
                                {...field}
                                disabled
                            />
                        )}
                    />
                </FormItem>
                <div className="flex items-end gap-4 w-full mb-6">
                    <FormItem>
                        <label className="form-label mb-2">Phone number</label>
                        <Controller
                            name="dialCode"
                            control={control}
                            render={({ field }) => (
                                <Select<CountryOption>
                                    isDisabled
                                    instanceId="dial-code"
                                    options={dialCodeList}
                                    {...field}
                                    className="w-[150px]"
                                    components={{
                                        Option: (props) => (
                                            <CustomSelectOption
                                                variant="phone"
                                                {...(props as OptionProps<CountryOption>)}
                                            />
                                        ),
                                        Control: CustomControl,
                                    }}
                                    placeholder=""
                                    value={dialCodeList.filter(
                                        (option) =>
                                            option.dialCode === field.value,
                                    )}
                                />
                            )}
                        />
                    </FormItem>
                    <FormItem className="w-full">
                        <Controller
                            name="phoneNumber"
                            control={control}
                            render={({ field }) => (
                                <NumericInput
                                    disabled
                                    autoComplete="off"
                                    placeholder="Phone Number"
                                    value={field.value}
                                />
                            )}
                        />
                    </FormItem>
                </div>
                <h4 className="mb-6">Address information</h4>
                <FormItem label="Country">
                    <Controller
                        name="country"
                        control={control}
                        render={({ field }) => (
                            <Select<CountryOption>
                                isDisabled
                                instanceId="country"
                                options={countryList}
                                {...field}
                                components={{
                                    Option: (props) => (
                                        <CustomSelectOption
                                            variant="country"
                                            {...(props as OptionProps<CountryOption>)}
                                        />
                                    ),
                                    Control: CustomControl,
                                }}
                                placeholder=""
                                value={countryList.filter(
                                    (option) => option.value === field.value,
                                )}
                            />
                        )}
                    />
                </FormItem>
                <FormItem label="Address">
                    <Controller
                        name="address"
                        control={control}
                        render={({ field }) => (
                            <Input
                                type="text"
                                autoComplete="off"
                                placeholder="Address"
                                {...field}
                                disabled
                            />
                        )}
                    />
                </FormItem>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormItem label="City">
                        <Controller
                            name="city"
                            control={control}
                            render={({ field }) => (
                                <Input
                                    type="text"
                                    autoComplete="off"
                                    placeholder="City"
                                    {...field}
                                    disabled
                                />
                            )}
                        />
                    </FormItem>
                    <FormItem label="Postal Code">
                        <Controller
                            name="postcode"
                            control={control}
                            render={({ field }) => (
                                <Input
                                    type="text"
                                    autoComplete="off"
                                    placeholder="Postal Code"
                                    {...field}
                                    disabled
                                />
                            )}
                        />
                    </FormItem>
                </div>
            </Form>
        </>
    )
}

export default SettingsProfile

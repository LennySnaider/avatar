import { lazy } from 'react'
import { ADMIN, USER } from '@/constants/roles.constant'
import type { Routes } from '@/@types/routes'

const conceptsRoute: Routes = {
    '/concepts/ai/chat': {
        key: 'concepts.ai.chat',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
        },
    },
    '/concepts/ai/image': {
        key: 'concepts.ai.image',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
            pageBackgroundType: 'plain',
        },
    },
    '/concepts/projects/scrum-board': {
        key: 'concepts.projects.scrumBoard',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
        },
    },
    '/concepts/projects/project-list': {
        key: 'concepts.projects.projectList',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
            pageBackgroundType: 'plain',
        },
    },
    '/concepts/projects/tasks': {
        key: 'concepts.projects.projectTasks',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
        },
    },
    '/concepts/projects/project-details/[slug]': {
        key: 'concepts.projects.projectDetails',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
            pageBackgroundType: 'plain',
        },
        dynamicRoute: true,
    },
    '/concepts/projects/tasks/[slug]': {
        key: 'concepts.projects.projectIssue',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
        },
        dynamicRoute: true,
    },
    '/concepts/customers/customer-list': {
        key: 'concepts.customers.customerList',
        authority: [ADMIN, USER],
    },
    '/concepts/customers/customer-edit/[slug]': {
        key: 'concepts.customers.customerEdit',
        authority: [ADMIN, USER],
        meta: {
            header: {
                title: 'Edit customer',
                description:
                    'Manage customer details, purchase history, and preferences.',
                contained: true,
            },
            footer: false,
        },
        dynamicRoute: true,
    },
    '/concepts/customers/customer-create': {
        key: 'concepts.customers.customerCreate',
        authority: [ADMIN, USER],
        meta: {
            header: {
                title: 'Create customer',
                description:
                    'Manage customer details, track purchases, and update preferences easily.',
                contained: true,
            },
            footer: false,
        },
    },
    '/concepts/customers/customer-details/[slug]': {
        key: 'concepts.customers.customerDetails',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
        },
        dynamicRoute: true,
    },
    '/concepts/products/product-list': {
        key: 'concepts.products.productList',
        authority: [ADMIN, USER],
    },
    '/concepts/products/product-edit/[slug]': {
        key: 'concepts.products.productEdit',
        authority: [ADMIN, USER],
        meta: {
            header: {
                title: 'Edit product',
                description:
                    'Quickly manage product details, stock, and availability.',
                contained: true,
            },
            footer: false,
        },
        dynamicRoute: true,
    },
    '/concepts/products/product-create': {
        key: 'concepts.products.productCreate',
        authority: [ADMIN, USER],
        meta: {
            header: {
                title: 'Create product',
                description:
                    'Quickly add products to your inventory. Enter key details, manage stock, and set availability.',
                contained: true,
            },
            footer: false,
        },
    },
    '/concepts/orders/order-list': {
        key: 'concepts.orders.orderList',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
        },
    },
    '/concepts/orders/order-create': {
        key: 'concepts.orders.orderCreate',
        authority: [ADMIN, USER],
        meta: {
            header: {
                title: 'Create order',
                contained: true,
                description:
                    'Create new customer orders quickly and accurately',
            },
            footer: false,
        },
    },
    '/concepts/orders/order-edit/[slug]': {
        key: 'concepts.orders.orderEdit',
        authority: [ADMIN, USER],
        meta: {
            header: {
                title: 'Edit order',
                contained: true,
                description: 'Manage and track orders efficiently',
            },
            footer: false,
        },
        dynamicRoute: true,
    },
    '/concepts/orders/order-details/[slug]': {
        key: 'concepts.orders.orderDetails',
        authority: [ADMIN, USER],
        meta: {
            header: {
                contained: true,
                title: lazy(
                    () =>
                        import(
                            '@/app/(protected-pages)/concepts/orders/order-details/[id]/_components/OrderDetailHeader'
                        ),
                ),
                extraHeader: lazy(
                    () =>
                        import(
                            '@/app/(protected-pages)/concepts/orders/order-details/[id]/_components/OrderDetailHeaderExtra'
                        ),
                ),
            },
            pageContainerType: 'contained',
        },
        dynamicRoute: true,
    },
    '/concepts/account/settings': {
        key: 'concepts.account.settings',
        authority: [ADMIN, USER],
        meta: {
            header: {
                title: 'Settings',
            },
            pageContainerType: 'contained',
        },
    },
    '/concepts/account/activity-log': {
        key: 'concepts.account.activityLog',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
        },
    },
    '/concepts/account/pricing': {
        key: 'concepts.account.pricing',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
        },
    },
    '/concepts/account/roles-permissions': {
        key: 'concepts.account.rolesPermissions',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
            pageBackgroundType: 'plain',
        },
    },
    '/concepts/help-center/support-hub': {
        key: 'concepts.helpCenter.supportHub',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'gutterless',
            pageBackgroundType: 'plain',
        },
    },
    '/concepts/help-center/article/[slug]': {
        key: 'concepts.helpCenter.article',
        authority: [ADMIN, USER],
        dynamicRoute: true,
        meta: {
            pageContainerType: 'contained',
            pageBackgroundType: 'plain',
        },
    },
    '/concepts/help-center/edit-article/[slug]': {
        key: 'concepts.helpCenter.editArticle',
        authority: [ADMIN, USER],
        dynamicRoute: true,
        meta: {
            pageBackgroundType: 'plain',
            footer: false,
        },
    },
    '/concepts/help-center/manage-article': {
        key: 'concepts.helpCenter.manageArticle',
        authority: [ADMIN, USER],
        meta: {
            pageBackgroundType: 'plain',
            footer: false,
        },
    },
    '/concepts/file-manager': {
        key: 'concepts.fileManager',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
            pageBackgroundType: 'plain',
        },
    },
    '/concepts/calendar': {
        key: 'concepts.calendar',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
            pageBackgroundType: 'plain',
        },
    },
    '/concepts/mail': {
        key: 'concepts.mail',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
        },
    },
    '/concepts/chat': {
        key: 'concepts.chat',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
        },
    },
    // Avatar Forge Routes
    '/concepts/avatar-forge/avatar-list': {
        key: 'concepts.avatarForge.avatarList',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
            pageBackgroundType: 'plain',
        },
    },
    '/concepts/avatar-forge/avatar-studio': {
        key: 'concepts.avatarForge.avatarStudio',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'gutterless',
            pageBackgroundType: 'plain',
            footer: false,
        },
    },
    '/concepts/avatar-forge/avatar-studio/[slug]': {
        key: 'concepts.avatarForge.avatarStudioEdit',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'gutterless',
            pageBackgroundType: 'plain',
            footer: false,
        },
        dynamicRoute: true,
    },
    '/concepts/avatar-forge/prompt-library': {
        key: 'concepts.avatarForge.promptLibrary',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
        },
    },
    '/concepts/avatar-forge/providers': {
        key: 'concepts.avatarForge.providers',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
        },
    },
    '/concepts/avatar-forge/gallery': {
        key: 'concepts.avatarForge.gallery',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'contained',
            pageBackgroundType: 'plain',
        },
    },
    '/concepts/avatar-forge/image-editor': {
        key: 'concepts.avatarForge.imageEditor',
        authority: [ADMIN, USER],
        meta: {
            pageContainerType: 'gutterless',
            pageBackgroundType: 'plain',
            footer: false,
        },
    },
}

export default conceptsRoute

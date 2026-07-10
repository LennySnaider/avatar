import { CONCEPTS_PREFIX_PATH } from '@/constants/route.constant'
import {
    NAV_ITEM_TYPE_TITLE,
    NAV_ITEM_TYPE_ITEM,
    NAV_ITEM_TYPE_COLLAPSE,
} from '@/constants/navigation.constant'
import { ADMIN, USER } from '@/constants/roles.constant'
import type { NavigationTree } from '@/@types/navigation'

const conceptsNavigationConfig: NavigationTree[] = [
    {
        key: 'avatarForge',
        path: '',
        title: 'Avatar Forge',
        translateKey: 'nav.avatarForge.avatarForge',
        icon: 'avatarForge',
        type: NAV_ITEM_TYPE_TITLE,
        authority: [ADMIN, USER],
        meta: {
            horizontalMenu: {
                layout: 'columns',
                columns: 1,
            },
        },
        subMenu: [
            {
                key: 'avatarForge.avatarStudio',
                path: `${CONCEPTS_PREFIX_PATH}/avatar-forge/avatar-studio`,
                title: 'Avatar Studio',
                translateKey: 'nav.avatarForge.avatarStudio',
                icon: 'avatarStudio',
                type: NAV_ITEM_TYPE_ITEM,
                authority: [ADMIN, USER],
                meta: {
                    description: {
                        translateKey: 'nav.avatarForge.avatarStudioDesc',
                        label: 'Generate images and videos',
                    },
                },
                subMenu: [],
            },
            // Reel Remix, Video Editor and Voice Studio moved INTO Avatar
            // Studio (Tools dropdown → ToolModal); their standalone routes
            // still work by URL but no longer clutter the sidebar. See
            // docs/superpowers/specs/2026-07-09-studio-consolidation-design.md
            {
                key: 'avatarForge.avatarList',
                path: `${CONCEPTS_PREFIX_PATH}/avatar-forge/avatar-list`,
                title: 'My Avatars',
                translateKey: 'nav.avatarForge.avatarList',
                icon: 'avatarList',
                type: NAV_ITEM_TYPE_ITEM,
                authority: [ADMIN, USER],
                meta: {
                    description: {
                        translateKey: 'nav.avatarForge.avatarListDesc',
                        label: 'View saved avatars',
                    },
                },
                subMenu: [],
            },
            {
                key: 'avatarForge.social',
                path: `${CONCEPTS_PREFIX_PATH}/avatar-forge/social/accounts`,
                title: 'Social Media',
                translateKey: 'nav.avatarForge.social',
                icon: 'avatarSocial',
                type: NAV_ITEM_TYPE_ITEM,
                authority: [ADMIN, USER],
                meta: {
                    description: {
                        translateKey: 'nav.avatarForge.socialDesc',
                        label: 'Connect and publish to social accounts',
                    },
                },
                subMenu: [],
            },
            {
                key: 'avatarForge.fanvue',
                path: '',
                title: 'Fanvue',
                translateKey: 'nav.avatarForge.fanvue',
                icon: 'avatarSocial',
                type: NAV_ITEM_TYPE_COLLAPSE,
                authority: [ADMIN, USER],
                subMenu: [
                    {
                        key: 'avatarForge.fanvueAccounts',
                        path: `${CONCEPTS_PREFIX_PATH}/avatar-forge/fanvue/accounts`,
                        title: 'Fanvue Account',
                        translateKey: 'nav.avatarForge.fanvueAccounts',
                        icon: '',
                        type: NAV_ITEM_TYPE_ITEM,
                        authority: [ADMIN, USER],
                        subMenu: [],
                    },
                    {
                        key: 'avatarForge.fanvueComposer',
                        path: `${CONCEPTS_PREFIX_PATH}/avatar-forge/fanvue/composer`,
                        title: 'Fanvue Composer',
                        translateKey: 'nav.avatarForge.fanvueComposer',
                        icon: '',
                        type: NAV_ITEM_TYPE_ITEM,
                        authority: [ADMIN, USER],
                        subMenu: [],
                    },
                    {
                        key: 'avatarForge.fanvuePosts',
                        path: `${CONCEPTS_PREFIX_PATH}/avatar-forge/fanvue/posts`,
                        title: 'Fanvue Posts',
                        translateKey: 'nav.avatarForge.fanvuePosts',
                        icon: '',
                        type: NAV_ITEM_TYPE_ITEM,
                        authority: [ADMIN, USER],
                        subMenu: [],
                    },
                ],
            },
            {
                key: 'avatarForge.providers',
                path: `${CONCEPTS_PREFIX_PATH}/avatar-forge/providers`,
                title: 'AI Providers',
                translateKey: 'nav.avatarForge.providers',
                icon: 'aiProviders',
                type: NAV_ITEM_TYPE_ITEM,
                authority: [ADMIN, USER],
                meta: {
                    description: {
                        translateKey: 'nav.avatarForge.providersDesc',
                        label: 'Configure AI providers',
                    },
                },
                subMenu: [],
            },
        ],
    },
]

export default conceptsNavigationConfig

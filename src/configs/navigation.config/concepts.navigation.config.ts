import { CONCEPTS_PREFIX_PATH } from '@/constants/route.constant'
import {
    NAV_ITEM_TYPE_TITLE,
    NAV_ITEM_TYPE_ITEM,
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
                key: 'avatarForge.avatarCreator',
                path: `${CONCEPTS_PREFIX_PATH}/avatar-forge/avatar-creator`,
                title: 'Avatar Creator',
                translateKey: 'nav.avatarForge.avatarCreator',
                icon: 'avatarCreator',
                type: NAV_ITEM_TYPE_ITEM,
                authority: [ADMIN, USER],
                meta: {
                    description: {
                        translateKey: 'nav.avatarForge.avatarCreatorDesc',
                        label: 'Create and configure avatars',
                    },
                },
                subMenu: [],
            },
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
            {
                key: 'avatarForge.imageEditor',
                path: `${CONCEPTS_PREFIX_PATH}/avatar-forge/image-editor`,
                title: 'Image Editor',
                translateKey: 'nav.avatarForge.imageEditor',
                icon: 'imageEdit',
                type: NAV_ITEM_TYPE_ITEM,
                authority: [ADMIN, USER],
                meta: {
                    description: {
                        translateKey: 'nav.avatarForge.imageEditorDesc',
                        label: 'Edit images with AI',
                    },
                },
                subMenu: [],
            },
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
                key: 'avatarForge.gallery',
                path: `${CONCEPTS_PREFIX_PATH}/avatar-forge/gallery`,
                title: 'Gallery',
                translateKey: 'nav.avatarForge.gallery',
                icon: 'avatarGallery',
                type: NAV_ITEM_TYPE_ITEM,
                authority: [ADMIN, USER],
                meta: {
                    description: {
                        translateKey: 'nav.avatarForge.galleryDesc',
                        label: 'Generated images & videos',
                    },
                },
                subMenu: [],
            },
            {
                key: 'avatarForge.promptLibrary',
                path: `${CONCEPTS_PREFIX_PATH}/avatar-forge/prompt-library`,
                title: 'Prompt Library',
                translateKey: 'nav.avatarForge.promptLibrary',
                icon: 'promptLibrary',
                type: NAV_ITEM_TYPE_ITEM,
                authority: [ADMIN, USER],
                meta: {
                    description: {
                        translateKey: 'nav.avatarForge.promptLibraryDesc',
                        label: 'Saved prompts collection',
                    },
                },
                subMenu: [],
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

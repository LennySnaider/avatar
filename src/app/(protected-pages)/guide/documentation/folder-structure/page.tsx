'use client'

import SyntaxHighlighter from '@/components/shared/SyntaxHighlighter'
import CodeToggleTabs from '@/components/docs/DemoCard/CodeToggleTabs'

const Page = () => {
    return (
        <>
            <p>
                Our template&apos;s folder structure closely follows the
                official{' '}
                <a
                    href="https://nextjs.org/docs/app/getting-started/project-structure"
                    target="_blank"
                >
                    Next.js app router structure
                </a>{' '}
                conventions. In this section you will find the basic folder
                structure and everything you need to get the template up and
                running. Both the demo and starter versions have the same
                structure, except that the starter version will have fewer files
                & folders than the demo version as they are not required in the
                starter.
            </p>
            <p>Below is a schematic diagram of directory structure:</p>
            <CodeToggleTabs
                tsCallback={() => (
                    <SyntaxHighlighter>
                        {`
├── messages                      # Locale messages
|   ├── en.json                   # locale JSON file
|   └── ...                       # Other locale JSON files
├── public                        # Static resource
|   ├── img                       # Images
|   ├── data                      # Static data
|   └── ...                       # Other static files
├── src
│   ├── @types                    # Type files that share across the temeplate
│   │   └── ...                   
│   ├── app                       # Main application directory for Next.js App Router
│   │   ├── (auth-pages)          # Group routes for auth pages
│   │   ├── └── ...               # Auth pages
│   │   ├── └── layout.tsx        # Base layout for auth pages
│   │   ├── (protected-pages)     # Group routes for pages theat require authentication
│   │   ├── ├── ...               # Protected pages
│   │   ├── └── layout.tsx        # Root layout for protected pages
│   │   ├── (public-pages)        # Group routes for public pages
│   │   ├── └── ...               # Public pages
│   │   ├── api                   # API endpoint
│   │   |   └── ...               # API route & files
│   │   favicon.ico               # Favicon
│   │   layout.tsx                # Root layout
│   │   not-found.tsx             # Empty page for 404
│   │   page.tsx                  # Entry page
|   ├── assets                    # App static resource
│   │   ├── maps                  # Map meta data 
│   │   ├── markdown              # Markdown files
│   │   ├── styles                # Global CSS files
│   │   └── svg	                  # SVG files
│   ├── components                # General components
│   │   ├── auth                  # Auth related components
│   │   ├── docs                  # Documentations related components
│   │   ├── layouts               # Layout components
│   │   ├── shared                # Upper level components built on top of ui components
│   │   ├── template              # Template components, such as Header, Footer, Nav, etc...
│   │   ├── ui                    # Bottom level components, such as Button, Dropdown, etc...
│   │   └── view                  # Sharable High level components that used for pages 
│   ├── configs                   # Configuration files        
│   │   └── ...          
│   ├── constants                 # Constant files
│   │   └── ...      
│   ├── i18n                      # Localization setup
│   │   └── ...                   
│   ├── mock                      # Mock data for fake API Calls
│   │   └── data                  # Mock data
│   │   |   └── ...               # Mock data TS files
│   ├── server                    # Server side files
│   │   └── actions               # Server action files
│   │   |   └── ...      				
│   ├── services                  # Service files for managing client API integrations
│   │   ├── ApiService.ts         # Api request & response handler
│   │   ├── axios                 # Axios configs & interceptors
|   |   |   └── ...
│   │   └── ...                   # Other service files
│   ├── utils                     # All reusable function & hooks
│   │   ├── hooks                 # Hooks
│   │   |   └── ...      					
│   │   └── ...                   # Reusable functions 
│   |   auth.ts                   # Next auth setup entry file
│   └── middleware.ts             # Nextjs middleware
├── .env                          # File to stores environment configuration and secrets
├── .eslintignore                 # Ignore file for eslint  
├── .gitignore                    # Ignore file for git
├── .prettierignore               # Ignore file for prettier
├── .prettierrc                   # Prettier config
├── next-env.d.ts                 # Nextjs environment declaration
├── next.config.mjs               # Nextjs configuration file
├── package.json                  
├── package.lock.json            
├── postcss.config.mjs            # PostCss configuration file
├── README.md 
├── tailwind.config.ts            # TailwindCSS configuration file
└── tsconfig.json                 # Project Typescript configuration file
`}
                    </SyntaxHighlighter>
                )}
                jsCallback={() => (
                    <SyntaxHighlighter>
                        {`
├── messages                      # Locale messages
|   ├── en.json                   # locale JSON file
|   └── ...                       # Other locale JSON files
├── public                        # Static resource
|   ├── img                       # Images
|   ├── data                      # Static data
|   └── ...                       # Other static files
├── src
│   ├── app                       # Main application directory for Next.js App Router
│   │   ├── (auth-pages)          # Group routes for auth pages
│   │   ├── └── ...               # Auth pages
│   │   ├── └── layout.jsx        # Base layout for auth pages
│   │   ├── (protected-pages)     # Group routes for pages theat require authentication
│   │   ├── ├── ...               # Protected pages
│   │   ├── └── layout.jsx        # Root layout for protected pages
│   │   ├── (public-pages)        # Group routes for public pages
│   │   ├── └── ...               # Public pages
│   │   ├── api                   # API endpoint
│   │   |   └── ...               # API route & files
│   │   favicon.ico               # Favicon
│   │   layout.jsx                # Root layout
│   │   not-found.jsx             # Empty page for 404
│   │   page.jsx                  # Entry page
|   ├── assets                    # App static resource
│   │   ├── maps                  # Map meta data 
│   │   ├── markdown              # Markdown files
│   │   ├── styles                # Global CSS files
│   │   └── svg	                  # SVG files
│   ├── components                # General components
│   │   ├── auth                  # Auth related components
│   │   ├── docs                  # Documentations related components
│   │   ├── layouts               # Layout components
│   │   ├── shared                # Upper level components built on top of ui components
│   │   ├── template              # Template components, such as Header, Footer, Nav, etc...
│   │   ├── ui                    # Bottom level components, such as Button, Dropdown, etc...
│   │   └── view                  # Sharable High level components that used for pages 
│   ├── configs                   # Configuration files        
│   │   └── ...          
│   ├── constants                 # Constant files
│   │   └── ...      
│   ├── i18n                      # Localization setup
│   │   └── ...                   
│   ├── mock                      # Mock data for fake API Calls
│   │   └── data                  # Mock data
│   │   |   └── ...               # Mock data TS files
│   ├── server                    # Server side files
│   │   └── actions               # Server action files
│   │   |   └── ...      				
│   ├── services                  # Service files for managing client API integrations
│   │   ├── ApiService.js         # Api request & response handler
│   │   ├── axios                 # Axios configs & interceptors
|   |   |   └── ...
│   │   └── ...                   # Other service files
│   ├── utils                     # All reusable function & hooks
│   │   ├── hooks                 # Hooks
│   │   |   └── ...      					
│   │   └── ...                   # Reusable functions 
│   |   auth.js                   # Next auth setup entry file
│   └── middleware.js             # Nextjs middleware
├── .env                          # File to stores environment configuration and secrets
├── .eslintignore                 # Ignore file for eslint  
├── .gitignore                    # Ignore file for git
├── .prettierignore               # Ignore file for prettier
├── .prettierrc                   # Prettier config
├── next-env.d.js                 # Nextjs environment declaration
├── next.config.mjs               # Nextjs configuration file
├── package.json                  
├── package.lock.json            
├── postcss.config.mjs            # PostCss configuration file
├── README.md 
├── tailwind.config.js            # TailwindCSS configuration file
└── jsconfig.json                 # Project JavaScript configuration file
`}
                    </SyntaxHighlighter>
                )}
            />
            <p>
                This folder structure provides a clear organization of
                resources, components, configuration, and assets, making it
                easier to manage and scale your project. Each folder and file is
                purposefully placed to ensure a clean and maintainable codebase.
            </p>
        </>
    )
}

export default Page

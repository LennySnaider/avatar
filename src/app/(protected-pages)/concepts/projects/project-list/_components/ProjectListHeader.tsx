'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import NewProjectForm from './NewProjectForm'

const ProjectListHeader = () => {
    const [dialogOpen, setDialogOpen] = useState(false)

    return (
        <>
            <div className="flex items-center justify-between gap-4">
                <h3>Projects</h3>
                <div>
                    <Button variant="solid" onClick={() => setDialogOpen(true)}>
                        Create project
                    </Button>
                </div>
            </div>
            <Dialog isOpen={dialogOpen} onClose={() => setDialogOpen(false)}>
                <h4>Add new project</h4>
                <div className="mt-4">
                    <NewProjectForm onClose={() => setDialogOpen(false)} />
                </div>
            </Dialog>
        </>
    )
}

export default ProjectListHeader

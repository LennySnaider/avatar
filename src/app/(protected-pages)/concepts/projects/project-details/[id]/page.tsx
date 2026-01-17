import ProjectDetails from './_components/ProjectDetails'

export default async function Page(props: { params: Promise<{ id: string }> }) {
    const params = await props.params

    return <ProjectDetails id={params.id} />
}

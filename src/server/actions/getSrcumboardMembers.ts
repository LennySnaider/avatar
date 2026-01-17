import { usersData } from '@/mock/data/usersData'

const getSrcumboardMembers = async () => {
    const borderMembersId = ['3', '2', '4', '7', '1', '10', '9']
    const participantMembers = usersData.filter((user) =>
        borderMembersId.includes(user.id),
    )
    return {
        participantMembers,
        allMembers: usersData,
    }
}

export default getSrcumboardMembers

import ChatProvider from './_components/ChatProvider'
import ChatView from './_components/ChatView'
import ChatSideNav from './_components/ChatSideNav'
import ChatHistoryRenameDialog from './_components/ChatHistoryRenameDialog'
import getChatHistory from '@/server/actions/getChatHistory'

export default async function Page() {
    const chatHistory = await getChatHistory()
    return (
        <ChatProvider chatHistory={chatHistory}>
            <div className="h-full">
                <div className="flex flex-auto gap-4 h-full">
                    <ChatView />
                    <ChatSideNav className='hidden xl:block' />
                    <ChatHistoryRenameDialog />
                </div>
            </div>
        </ChatProvider>
    )
}

import Card from '@/components/ui/Card'
import ChatProvider from './_components/ChatProvider'
import ChatSidebar from './_components/ChatSidebar'
import ChatBody from './_components/ChatBody'
import ContactInfoDrawer from './_components/ContactInfoDrawer'
import getChatList from '@/server/actions/getChatList'

export default async function Page() {
    const data = await getChatList()

    return (
        <ChatProvider chats={data}>
            <Card className="h-full border-0" bodyClass="h-full flex flex-col">
                <div className="flex flex-auto h-full gap-8">
                    <ChatSidebar />
                    <ChatBody />
                </div>
            </Card>
            <ContactInfoDrawer />
        </ChatProvider>
    )
}

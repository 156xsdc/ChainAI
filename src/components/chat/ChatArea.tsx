/**
 * 聊天主区域：消息流 + 底部圆角输入卡片
 */
import { MessageList } from "./MessageList";
import { InputCard } from "./InputCard";

export function ChatArea() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#fafafa]">
      <MessageList />
      <InputCard />
    </div>
  );
}

import type { DashboardValuePoint } from "../viewModel";

export const buildChannelData = <Conversation>(
    conversations: Conversation[],
    resolveChannelName: (conversation: Conversation) => string,
): DashboardValuePoint[] => {
    const channelCounts = new Map<string, number>();

    conversations.forEach((conversation) => {
        const channelName = resolveChannelName(conversation);
        channelCounts.set(channelName, (channelCounts.get(channelName) || 0) + 1);
    });

    const total = conversations.length;

    return Array.from(channelCounts.entries()).map(([name, count]) => ({
        name,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }));
};

import api from "@/shared/api/axios";
import type { FeedbackEntry, FeedbackListRow, SubmitFeedbackInput } from "./types";

export interface FeedbackListResult {
  data: FeedbackListRow[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

export const feedbackService = {
  submit: async (input: SubmitFeedbackInput): Promise<FeedbackEntry> => {
    const res = await api.post("/api/v1/feedback", input);
    return res.data.data;
  },

  list: async (cursor?: string): Promise<FeedbackListResult> => {
    const res = await api.get("/api/v1/feedback", { params: { cursor } });
    return {
      data: res.data?.data ?? [],
      nextCursor: res.data?.extra?.nextCursor ?? null,
      hasMore: res.data?.extra?.hasMore ?? false,
      total: res.data?.extra?.total ?? 0,
    };
  },
};

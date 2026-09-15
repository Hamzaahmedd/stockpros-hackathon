export interface FeedbackEntry {
  id: string;
  userId: string;
  message: string;
  page: string | null;
  createdAt: string;
}

export interface SubmitFeedbackInput {
  message: string;
  page?: string;
}

export interface FeedbackListRow {
  id: string;
  message: string;
  page: string | null;
  createdAt: string;
  user: {
    id: string;
    displayName: string;
    email: string;
  };
}

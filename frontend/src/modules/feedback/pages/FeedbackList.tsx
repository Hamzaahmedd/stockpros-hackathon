import { useEffect, useState } from "react";
import { FiMessageSquare } from "react-icons/fi";
import { Sidebar } from "@/shared/components/Sidebar";
import { feedbackService } from "../services";
import type { FeedbackListRow } from "../types";

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const FeedbackList = () => {
  const [entries, setEntries] = useState<FeedbackListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await feedbackService.list();
      setEntries(result.data);
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
      setTotal(result.total);
    } catch (err) {
      console.error("Error fetching feedback:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await feedbackService.list(nextCursor);
      setEntries((prev) => [...prev, ...result.data]);
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch (err) {
      console.error("Error loading more feedback:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="h-screen flex flex-col lg:flex-row bg-background text-foreground font-inter overflow-hidden">
      <Sidebar />

      <main id="main-content" className="flex-1 p-4 md:p-10 overflow-y-auto overflow-x-hidden">
        <div className="max-w-[1200px] mx-auto space-y-10">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-3">
                <FiMessageSquare className="text-primary" />
                User Feedback
              </h1>
              <div className="text-sm text-muted-foreground mt-1 font-medium">
                {total} total submission{total === 1 ? "" : "s"}
              </div>
            </div>
          </div>

          {/* ================= FEEDBACK TABLE ================= */}
          <div className="rounded-lg border border-border overflow-hidden bg-card shadow-md">
            <div className="overflow-x-auto">
              <div className="min-w-[900px]">
                {/* Table Header */}
                <div className="grid grid-cols-[1.4fr_1.4fr_3fr_1fr_1.2fr] px-8 py-4 text-[10px] font-bold text-muted-foreground border-b border-border bg-muted/30 uppercase tracking-wider">
                  <div>Name</div>
                  <div>Email</div>
                  <div>Message</div>
                  <div>Page</div>
                  <div>Submitted</div>
                </div>

                {loading ? (
                  <div className="py-20 text-center text-muted-foreground animate-pulse">
                    Loading feedback...
                  </div>
                ) : entries.length === 0 ? (
                  <div className="py-20 text-center text-muted-foreground">
                    No feedback submitted yet.
                  </div>
                ) : (
                  entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="grid grid-cols-[1.4fr_1.4fr_3fr_1fr_1.2fr] px-8 py-4 border-b border-border items-start transition-colors duration-200 hover:bg-muted/30"
                    >
                      <div className="font-bold text-sm truncate">
                        {entry.user.displayName}
                      </div>
                      <div className="text-muted-foreground text-sm font-medium truncate">
                        {entry.user.email}
                      </div>
                      <div className="text-sm whitespace-pre-wrap break-words">
                        {entry.message}
                      </div>
                      <div className="text-muted-foreground text-xs font-mono truncate">
                        {entry.page || "—"}
                      </div>
                      <div className="text-muted-foreground text-xs font-medium whitespace-nowrap">
                        {formatDate(entry.createdAt)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            {/* Load More */}
            {hasMore && (
              <div className="flex justify-center px-8 py-4 border-t border-border bg-muted/10">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-6 py-2 text-[10px] font-bold border border-border rounded-md bg-secondary hover:bg-secondary/80 transition-all uppercase tracking-wider disabled:opacity-50"
                >
                  {loadingMore ? "Loading..." : "Load More"}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default FeedbackList;

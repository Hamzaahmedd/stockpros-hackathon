import { Button } from "@/shared/components/ui/button";
import { useAuth } from "@/modules/auth/hooks/useAuth";
import { Compass } from "lucide-react";
import { Link } from "react-router-dom";

export const NotFound = () => {
  const { user } = useAuth();
  const homePath = user ? "/dashboard" : "/login";

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <section className="max-w-md text-center space-y-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Compass className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-4xl font-semibold">404</h1>
        <p className="text-muted-foreground">
          We couldn't find the page you're looking for. It may have been
          moved or the link may be incorrect.
        </p>
        <Button asChild>
          <Link to={homePath}>
            {user ? "Back to Dashboard" : "Back to Login"}
          </Link>
        </Button>
      </section>
    </main>
  );
};

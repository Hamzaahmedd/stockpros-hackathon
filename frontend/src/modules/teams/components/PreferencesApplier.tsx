import { useAuth } from "@/modules/auth/hooks/useAuth";
import { useTheme } from "@/shared/hooks/useTheme";
import { useEffect } from "react";
import { teamService } from "../services";
import { toAppTheme } from "../utils";

/**
 * Applies the workspace's default theme for team members who haven't chosen a
 * theme themselves. An explicit personal choice (stored under "theme") always
 * wins, and the default is applied without being saved as that choice, so a
 * later change to the workspace default still reaches people who never
 * overrode it. Renders nothing.
 */
export function PreferencesApplier() {
  const { user } = useAuth();
  const { setTheme } = useTheme();
  const isTeamMember = user?.plan === "TEAM";

  useEffect(() => {
    if (!isTeamMember || localStorage.getItem("theme")) return;

    let cancelled = false;
    teamService
      .getPreferences()
      .then(({ effective }) => {
        if (!cancelled && effective.theme) {
          setTheme(toAppTheme(effective.theme), false);
        }
      })
      .catch(() => undefined); // a default is a nicety; never block the app on it
    return () => {
      cancelled = true;
    };
    // setTheme is recreated each render by ThemeProvider; only the membership matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeamMember]);

  return null;
}

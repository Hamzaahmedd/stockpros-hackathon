export const buildAlertEmail = (title: string, body: string, symbol: string): string => `
<!DOCTYPE html>
<html>
  <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
    <div style="text-align: left; margin-bottom: 24px; display: flex; align-items: center;">
      <img src="cid:logo" alt="StockPros Logo" style="width: 48px; height: 48px; margin-right: 12px; vertical-align: middle;" />
      <span style="font-size: 28px; font-weight: 900; color: #111827; letter-spacing: -0.5px;">
        Stock<span style="color: #06b6d4;">Pros</span>
      </span>
    </div>
    <h2 style="color: #1a1a2e; margin-top: 0;">${title}</h2>
    <p style="color: #333; font-size: 15px; line-height: 1.6;">${body}</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
    <p style="color: #888; font-size: 12px;">
      This alert was triggered for <strong>${symbol}</strong> on your watchlist.
      You can manage your alert preferences in the app.
    </p>
  </body>
</html>
`;

// App-wide timezone enforcement: Pakistan Standard Time (PKT, UTC+5).
//
// Every user-visible date in the app is rendered through
// Date.prototype.toLocaleString / toLocaleDateString / toLocaleTimeString,
// so we inject `timeZone: 'Asia/Karachi'` as the default there.
// Callers that explicitly pass their own `timeZone` keep full control,
// and number formatting (Number.prototype.toLocaleString) is unaffected.

export const PKT_TIMEZONE = "Asia/Karachi";

type LocalesArg = Intl.LocalesArgument;
type OptionsArg = Intl.DateTimeFormatOptions;

const withPKT = (options?: OptionsArg): OptionsArg => ({
  ...(options ?? {}),
  timeZone: options?.timeZone ?? PKT_TIMEZONE,
});

const originalToLocaleString = Date.prototype.toLocaleString;
const originalToLocaleDateString = Date.prototype.toLocaleDateString;
const originalToLocaleTimeString = Date.prototype.toLocaleTimeString;

Date.prototype.toLocaleString = function (locales?: LocalesArg, options?: OptionsArg): string {
  return originalToLocaleString.call(this, locales, withPKT(options));
};

Date.prototype.toLocaleDateString = function (locales?: LocalesArg, options?: OptionsArg): string {
  return originalToLocaleDateString.call(this, locales, withPKT(options));
};

Date.prototype.toLocaleTimeString = function (locales?: LocalesArg, options?: OptionsArg): string {
  return originalToLocaleTimeString.call(this, locales, withPKT(options));
};

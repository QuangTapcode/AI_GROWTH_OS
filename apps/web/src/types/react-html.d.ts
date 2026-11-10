import "react";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface InputHTMLAttributes<T> {
    /**
     * HTML `switch` boolean attribute for `<input type="checkbox" switch>`.
     * Present on native Safari 17.4+; progressively enhanced via CSS/attribute fallback elsewhere.
     */
    switch?: string | boolean | undefined;
  }
}

// CSS variables set from components (style={{ '--c': color }}), which the stylesheets read. Only for the type
// checker (npm run typecheck).
import 'react';

declare module 'react' {
  interface CSSProperties {
    [variable: `--${string}`]: string | number | undefined;
  }
}

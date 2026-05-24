import { ValidationError } from '../errors/index.ts';

// Matches literal HTML tags: <script, </div, etc.
const HTML_TAG = /<[a-z\/]/i;
// Matches entity-encoded angle brackets that decode to a tag opener:
//   &lt;   &#60;   &#x3C;   &#X3c;   (case-insensitive hex)
const HTML_ENTITY = /&lt;|&#0*60;|&#[xX]0*3[cC];/i;

/**
 * Throw ValidationError if value contains an HTML tag or entity-encoded tag.
 * Applied to every free-text field that is stored and later rendered in HTML.
 * Client-side h() escaping is output encoding; this is the input boundary check.
 */
export function rejectHtml(value: string | null | undefined, field: string): void {
  if (value && (HTML_TAG.test(value) || HTML_ENTITY.test(value))) {
    throw new ValidationError(`Field '${field}' must not contain HTML tags.`);
  }
}

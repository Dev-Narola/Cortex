/**
 * Typography — barrel for Heading, Text, Caption, Code, Link.
 *
 * Re-exported by `@cortex/ui`; never imported directly by app code.
 *
 * **Why this is the top-level `typography/` folder, not under
 * `components/typography/`.** The F1 spec puts these at the top
 * of `src/` because they're orthogonal to the buttons / forms /
 * cards taxonomy — a Heading is a Heading, not a card-like
 * component. Keeping them at the root avoids the false
 * similarity of "everything is a component".
 */

export { Caption, captionVariants } from "./Caption"
export { Code, codeVariants } from "./Code"
export { Heading, headingVariants, type HeadingLevel, type HeadingProps } from "./Heading"
export { Link, type LinkProps } from "./Link"
export { Text, textVariants, type TextElement, type TextProps } from "./Text"

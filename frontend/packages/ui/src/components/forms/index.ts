/**
 * Forms — barrel for every form-control primitive.
 *
 * Re-exported by `@cortex/ui`; never imported directly by app code.
 *
 * F1 Part 2 ships: Input, Textarea, Label, Checkbox, RadioGroup,
 * Switch, Select. The Dialog used to live here too; it moved
 * to `components/dialogs/` per the spec's "compound vs form
 * control" distinction.
 */

export { Checkbox, checkboxVariants, type CheckboxVariantProps } from "./checkbox"
export { Input, inputVariants, type InputProps, type InputVariantProps } from "./input"
export { Label, type LabelProps } from "./label"
export { RadioGroup, RadioGroupItem } from "./radio-group"
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./select"
export { Switch, type SwitchProps, type SwitchSize } from "./switch"
export {
  Textarea,
  textareaVariants,
  type TextareaProps,
  type TextareaVariantProps,
} from "./textarea"

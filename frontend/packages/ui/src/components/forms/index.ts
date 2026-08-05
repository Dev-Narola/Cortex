/**
 * Forms — barrel.
 *
 * Re-exported by `@cortex/ui`; never imported directly by app code.
 *
 * **F1 Part 4 (Task 35).** The form composition primitives:
 * `FormField`, `FormItem`, `FormLabel`, `FormControl`,
 * `FormDescription`, `FormMessage`. App forms compose these
 * instead of wiring labels / descriptions / validation by
 * hand.
 *
 * **Compound API.**
 *
 *   <FormField name="email" state="invalid" error="Required">
 *     <FormItem>
 *       <FormLabel>Email</FormLabel>
 *       <FormControl>
 *         <Input type="email" />
 *       </FormControl>
 *       <FormDescription>We'll never share this.</FormDescription>
 *       <FormMessage />
 *     </FormItem>
 *   </FormField>
 *
 * **Framework-agnostic.** The `state` and `error` props on
 * `FormField` are plain values; the app wires them to
 * react-hook-form (or whichever form lib) at the call site.
 *
 * **Primitive form controls** (Input, Textarea, Checkbox,
 * RadioGroup, Switch, Select, Label) are re-exported from
 * their sub-barrels so consumers can do:
 *
 *   import { Input, Label, FormField, FormItem, ... } from "@cortex/ui"
 *
 * — no need to reach into components/forms/input/...
 */

// Form composition primitives (Task 35)
export {
  type FormFieldContextValue,
  type FormFieldState,
  FormFieldContext,
  FormFieldProvider,
  useFormFieldContext,
} from "./FormContext"

export { type FormFieldProps, FormField } from "./FormField"
export { type FormItemProps, FormItem } from "./FormItem"
export { type FormLabelProps, type FormLabelTone, FormLabel } from "./FormLabel"
export { type FormControlProps, FormControl } from "./FormControl"
export {
  type FormDescriptionProps,
  type FormDescriptionTone,
  FormDescription,
} from "./FormDescription"
export { type FormMessageProps, FormMessage } from "./FormMessage"

// Form control primitives (re-exported from sub-barrels)
export { Checkbox } from "./checkbox/Checkbox"

export { type InputProps, Input } from "./input/Input"

export { type LabelProps, Label } from "./label/Label"

export { RadioGroup, RadioGroupItem } from "./radio-group/RadioGroup"

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
} from "./select/Select"

export { type SwitchProps, type SwitchSize, Switch } from "./switch/Switch"

export { type TextareaProps, Textarea } from "./textarea/Textarea"

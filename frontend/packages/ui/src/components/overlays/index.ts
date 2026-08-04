/**
 * Overlays — barrel for Drawer + DropdownMenu.
 *
 * Re-exported by `@cortex/ui`; never imported directly by app code.
 *
 * **F1 Part 3 (Tasks 23 + 25).** Drawer is the side-anchored
 * sheet (left / right / top / bottom). DropdownMenu is the
 * full Radix compound API plus our design-system extensions
 * (iconLeft, shortcut, destructive tone, nested sub-menus).
 */

export {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  type DrawerContentProps,
  DrawerDescription,
  type DrawerContentVariantProps,
  DrawerFooter,
  DrawerHeader,
  type DrawerSide,
  DrawerTitle,
  DrawerTrigger,
  drawerContentVariants,
} from "./Drawer"

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  type DropdownMenuItemProps,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./DropdownMenu"

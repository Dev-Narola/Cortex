/**
 * Component Showcase — internal development page.
 *
 * **F1 Part 4 (Task 38).** Every reusable component from
 * `@cortex/ui` is rendered here with its variants + a short
 * label. Designers and engineers use it to:
 *
 *   - Scan the entire library at a glance.
 *   - Compare variants side-by-side.
 *   - Verify that a new theme / token change ripples through
 *     the design system.
 *   - Walk a new contributor through the building blocks.
 *
 * **This page is NOT part of the production product.** It
 * is not linked from the marketing site, the app's nav, or
 * anywhere a user can discover. It's a development tool.
 */

"use client"

import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Container,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Grid,
  Heading,
  Icon,
  Input,
  Label,
  LoadingState,
  Logo,
  Page,
  PageContent,
  PageHeader,
  Pagination,
  RadioGroup,
  RadioGroupItem,
  Section,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Sidebar,
  SidebarFooter,
  SidebarItem,
  SidebarSection,
  Skeleton,
  Spinner,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  UserMenu,
} from "@cortex/ui"
import { useState } from "react"

function ShowcaseRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-3 border-b border-border py-6 sm:grid-cols-[12rem_1fr]">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}

function Swatch({ label, className }: { label: string; className: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`h-12 w-12 rounded-md border border-border ${className}`} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

export default function ComponentShowcase() {
  const [paginationPage, setPaginationPage] = useState(3)
  const [switchChecked, setSwitchChecked] = useState(false)
  const [checkboxChecked, setCheckboxChecked] = useState<boolean | "indeterminate">(false)
  const [radioValue, setRadioValue] = useState("option-1")

  return (
    <Page size="full">
      <PageHeader
        title="@cortex/ui — Component Showcase"
        description="Internal development page. Every reusable primitive from the design system, in one place."
        breadcrumb={
          <Breadcrumb
            items={[
              { label: "Internal", href: "/" },
              { label: "Component showcase" },
            ]}
          />
        }
        actions={
          <Badge variant="warning" size="md">
            Internal — not in production
          </Badge>
        }
      />
      <PageContent>
        {/* Brand */}
        <Section title="Brand">
          <ShowcaseRow label="Logo">
            <Logo size="sm" />
            <Logo size="md" />
            <Logo size="lg" />
            <Logo size="xl" showText={false} />
          </ShowcaseRow>
        </Section>

        {/* Colors */}
        <Section title="Colors">
          <ShowcaseRow label="Cloud">
            <Swatch label="50" className="bg-cloud-50" />
            <Swatch label="200" className="bg-cloud-200" />
            <Swatch label="500" className="bg-cloud-500" />
            <Swatch label="900" className="bg-cloud-900" />
          </ShowcaseRow>
          <ShowcaseRow label="Ink">
            <Swatch label="50" className="bg-ink-50" />
            <Swatch label="200" className="bg-ink-200" />
            <Swatch label="500" className="bg-ink-500" />
            <Swatch label="900" className="bg-ink-900" />
          </ShowcaseRow>
          <ShowcaseRow label="Ember">
            <Swatch label="100" className="bg-ember-100" />
            <Swatch label="300" className="bg-ember-300" />
            <Swatch label="500" className="bg-ember-500" />
            <Swatch label="700" className="bg-ember-700" />
          </ShowcaseRow>
          <ShowcaseRow label="Volt">
            <Swatch label="100" className="bg-volt-100" />
            <Swatch label="300" className="bg-volt-300" />
            <Swatch label="500" className="bg-volt-500" />
            <Swatch label="700" className="bg-volt-700" />
          </ShowcaseRow>
        </Section>

        {/* Typography */}
        <Section title="Typography">
          <ShowcaseRow label="Display">
            <Heading level="h1">Heading 1</Heading>
            <Heading level="h2">Heading 2</Heading>
            <Heading level="h3">Heading 3</Heading>
            <Heading level="h4">Heading 4</Heading>
          </ShowcaseRow>
          <ShowcaseRow label="Body">
            <Text size="lg">Body Large — 16px / 1.6</Text>
            <Text>Body — 14px / 1.55</Text>
            <Text size="sm">Body Small — 12px / 1.4</Text>
            <Text size="xs" tone="muted">
              Caption — 12px / 1.4
            </Text>
          </ShowcaseRow>
        </Section>

        {/* Icons */}
        <Section title="Icons">
          <ShowcaseRow label="Actions">
            <Icon name="Plus" />
            <Icon name="Search" />
            <Icon name="Pencil" />
            <Icon name="Trash" tone="destructive" />
            <Icon name="Download" />
            <Icon name="Upload" />
          </ShowcaseRow>
          <ShowcaseRow label="Navigation">
            <Icon name="ChevronLeft" />
            <Icon name="ChevronRight" />
            <Icon name="Menu" />
            <Icon name="House" />
            <Icon name="Settings" />
          </ShowcaseRow>
          <ShowcaseRow label="Status">
            <Icon name="CircleCheck" tone="success" />
            <Icon name="CircleX" tone="destructive" />
            <Icon name="TriangleAlert" tone="warning" />
            <Icon name="Info" />
            <Icon name="Loader" />
          </ShowcaseRow>
          <ShowcaseRow label="Documents">
            <Icon name="FileText" />
            <Icon name="Folder" />
            <Icon name="BookOpen" />
            <Icon name="Paperclip" />
            <Icon name="Image" />
          </ShowcaseRow>
          <ShowcaseRow label="Agents">
            <Icon name="Bot" />
            <Icon name="Sparkles" />
            <Icon name="MessageSquare" />
            <Icon name="Network" />
            <Icon name="Wand" />
          </ShowcaseRow>
          <ShowcaseRow label="Settings">
            <Icon name="Key" />
            <Icon name="Shield" />
            <Icon name="Bell" />
            <Icon name="CreditCard" />
            <Icon name="ChartBar" />
          </ShowcaseRow>
        </Section>

        {/* Buttons */}
        <Section title="Buttons">
          <ShowcaseRow label="Variants">
            <Button variant="default">Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
            <Button variant="spark">Spark</Button>
          </ShowcaseRow>
          <ShowcaseRow label="Sizes">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button size="sm" iconLeft={<Icon name="Plus" />}>
              With icon
            </Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
          </ShowcaseRow>
        </Section>

        {/* Forms */}
        <Section title="Forms">
          <ShowcaseRow label="Input">
            <Input placeholder="Type here..." />
            <Input placeholder="With icon" prefix={<Icon name="Search" />} />
            <Input placeholder="Disabled" disabled />
          </ShowcaseRow>
          <ShowcaseRow label="Textarea">
            <Textarea placeholder="Write a longer response..." rows={3} />
          </ShowcaseRow>
          <ShowcaseRow label="Label">
            <Label>Plain label</Label>
            <Label required>Required label</Label>
          </ShowcaseRow>
          <ShowcaseRow label="Checkbox">
            <Checkbox
              checked={checkboxChecked === true}
              onCheckedChange={(v) => setCheckboxChecked(v)}
            />
            <Checkbox defaultChecked />
            <Checkbox disabled />
            <Checkbox checked="indeterminate" />
          </ShowcaseRow>
          <ShowcaseRow label="Radio">
            <RadioGroup
              value={radioValue}
              onValueChange={setRadioValue}
              className="flex gap-3"
            >
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="option-1" />
                Option 1
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="option-2" />
                Option 2
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="option-3" />
                Option 3
              </label>
            </RadioGroup>
          </ShowcaseRow>
          <ShowcaseRow label="Switch">
            <Switch
              checked={switchChecked}
              onCheckedChange={(v) => setSwitchChecked(v)}
            />
            <Switch defaultChecked />
            <Switch disabled />
          </ShowcaseRow>
          <ShowcaseRow label="Select">
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Pick one" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="a">Option A</SelectItem>
                <SelectItem value="b">Option B</SelectItem>
                <SelectItem value="c">Option C</SelectItem>
              </SelectContent>
            </Select>
          </ShowcaseRow>
          <ShowcaseRow label="Form composition">
            <Grid cols={{ base: 1, md: 2 }} gap="md" className="w-full max-w-2xl">
              <FormField name="email" required>
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="ada@cortex.dev" />
                  </FormControl>
                  <FormDescription>We'll never share this.</FormDescription>
                </FormItem>
              </FormField>
              <FormField name="email-error" error="Email is required">
                <FormItem>
                  <FormLabel>Email (with error)</FormLabel>
                  <FormControl>
                    <Input type="email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              </FormField>
            </Grid>
          </ShowcaseRow>
        </Section>

        {/* Data display */}
        <Section title="Data display">
          <ShowcaseRow label="Avatar">
            <Avatar name="Ada Lovelace" />
            <Avatar name="Ada Lovelace" size="lg" tone="primary" />
            <Avatar name="Grace Hopper" size="md" tone="accent" />
            <Avatar icon="User" />
            <Avatar src="https://example.com/missing.png" name="Ada" />
          </ShowcaseRow>
          <ShowcaseRow label="Badge">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="error">Error</Badge>
            <Badge variant="outline">Outline</Badge>
          </ShowcaseRow>
          <ShowcaseRow label="Tooltip">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline">Hover me</Button>
                </TooltipTrigger>
                <TooltipContent>Tooltip text</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipRoot content="Saved" side="bottom">
              <Button variant="ghost">Inline tooltip</Button>
            </TooltipRoot>
          </ShowcaseRow>
        </Section>

        {/* Spinners / Skeletons */}
        <Section title="Loading states">
          <ShowcaseRow label="Spinner">
            <Spinner size="sm" label="Loading" />
            <Spinner size="md" />
            <Spinner size="lg" />
          </ShowcaseRow>
          <ShowcaseRow label="Skeleton">
            <Skeleton variant="text" className="w-48" />
            <Skeleton variant="circle" className="h-10 w-10" />
            <Skeleton variant="rect" className="h-20 w-40" />
          </ShowcaseRow>
        </Section>

        {/* Cards */}
        <Section title="Cards">
          <ShowcaseRow label="Variants">
            <Card className="w-64">
              <CardHeader>
                <CardTitle>Default</CardTitle>
                <CardDescription>Subtitle text</CardDescription>
              </CardHeader>
              <CardContent>Body content goes here.</CardContent>
              <CardFooter>
                <Button size="sm">Action</Button>
              </CardFooter>
            </Card>
            <Card variant="elevated" className="w-64">
              <CardHeader>
                <CardTitle>Elevated</CardTitle>
              </CardHeader>
              <CardContent>With shadow-md.</CardContent>
            </Card>
            <Card variant="outline" className="w-64">
              <CardHeader>
                <CardTitle>Outline</CardTitle>
              </CardHeader>
              <CardContent>Transparent.</CardContent>
            </Card>
            <Card variant="interactive" className="w-64">
              <CardHeader>
                <CardTitle>Interactive</CardTitle>
              </CardHeader>
              <CardContent>Click anywhere.</CardContent>
            </Card>
          </ShowcaseRow>
        </Section>

        {/* Tables */}
        <Section title="Tables">
          <Card>
            <TableToolbar
              title="Documents"
              description="All uploaded files"
              actions={
                <>
                  <Button size="sm" variant="outline">
                    Filter
                  </Button>
                  <Button size="sm" iconLeft={<Icon name="Plus" />}>
                    Upload
                  </Button>
                </>
              }
            />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead align="right">Size</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>roadmap.pdf</TableCell>
                  <TableCell>PDF</TableCell>
                  <TableCell align="right">2.3 MB</TableCell>
                  <TableCell>
                    <Badge variant="success">Indexed</Badge>
                  </TableCell>
                </TableRow>
                <TableRow state="selected">
                  <TableCell>q3-design.md</TableCell>
                  <TableCell>Markdown</TableCell>
                  <TableCell align="right">412 KB</TableCell>
                  <TableCell>
                    <Badge variant="warning">Processing</Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>screenshots.zip</TableCell>
                  <TableCell>Archive</TableCell>
                  <TableCell align="right">8.1 MB</TableCell>
                  <TableCell>
                    <Badge variant="error">Failed</Badge>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Card>
        </Section>

        {/* Pagination */}
        <Section title="Pagination">
          <ShowcaseRow label="Default">
            <Pagination
              currentPage={paginationPage}
              totalPages={10}
              onPageChange={setPaginationPage}
            />
          </ShowcaseRow>
          <ShowcaseRow label="Compact">
            <Pagination
              compact
              currentPage={paginationPage}
              totalPages={10}
              onPageChange={setPaginationPage}
            />
          </ShowcaseRow>
        </Section>

        {/* Tabs */}
        <Section title="Tabs">
          <Tabs defaultValue="overview" className="w-full max-w-xl">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">Overview content.</TabsContent>
            <TabsContent value="details">Details content.</TabsContent>
            <TabsContent value="settings">Settings content.</TabsContent>
          </Tabs>
        </Section>

        {/* Dialog */}
        <Section title="Dialog">
          <ShowcaseRow label="Open a dialog">
            <Dialog>
              <DialogTrigger asChild>
                <Button>Open dialog</Button>
              </DialogTrigger>
              <DialogContent size="md">
                <DialogHeader>
                  <DialogTitle>Confirm action</DialogTitle>
                  <DialogDescription>
                    This is a description that explains the action.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button>Confirm</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive">Destructive</Button>
              </DialogTrigger>
              <DialogContent size="sm" showClose={false}>
                <DialogHeader>
                  <DialogTitle>Delete this document?</DialogTitle>
                  <DialogDescription>
                    This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button variant="destructive">Delete</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </ShowcaseRow>
        </Section>

        {/* Drawer */}
        <Section title="Drawer">
          <ShowcaseRow label="Sides">
            {(["left", "right", "top", "bottom"] as const).map((side) => (
              <Drawer key={side}>
                <DrawerTrigger asChild>
                  <Button variant="outline" size="sm">
                    {side}
                  </Button>
                </DrawerTrigger>
                <DrawerContent side={side}>
                  <DrawerHeader>
                    <DrawerTitle>Drawer from {side}</DrawerTitle>
                    <DrawerDescription>Side-anchored sheet.</DrawerDescription>
                  </DrawerHeader>
                  <DrawerBody>Body content here.</DrawerBody>
                  <DrawerFooter>
                    <DrawerClose asChild>
                      <Button variant="outline">Close</Button>
                    </DrawerClose>
                  </DrawerFooter>
                </DrawerContent>
              </Drawer>
            ))}
          </ShowcaseRow>
        </Section>

        {/* Dropdown */}
        <Section title="DropdownMenu">
          <ShowcaseRow label="Items with icons + shortcuts">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Open menu</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem iconLeft={<Icon name="User" />} shortcut="⌘U">
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem iconLeft={<Icon name="Settings" />}>
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  iconLeft={<Icon name="LogOut" />}
                  tone="destructive"
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ShowcaseRow>
        </Section>

        {/* Empty / Error / Loading states */}
        <Section title="Zero-data states">
          <ShowcaseRow label="EmptyState">
            <div className="w-96">
              <EmptyState
                title="No documents yet"
                description="Upload a PDF to get started."
                actionLabel="Upload"
                onAction={() => {}}
              />
            </div>
          </ShowcaseRow>
          <ShowcaseRow label="ErrorState">
            <div className="w-96">
              <ErrorState
                title="Couldn't load"
                description="Check your connection and try again."
                code="500"
                onRetry={() => {}}
              />
            </div>
          </ShowcaseRow>
          <ShowcaseRow label="LoadingState">
            <div className="w-96">
              <LoadingState title="Loading documents" description="Just a sec…" />
            </div>
          </ShowcaseRow>
        </Section>

        {/* Layout primitives */}
        <Section title="Layout">
          <ShowcaseRow label="Container">
            <Container size="md" className="bg-muted/40 py-4 text-center">
              Container (max-w-4xl)
            </Container>
          </ShowcaseRow>
          <ShowcaseRow label="Grid">
            <Grid cols={{ base: 1, sm: 2, md: 4 }} gap="md" className="w-full max-w-2xl">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="rounded-md bg-muted p-4 text-center">
                  Col {i}
                </div>
              ))}
            </Grid>
          </ShowcaseRow>
          <ShowcaseRow label="Separator">
            <div className="w-64 space-y-2">
              <div>Above</div>
              <Separator />
              <div>Below</div>
            </div>
          </ShowcaseRow>
        </Section>

        {/* Sidebar */}
        <Section title="Sidebar">
          <div className="h-80 w-64 overflow-hidden rounded-md border border-border">
            <Sidebar state="expanded">
              <div className="border-b border-border p-2">
                <Logo size="sm" />
              </div>
              <SidebarSection label="Workspace">
                <SidebarItem iconLeft={<Icon name="House" />}>Dashboard</SidebarItem>
                <SidebarItem iconLeft={<Icon name="FileText" />} state="active">
                  Documents
                </SidebarItem>
                <SidebarItem iconLeft={<Icon name="MessageSquare" />}>
                  Conversations
                </SidebarItem>
                <SidebarItem iconLeft={<Icon name="Network" />}>Graph</SidebarItem>
                <SidebarItem iconLeft={<Icon name="Bot" />}>Agents</SidebarItem>
                <SidebarItem iconLeft={<Icon name="Settings" />}>Settings</SidebarItem>
              </SidebarSection>
              <SidebarFooter>
                <UserMenu name="Ada Lovelace" email="ada@cortex.dev" />
              </SidebarFooter>
            </Sidebar>
          </div>
        </Section>

        {/* Breadcrumb */}
        <Section title="Breadcrumb">
          <ShowcaseRow label="Default">
            <Breadcrumb
              items={[
                { label: "Home", href: "/" },
                { label: "Settings", href: "/settings" },
                { label: "Profile" },
              ]}
            />
          </ShowcaseRow>
        </Section>
      </PageContent>
    </Page>
  )
}

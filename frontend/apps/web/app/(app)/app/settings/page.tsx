/**
 * Settings — `/app/settings`.
 *
 * Tabbed: General / Team / API Keys / Billing. The Tabs
 * primitive is from @cortex/ui (Radix-based).
 */
"use client"

import { Card, CardContent, Tabs, TabsContent, TabsList, TabsTrigger } from "@cortex/ui"

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Settings</h1>
      <Tabs defaultValue="general" className="w-full">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="api-keys">API keys</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Workspace name, default model, default embedding model.
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="team">
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Members + invite-by-email.
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="api-keys">
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Generate, revoke, and audit API keys.
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="billing">
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Usage this month + plan management.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

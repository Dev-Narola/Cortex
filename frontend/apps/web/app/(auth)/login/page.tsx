/**
 * Login — `/login`.
 *
 * Form posts to the backend `/api/v1/auth/login` through the
 * shared `ApiClient`; the refresh token arrives in an httpOnly
 * cookie set by the server. The access token is held in the
 * Zustand auth store (sessionStorage-backed so a hard refresh
 * doesn't bounce the user). The store is the only writer; this
 * page is just a thin form.
 */
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiError } from "@cortex/api-client";

import { Button, Card, CardContent, Input, Label } from "@cortex/ui";

import { getApiClient } from "@/lib/auth/api-client";
import { useAuthStore, type AuthUser } from "@/lib/auth/store";

const schema = z.object({
  tenant_slug: z
    .string()
    .min(2, "Workspace slug is required")
    .max(63, "Workspace slug is too long")
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and dashes only"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginInput = z.infer<typeof schema>;

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: {
    id: string;
    email: string;
    role: "owner" | "admin" | "member" | "viewer";
    tenant_id: string;
  };
  tenant: {
    id: string;
    slug: string;
    name: string;
  };
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(schema),
    defaultValues: { tenant_slug: "" },
  });

  async function onSubmit(values: LoginInput) {
    setError(null);
    try {
      const client = getApiClient();
      const data = await client.post<TokenResponse>(
        "/api/v1/auth/login",
        values,
      );
      const user: AuthUser = {
        id: data.user.id,
        email: data.user.email,
        role: data.user.role,
        tenantId: data.user.tenant_id,
      };
      setSession({ user, accessToken: data.access_token });
      const next = searchParams.get("next") ?? "/app";
      router.push(next);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Invalid email, password, or workspace.");
      } else if (err instanceof ApiError && err.status === 422) {
        setError("Check the form fields and try again.");
      } else if (err instanceof ApiError && err.status >= 500) {
        setError("Server error. Please try again in a moment.");
      } else {
        setError("Network error. Check your connection and try again.");
      }
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <h1 className="font-display text-2xl font-semibold">
          Sign in to Cortex
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use your work email and workspace slug.
        </p>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tenant_slug">Workspace</Label>
            <Input
              id="tenant_slug"
              type="text"
              autoComplete="organization"
              placeholder="acme"
              {...register("tenant_slug")}
            />
            {errors.tenant_slug && (
              <p className="text-xs text-destructive">
                {errors.tenant_slug.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

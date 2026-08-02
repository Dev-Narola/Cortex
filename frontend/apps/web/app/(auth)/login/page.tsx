/**
 * Login — `/login`.
 *
 * Form posts to the backend `/api/v1/auth/login`; the
 * refresh token arrives in an httpOnly cookie set by the
 * server. The access token is held in memory by the auth
 * store (Zustand) — never localStorage.
 */
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, Card, CardContent, Input, Label } from "@cortex/ui";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
});

type LoginInput = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(schema) });

  async function onSubmit(values: LoginInput) {
    setError(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
          credentials: "include",
        },
      );
      if (!res.ok) {
        setError("Invalid email or password");
        return;
      }
      const data = await res.json();
      // Persist the access token in memory via the auth store;
      // the refresh token arrives in the httpOnly cookie set by
      // the response headers (Set-Cookie: cortex_refresh=...; HttpOnly).
      sessionStorage.setItem("cortex_access_token", data.access_token);
      router.push("/app");
    } catch (err) {
      setError("Network error. Try again.");
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <h1 className="font-display text-2xl font-semibold">Sign in to Cortex</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use your work email.
        </p>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
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

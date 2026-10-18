import { SearchView } from "./SearchView"

export const metadata = { title: "Search" }

export default async function SearchPage({
  searchParams,
}: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  return <SearchView initialQuery={typeof q === "string" ? q : ""} />
}

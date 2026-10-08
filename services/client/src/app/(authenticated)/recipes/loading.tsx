import { Spinner } from "@/components/ui/spinner";

export default function RecipesLoading() {
  return (
    <div>
      <h1 className="mb-6 type-large-title">All Recipes</h1>
      <div className="flex items-center justify-center gap-4 py-8">
        <Spinner />
        <p className="type-callout text-ink-2">Loading recipes...</p>
      </div>
    </div>
  );
}

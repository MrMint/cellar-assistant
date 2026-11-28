import { MakePage } from "@/components/make/MakePage";

/** ux-c L08: a recipe, full screen, step by step (`MakeMode`). */
export const dynamic = "force-dynamic";

export const metadata = { title: "Make" };

export default async function RecipeMakePage({
  params,
}: {
  params: Promise<{ recipeId: string }>;
}) {
  const { recipeId } = await params;
  return <MakePage recipeId={recipeId} />;
}

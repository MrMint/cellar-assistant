"use client";

import { Grid } from "@mui/joy";
import { motion } from "framer-motion";
import type { BarcodeSearchResult } from "@/components/common/OnboardingWizard/actors/types";
import { ItemCard } from "@/components/item/ItemCard";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { formatItemType } from "@/utilities";
import { useScrollPositionRestore } from "@/utilities/hooks";
import { fadeScale, staggerContainerFast } from "./motion-variants";

interface SearchResultGridProps {
  items: BarcodeSearchResult[];
}

export function SearchResultGrid({ items }: SearchResultGridProps) {
  const { sentinelRef, saveScrollPosition } = useScrollPositionRestore();
  const prefersReducedMotion = useMediaQuery(
    "(prefers-reduced-motion: reduce)",
  );

  return (
    <>
      <div ref={sentinelRef} style={{ height: 0, overflow: "hidden" }} />
      <motion.div
        variants={prefersReducedMotion ? undefined : staggerContainerFast}
        initial={prefersReducedMotion ? false : "hidden"}
        animate="show"
      >
        <Grid container spacing={2}>
          {items.map((item) => (
            <Grid
              key={item.id}
              xs={items.length > 6 ? 6 : 12}
              sm={6}
              md={4}
              lg={2}
            >
              <motion.div
                variants={prefersReducedMotion ? undefined : fadeScale}
                whileHover={prefersReducedMotion ? undefined : { y: -3 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                transition={{ duration: 0.15 }}
              >
                <ItemCard
                  item={item}
                  type={item.type}
                  href={`${formatItemType(item.type).toLowerCase()}s/${item.id}`}
                  onClick={saveScrollPosition}
                />
              </motion.div>
            </Grid>
          ))}
        </Grid>
      </motion.div>
    </>
  );
}

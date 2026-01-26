import { graphql } from "@cellar-assistant/shared";
import { serverQuery } from "@/lib/urql/server";

const cellarItemQuery = graphql(`
  query GetCellarItemData($itemId: uuid!) {
    cellar_items_by_pk(id: $itemId) {
      id
      cellar {
        id
        name
      }
      beer {
        id
        name
      }
      wine {
        id
        name
      }
      spirit {
        id
        name
      }
      coffee {
        id
        name
      }
    }
  }
`);

export async function getCellarItemData(itemId: string) {
  try {
    const data = await serverQuery(cellarItemQuery, { itemId });

    const item = data?.cellar_items_by_pk;

    if (!item) {
      return null;
    }

    // Get the item name from whichever item type is present
    const itemName =
      item.beer?.name ||
      item.wine?.name ||
      item.spirit?.name ||
      item.coffee?.name;

    return {
      ...item,
      itemName,
    };
  } catch (error) {
    console.error("Error fetching cellar item data:", error);
    return null;
  }
}

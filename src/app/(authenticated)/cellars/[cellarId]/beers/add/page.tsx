"use client";

import { useUserId } from "@nhost/nextjs";
import { BeerStyle, Country, graphql } from "@shared/gql";
import { isNil, isNotNil } from "ramda";
import { useQuery } from "urql";
import { BeerOnboarding } from "@/components/beer/BeerOnboarding";

const beerOptions = graphql(`
  query BeerOptionsQuery {
    countries: country {
      text
    }
    styles: beer_style {
      text
    }
  }
`);

const AddBeer = ({
  params: { cellarId },
}: {
  params: { cellarId: string };
}) => {
  const userId = useUserId();
  if (isNil(userId)) throw new Error("Bad UserId");
  const [{ data }] = useQuery({ query: beerOptions });

  if (isNotNil(data)) {
    return (
      <BeerOnboarding
        cellarId={cellarId}
        userId={userId}
        styles={data.styles.map((x) => x.text as BeerStyle)}
        countries={data.countries.map((x) => x.text as Country)}
      />
    );
  }
};

export default AddBeer;

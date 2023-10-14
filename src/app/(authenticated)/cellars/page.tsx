"use client";

import { graphql } from "@/gql";
import withAuth from "@/hocs/withAuth";
import {
  AspectRatio,
  Card,
  CardActions,
  CardContent,
  CardOverflow,
  Grid,
  IconButton,
  Link,
  Typography,
} from "@mui/joy";
import NextLink from "next/link";
import { MdDelete, MdEdit, MdFavoriteBorder } from "react-icons/md";
import { useQuery } from "urql";
import cellar1 from "@/app/public/cellar1.png";
import cellar2 from "@/app/public/cellar2.png";
import cellar3 from "@/app/public/cellar3.png";
import cellar4 from "@/app/public/cellar4.png";
import cellar5 from "@/app/public/cellar5.png";
import Image from "next/image";

const cellarImages = [cellar1, cellar2, cellar3, cellar4, cellar5];

type CellarCardProps = {
  cellar: {
    id: string;
    name: string;
  };
  index: number;
};

const CellarCard = ({ cellar, index }: CellarCardProps) => (
  <Card>
    <CardOverflow>
      <AspectRatio ratio="2">
        <Image
          src={cellarImages[index % 5]}
          alt="An image of a wine cellar"
          fill
        />
      </AspectRatio>
    </CardOverflow>
    <Link component={NextLink} overlay href={`cellars/${cellar.id}/items`}>
      <Typography level="title-lg">{cellar.name}</Typography>
    </Link>
    <CardActions buttonFlex="0 1 120px">
      <IconButton
        variant="outlined"
        color="neutral"
        sx={{ mr: "auto" }}
        disabled
      >
        <MdFavoriteBorder />
      </IconButton>
      <IconButton
        variant="outlined"
        color="neutral"
        sx={{ mr: "auto" }}
        disabled
      >
        <MdEdit />
      </IconButton>
      <IconButton
        variant="outlined"
        color="neutral"
        sx={{ mr: "auto" }}
        disabled
      >
        <MdDelete />
      </IconButton>
    </CardActions>
  </Card>
);

const cellarsQuery = graphql(`
  query GetCellars {
    cellars {
      id
      name
      createdBy {
        displayName
        avatarUrl
      }
    }
  }
`);

const Cellars = () => {
  const [{ data }] = useQuery({ query: cellarsQuery });

  return (
    <Grid container spacing={2} sx={{ flexGrow: 1 }}>
      {data?.cellars.map((x, i) => (
        <Grid key={x.id} xs={12} sm={6} md={4}>
          <CellarCard cellar={x} index={i} />
        </Grid>
      ))}
      <Grid key="add-new-cellar" xs={6} md={4}>
        <Card>
          <CardContent>
            <Link overlay component={NextLink} href={`cellars/add`}>
              <Typography level="title-md">Add a new cellar</Typography>
            </Link>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

export default withAuth(Cellars);

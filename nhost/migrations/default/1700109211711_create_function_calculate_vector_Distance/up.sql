CREATE OR REPLACE FUNCTION public.calculate_vector_distance(item_vector item_vectors, search vector)
 RETURNS double precision
 LANGUAGE sql
 STABLE
AS $function$
  SELECT item_vector.vector <=> search
$function$;

CREATE TABLE public.cellar_user (id int4 GENERATED ALWAYS AS IDENTITY, cellar_id uuid NOT NULL, user_id uuid NOT NULL, PRIMARY KEY (id), FOREIGN KEY (cellar_id) REFERENCES public.cellars (id) ON UPDATE RESTRICT ON DELETE RESTRICT, FOREIGN KEY (user_id) REFERENCES auth.users (id) ON UPDATE RESTRICT ON DELETE RESTRICT);

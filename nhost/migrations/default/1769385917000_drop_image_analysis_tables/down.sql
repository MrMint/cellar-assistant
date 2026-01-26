-- Recreate image_analysis table
CREATE TABLE public.image_analysis (
    id SERIAL PRIMARY KEY,
    file_id UUID NOT NULL REFERENCES storage.files(id) ON DELETE CASCADE,
    text_extraction_status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Recreate image_analysis_text_blocks table
CREATE TABLE public.image_analysis_text_blocks (
    id SERIAL PRIMARY KEY,
    image_analysis_id INTEGER NOT NULL REFERENCES public.image_analysis(id) ON DELETE CASCADE,
    bounding_box POLYGON,
    raw_text TEXT,
    enhanced_text TEXT
);
